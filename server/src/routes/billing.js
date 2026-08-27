const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { billingConfigured, createCheckoutSession, applyTierFromSession } = require("../services/billing-provider");
const { fulfillPurchase } = require("../services/purchases");

const TIER_PRICE_CENTS = { starter: 799, everyday: 1199, pro: 2099, business: 8999 };

// Stripe requires the raw body for signature verification, so this route is
// registered with express.raw() ahead of the global express.json() parser
// in index.js and must not use requireAuth (Stripe calls it directly).
router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ error: "STRIPE_WEBHOOK_SECRET is not configured." });
  }
  try {
    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata && session.metadata.purchaseType) {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.metadata.userId);
        if (user) {
          fulfillPurchase({
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            templateId: Number(session.metadata.templateId),
            purchaseType: session.metadata.purchaseType,
            stripeSessionId: session.id,
            state: session.metadata.state || undefined,
          });
        }
      } else {
        applyTierFromSession(db, session);
      }
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }
});

router.use(express.json());

router.get("/status", requireAuth, (req, res) => res.json({ configured: billingConfigured() }));

router.post("/checkout", requireAuth, async (req, res) => {
  const { tier } = req.body || {};
  if (!TIER_PRICE_CENTS[tier]) return res.status(400).json({ error: "Unknown tier." });

  if (!billingConfigured()) {
    db.prepare("UPDATE users SET tier = ? WHERE id = ?").run(tier, req.user.id);
    return res.json({
      mode: "direct",
      tier,
      note: "Stripe is not configured yet — your tier was updated directly so you can keep testing. Add STRIPE_SECRET_KEY to server/.env to collect real payment.",
    });
  }

  try {
    const session = await createCheckoutSession({ tier, priceCents: TIER_PRICE_CENTS[tier], user: req.user, req });
    res.json({ mode: "stripe", url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
