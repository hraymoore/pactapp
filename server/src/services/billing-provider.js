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

// A one-time, non-renewing payment that grants a subscription tier's full
// feature set for 12 months — an alternative on-ramp to Professional/
// Enterprise for someone who'd rather pay once than be billed monthly.
// Unlike createOneTimeCheckoutSession (which fulfills a template purchase),
// this applies a real tier change on success, tracked via tier_expires_at
// instead of a Stripe subscription id.
async function createAnnualPassCheckoutSession({ tier, priceCents, user, req }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  const customerId = await getOrCreateCustomer(user);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Pact — ${label} Annual Pass (12 months, one-time payment)` },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/dashboard.html?upgraded=1`,
    cancel_url: `${origin}/pricing.html`,
    metadata: { userId: String(user.id), type: "annual_pass", tier },
  });
  return session;
}

// A contract payment, unlike every other charge in this file, is never a
// Checkout Session — the spec calls for Stripe's embedded Payment Element
// so card AND ACH both work inline on the contract page, which needs a
// PaymentIntent the client confirms directly. This is a "destination
// charge": created on the PLATFORM's own Stripe account (no Stripe-Account
// header, no OAuth per request) with transfer_data.destination pointing
// at the payee's connected account, so Stripe moves the money straight
// from payer -> Stripe -> payee's account. Pact's own balance never holds
// or pools any of it — the only money Pact ever sees is application_fee_
// amount, and only if PLATFORM_FEE_PERCENT is non-zero.
async function createPaymentRequestIntent({ amountCents, currency, payeeAccountId, applicationFeeCents, metadata }) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    automatic_payment_methods: { enabled: true },
    transfer_data: { destination: payeeAccountId },
    application_fee_amount: applicationFeeCents > 0 ? applicationFeeCents : undefined,
    metadata,
  });
}

// Stripe webhook handler for a completed annual-pass Checkout session —
// applies the tier and starts a fresh 365-day clock. A repeat purchase
// (renewing before or after lapsing) simply resets the expiry rather than
// stacking time, matching how a subscription renewal just keeps billing
// rather than accumulating "extra" months.
function applyAnnualPass(db, session) {
  const userId = session.metadata && session.metadata.userId;
  const tier = session.metadata && session.metadata.tier;
  if (!userId || !tier) return;
  db.prepare(
    "UPDATE users SET tier = ?, tier_expires_at = datetime('now', '+365 days'), annual_pass_reminder_sent_at = NULL WHERE id = ?"
  ).run(tier, userId);
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
    "UPDATE users SET tier = ?, stripe_subscription_id = ?, stripe_subscription_status = 'active', tier_expires_at = NULL, annual_pass_reminder_sent_at = NULL WHERE id = ?"
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
    "UPDATE users SET tier = 'starter', stripe_subscription_id = NULL, stripe_subscription_status = 'canceled', tier_expires_at = NULL, annual_pass_reminder_sent_at = NULL WHERE id = ?"
  ).run(userId);
}

// Creates the Stripe Connect Express account a user needs before they can
// RECEIVE a contract payment through Pact (see services/payments.js).
// Express, not Standard/Custom, because Stripe hosts the entire identity/
// bank-details flow itself — Pact never collects or stores that
// information. Idempotent: returns the existing account id if one was
// already created for this user.
async function getOrCreateConnectedAccount(user) {
  if (user.stripe_connected_account_id) return user.stripe_connected_account_id;
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email: user.email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_type: "individual",
    metadata: { userId: String(user.id) },
  });
  db.prepare("UPDATE users SET stripe_connected_account_id = ? WHERE id = ?").run(account.id, user.id);
  return account.id;
}

// Stripe-hosted onboarding (identity, bank account) for a Connect Express
// account. refresh_url is used if the link itself expires mid-flow;
// return_url is where Stripe sends them back when they finish or exit —
// either way we re-check the account's real status rather than trusting
// the redirect alone (see routes/payments.js's GET /connect/status).
async function createConnectOnboardingLink({ user, req }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const accountId = await getOrCreateConnectedAccount(user);
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard.html?section=settings&connectRefresh=1`,
    return_url: `${origin}/dashboard.html?section=settings&connectReturn=1`,
    type: "account_onboarding",
  });
  return link.url;
}

// Pulls the connected account's current charges_enabled/payouts_enabled
// straight from Stripe and syncs it locally — called right after the user
// returns from onboarding (the account.updated webhook will eventually
// say the same thing, but polling once on return avoids a window where
// the UI still shows "not set up" immediately after they finish).
async function refreshConnectedAccountStatus(user) {
  if (!user.stripe_connected_account_id) return { chargesEnabled: false, payoutsEnabled: false };
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(user.stripe_connected_account_id);
  syncConnectedAccountStatus(db, account);
  return { chargesEnabled: !!account.charges_enabled, payoutsEnabled: !!account.payouts_enabled };
}

// account.updated webhook — the only place charges_enabled/payouts_enabled
// are actually trusted from; never set from a client request.
function syncConnectedAccountStatus(db, account) {
  db.prepare(
    "UPDATE users SET stripe_charges_enabled = ?, stripe_payouts_enabled = ? WHERE stripe_connected_account_id = ?"
  ).run(account.charges_enabled ? 1 : 0, account.payouts_enabled ? 1 : 0, account.id);
}

module.exports = {
  billingConfigured,
  getOrCreateCustomer,
  createCheckoutSession,
  createOneTimeCheckoutSession,
  createAnnualPassCheckoutSession,
  applyAnnualPass,
  createAttorneyReviewCheckoutSession,
  createBillingPortalSession,
  applyTierFromSession,
  syncSubscriptionUpdate,
  downgradeOnCancellation,
  cancelSubscriptionImmediately,
  getOrCreateConnectedAccount,
  createConnectOnboardingLink,
  refreshConnectedAccountStatus,
  syncConnectedAccountStatus,
  createPaymentRequestIntent,
  getStripe,
};
