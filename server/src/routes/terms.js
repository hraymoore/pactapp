const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { CURRENT_TERMS_VERSION, recordAcceptance, needsAcceptance, clientIp } = require("../services/terms");

router.use(express.json());
router.use(requireAuth);

// Checked once per session boot (dashboard.html) rather than folded into
// every request via middleware — a terms_acceptances lookup on literally
// every authenticated call would be wasted work for something that changes
// at most a few times a year.
router.get("/status", (req, res) => {
  res.json({ currentVersion: CURRENT_TERMS_VERSION, mustAccept: needsAcceptance(req.user.id) });
});

router.post("/accept", (req, res) => {
  recordAcceptance({
    userId: req.user.id,
    ipAddress: clientIp(req),
    acceptanceMethod: (req.body && req.body.acceptanceMethod) || "checkbox_reaccept",
  });
  res.json({ ok: true, version: CURRENT_TERMS_VERSION });
});

module.exports = router;
