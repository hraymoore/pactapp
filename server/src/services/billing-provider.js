function billingConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function getStripe() {
  const Stripe = require("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function createCheckoutSession({ tier, priceCents, user, req }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
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
    success_url: `${origin}/dashboard.html?upgraded=1`,
    cancel_url: `${origin}/pricing.html`,
    metadata: { userId: String(user.id), tier },
  });
  return session;
}

// Call this from the Stripe webhook handler once STRIPE_WEBHOOK_SECRET is
// configured and `checkout.session.completed` events are verified — it
// applies the tier chosen at checkout to the paying user.
function applyTierFromSession(db, session) {
  const userId = session.metadata && session.metadata.userId;
  const tier = session.metadata && session.metadata.tier;
  if (!userId || !tier) return;
  db.prepare("UPDATE users SET tier = ? WHERE id = ?").run(tier, userId);
}

module.exports = { billingConfigured, createCheckoutSession, applyTierFromSession };
