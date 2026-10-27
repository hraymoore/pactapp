const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { getUpcomingRenewals, REMINDER_INTERVALS_DAYS } = require("../services/renewals");

router.use(requireAuth);

// The "calendar of every key date" view — every contract/archive item
// the user can see that has a renewal/expiration date at all, sorted by
// urgency (overdue first). Filtering by horizon (e.g. "only show the
// next 30 days") is left to the client, same as the contract list's
// other filter chips — the full set is cheap enough to send at once.
router.get("/", (req, res) => {
  res.json({ items: getUpcomingRenewals(req.user), reminderIntervalsDays: REMINDER_INTERVALS_DAYS });
});

module.exports = router;
