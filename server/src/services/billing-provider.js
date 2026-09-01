const db = require("../db");

function billingConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function getStripe() {
  const Stripe = require("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Reuse one Stripe Customer per Pact profile instead of letting Checkout
// create a new one on every session (the default when you pass
// customer_email instead of customer) — required for the billing portal,
// for updating an existing subscription in place, and for Stripe's own
// fraud/analytics tooling to treat repeat purchases as the same customer.
async function getOrCreateCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const stripe = getStripe();
  const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: String(user.id) } });
  db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customer.id, user.id);
  return customer.id;
}

async function createCheckoutSession({ tier, priceCents, user, req }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  const customerId = await getOrCreateCustomer(user);

  // A user with an active subscription who picks a different tier is
  // changing plans, not buying a second one — update the existing
  // subscription's price in place (with proration) instead of sending
  // them through Checkout again, which would create a second, overlapping
  // subscription and double-bill them.
  if (user.stripe_subscription_id) {
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    if (subscription.status === "active" || subscription.status === "trialing") {
      const updated = await stripe.subscriptions.update(user.stripe_subscription_id, {
        items: [
          {
            id: subscription.items.data[0].id,
            price_data: {
              currency: "usd",
              product_data: { name: `Pact — ${label} tier` },
              recurring: { interval: "month" },
              unit_amount: priceCents,
            },
          },
        ],
        proration_behavior: "create_prorations",
        metadata: { userId: String(user.id), tier },
      });
      return { mode: "updated", subscription: updated };
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Pact — ${label} tier` },
          recurring: { interval: "month" },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    subscription_data: { metadata: { userId: String(user.id), tier } },
    success_url: `${origin}/dashboard.html?upgraded=1`,
    cancel_url: `${origin}/pricing.html`,
    metadata: { userId: String(user.id), tier },
  });
  return { mode: "checkout", url: session.url };
}

// One-time purchase (not a subscription): $3.99 download-only or $7.99
// editable, priced per template.
async function createOneTimeCheckoutSession({ template, purchaseType, priceCents, user, req, state }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const label = purchaseType === "edit" ? "editable, one-time purchase" : "blank, download-only";
  const customerId = await getOrCreateCustomer(user);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Pact — ${template.name} (${label})` },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/dashboard.html?purchased=1`,
    cancel_url: `${origin}/templates.html`,
    metadata: { userId: String(user.id), templateId: String(template.id), purchaseType, state: state || "" },
  });
  return session;
}

// Flat-fee, one-time payment for a human attorney to review one contract —
// same "payment" Checkout mode as a template purchase, different metadata
// so the webhook routes it to fulfillAttorneyReviewPayment instead.
async function createAttorneyReviewCheckoutSession({ requestId, contractName, priceCents, user, req }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const customerId = await getOrCreateCustomer(user);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Pact — Attorney review: ${contractName}` },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/dashboard.html?reviewRequested=1`,
    cancel_url: `${origin}/dashboard.html`,
    metadata: { type: "attorney_review", requestId: String(requestId) },
  });
  return session;
}

// Stripe's hosted portal for a customer to update their payment method,
// view invoices, or cancel their own subscription — without emailing us.
async function createBillingPortalSession({ user, req }) {
  if (!user.stripe_customer_id) {
    const err = new Error("No billing account on file yet — subscribe to a tier first.");
    err.status = 400;
    throw err;
  }
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/dashboard.html`,
  });
  return session;
}

// Called when a user closes their Pact account — cancels immediately
// (not "at period end") since closing an account means "stop charging me
// now," not "let me finish out what I already paid for." Best-effort: a
// Stripe outage or an already-canceled subscription shouldn't block the
// account closure itself, so the caller decides what to do with a failure
// here rather than this throwing and aborting the close.
async function cancelSubscriptionImmediately(user) {
  if (!billingConfigured() || !user.stripe_subscription_id) return { canceled: false };
  const stripe = getStripe();
  await stripe.subscriptions.cancel(user.stripe_subscription_id);
  return { canceled: true };
}

// Call this from the Stripe webhook handler once STRIPE_WEBHOOK_SECRET is
// configured and `checkout.session.completed` events are verified — it
// applies the tier chosen at checkout and records the subscription id so
// future upgrades/downgrades update it in place instead of stacking.
function applyTierFromSession(db, session) {
  const userId = session.metadata && session.metadata.userId;
  const tier = session.metadata && session.metadata.tier;
  if (!userId || !tier) return;
  db.prepare(
    "UPDATE users SET tier = ?, stripe_subscription_id = ?, stripe_subscription_status = 'active' WHERE id = ?"
  ).run(tier, session.subscription || null, userId);
}

// customer.subscription.updated — keeps tier and status in sync with
// whatever Stripe (or the customer, via the billing portal) changed,
// including a plan change we didn't initiate ourselves.
function syncSubscriptionUpdate(db, subscription) {
  const userId = subscription.metadata && subscription.metadata.userId;
  const tier = subscription.metadata && subscription.metadata.tier;
  if (!userId) return;
  if (tier) {
    db.prepare("UPDATE users SET tier = ?, stripe_subscription_status = ? WHERE id = ?").run(
      tier,
      subscription.status,
      userId
    );
  } else {
    db.prepare("UPDATE users SET stripe_subscription_status = ? WHERE id = ?").run(subscription.status, userId);
  }
}

// customer.subscription.deleted — a subscription can end without Pact
// initiating it (the customer cancels via the billing portal, a renewal
// payment fails past Stripe's retry schedule, etc.). Without this, a
// canceled subscriber would keep their paid tier forever.
function downgradeOnCancellation(db, subscription) {
  const userId = subscription.metadata && subscription.metadata.userId;
  if (!userId) return;
  db.prepare(
    "UPDATE users SET tier = 'starter', stripe_subscription_id = NULL, stripe_subscription_status = 'canceled' WHERE id = ?"
  ).run(userId);
}

module.exports = {
  billingConfigured,
  getOrCreateCustomer,
  createCheckoutSession,
  createOneTimeCheckoutSession,
  createAttorneyReviewCheckoutSession,
  createBillingPortalSession,
  applyTierFromSession,
  syncSubscriptionUpdate,
  downgradeOnCancellation,
  cancelSubscriptionImmediately,
};
