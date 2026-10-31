const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { savePreferences } = require("../services/notification-prefs");
const { publicUser } = require("../services/public-user");

router.use(express.json());
router.use(requireAuth);

// Not a "sensitive action" under spec 1.3 (that list is credentials/
// contact/payout/export) — notification preferences aren't security- or
// money-relevant, just an ordinary settings save, like the profile PUT.
router.put("/preferences", (req, res) => {
  savePreferences(req.user.id, req.body || {});
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: publicUser(updated) });
});

module.exports = router;
