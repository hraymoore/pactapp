const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { recordConsent, hasConsented } = require("../services/esign-consent");
const { clientIp } = require("../services/terms");

router.use(express.json());
router.use(requireAuth);

router.get("/status", (req, res) => {
  res.json({ hasConsented: hasConsented(req.user.id) });
});

router.post("/accept", (req, res) => {
  recordConsent({ userId: req.user.id, ipAddress: clientIp(req) });
  res.json({ ok: true });
});

module.exports = router;
