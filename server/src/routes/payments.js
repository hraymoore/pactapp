const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { billingConfigured, createConnectOnboardingLink, refreshConnectedAccountStatus } = require("../services/billing-provider");

router.use(express.json());

// The frontend needs a publishable key to mount Stripe's Payment Element —
// never the secret key, which never leaves the server.
router.get("/config", (req, res) => {
  res.json({ configured: billingConfigured(), publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
});

router.use(requireAuth);

router.get("/connect/status", async (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!billingConfigured() || !user.stripe_connected_account_id) {
    return res.json({ connected: false, chargesEnabled: false, payoutsEnabled: false });
  }
  try {
    const status = await refreshConnectedAccountStatus(user);
    res.json({ connected: true, chargesEnabled: status.chargesEnabled, payoutsEnabled: status.payoutsEnabled });
  } catch (err) {
    // Fall back to the last webhook-synced values rather than failing the
    // whole status check if Stripe is briefly unreachable.
    res.json({ connected: true, chargesEnabled: !!user.stripe_charges_enabled, payoutsEnabled: !!user.stripe_payouts_enabled });
  }
});

router.post("/connect/onboarding-link", async (req, res) => {
  if (!billingConfigured()) return res.status(501).json({ error: "Billing is not connected yet." });
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const url = await createConnectOnboardingLink({ user, req });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
