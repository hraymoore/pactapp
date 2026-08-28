const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  billingConfigured,
  createCheckoutSession,
  createBillingPortalSession,
  applyTierFromSession,
  syncSubscriptionUpdate,
  downgradeOnCancellation,
} = require("../services/billing-provider");
const { fulfillPurchase } = require("../services/purchases");
const { markPaid: markAttorneyReviewPaid } = require("../services/attorney-review");

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
      if (session.metadata && session.metadata.type === "attorney_review") {
        markAttorneyReviewPaid(Number(session.metadata.requestId), session.id);
      } else if (session.metadata && session.metadata.purchaseType) {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.metadata.userId);
        if (user) {
          try {
            fulfillPurchase({
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              templateId: Number(session.metadata.templateId),
              purchaseType: session.metadata.purchaseType,
              stripeSessionId: session.id,
              state: session.metadata.state || undefined,
            });
          } catch (fulfillErr) {
            // Stripe retries webhook delivery on anything but a 2xx, and
            // can redeliver an event it already sent successfully —
            // purchases.stripe_session_id is UNIQUE, so a duplicate
            // delivery hits a constraint error here. Treat that as an
            // already-fulfilled no-op instead of failing the webhook
            // (which would just make Stripe retry forever); anything
            // else is a real error worth surfacing.
            if (!/UNIQUE constraint failed/i.test(fulfillErr.message)) throw fulfillErr;
          }
        }
      } else {
        applyTierFromSession(db, session);
      }
    } else if (event.type === "customer.subscription.updated") {
      syncSubscriptionUpdate(db, event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      downgradeOnCancellation(db, event.data.object);
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
    const fullUser = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const result = await createCheckoutSession({ tier, priceCents: TIER_PRICE_CENTS[tier], user: fullUser, req });
    if (result.mode === "updated") {
      db.prepare("UPDATE users SET tier = ? WHERE id = ?").run(tier, req.user.id);
      return res.json({ mode: "updated", tier, note: "Your existing subscription was updated to the new tier — no new charge to check out." });
    }
    res.json({ mode: "stripe", url: result.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal", requireAuth, async (req, res) => {
  if (!billingConfigured()) {
    return res.status(501).json({ error: "Billing is not connected yet." });
  }
  try {
    const fullUser = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const session = await createBillingPortalSession({ user: fullUser, req });
    res.json({ url: session.url });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
