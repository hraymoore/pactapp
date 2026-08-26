const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  identityConfigured,
  createVerificationSession,
  retrieveVerificationSession,
} = require("../services/identity-provider");

// Public — Stripe calls this directly with a raw, signature-verified body.
router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ error: "STRIPE_WEBHOOK_SECRET is not configured." });
  }
  try {
    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
    if (event.type.startsWith("identity.verification_session.")) {
      const session = event.data.object;
      const status = session.status === "verified" ? "verified" : session.status === "canceled" ? "failed" : "pending";
      const verifiedName =
        session.verified_outputs && session.verified_outputs.first_name
          ? `${session.verified_outputs.first_name} ${session.verified_outputs.last_name || ""}`.trim()
          : null;
      db.prepare(
        "UPDATE identity_verifications SET status = ?, verified_name = COALESCE(?, verified_name), updated_at = datetime('now') WHERE external_session_id = ?"
      ).run(status, verifiedName, session.id);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }
});

router.use(express.json());
router.use(requireAuth);

router.get("/status", (req, res) => {
  const row = db
    .prepare("SELECT * FROM identity_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(req.user.id);
  res.json({ configured: identityConfigured(), verification: row || null });
});

router.post("/start", async (req, res) => {
  if (!identityConfigured()) {
    return res.status(501).json({
      error:
        "Identity verification is not connected yet. Add STRIPE_SECRET_KEY to server/.env to enable it via Stripe Identity.",
    });
  }
  const type = req.body && req.body.type === "id_number" ? "id_number" : "document";
  try {
    const session = await createVerificationSession({ user: req.user, req, type });
    db.prepare(
      "INSERT INTO identity_verifications (user_id, provider, external_session_id, status) VALUES (?, 'stripe_identity', ?, 'pending')"
    ).run(req.user.id, session.id);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polling fallback for local development where Stripe can't reach a webhook
// on localhost — production should rely on /webhook instead.
router.post("/refresh", async (req, res) => {
  if (!identityConfigured()) return res.status(501).json({ error: "Identity verification is not connected." });
  const row = db
    .prepare("SELECT * FROM identity_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(req.user.id);
  if (!row || !row.external_session_id) return res.status(404).json({ error: "No verification in progress." });

  try {
    const session = await retrieveVerificationSession(row.external_session_id);
    const status = session.status === "verified" ? "verified" : session.status === "canceled" ? "failed" : "pending";
    const verifiedName =
      session.verified_outputs && session.verified_outputs.first_name
        ? `${session.verified_outputs.first_name} ${session.verified_outputs.last_name || ""}`.trim()
        : row.verified_name;
    db.prepare(
      "UPDATE identity_verifications SET status = ?, verified_name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, verifiedName, row.id);
    res.json({ status, verifiedName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
