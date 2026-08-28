const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { billingConfigured, createAttorneyReviewCheckoutSession } = require("../services/billing-provider");
const { ATTORNEY_REVIEW_FEE_CENTS, isReviewAdmin, createRequest, markPaid } = require("../services/attorney-review");
const { resolveAccess } = require("./contracts");

router.use(express.json());
router.use(requireAuth);

router.get("/fee", (req, res) => res.json({ amountCents: ATTORNEY_REVIEW_FEE_CENTS }));

router.post("/", async (req, res) => {
  const { contractId, notes } = req.body || {};
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId);
  if (!contract) return res.status(404).json({ error: "Contract not found." });
  const access = resolveAccess(contract, req.user);
  if (access !== "owner" && access !== "edit") {
    return res.status(403).json({ error: "You need edit access to this contract to request a review." });
  }

  const request = createRequest({ contractId: contract.id, userId: req.user.id, notes });

  if (!billingConfigured()) {
    const paid = markPaid(request.id, null);
    return res.json({
      mode: "direct",
      request: paid,
      note: "Stripe is not configured yet — this request was marked paid directly so you can keep testing. Add STRIPE_SECRET_KEY to server/.env to collect a real fee.",
    });
  }

  try {
    const fullUser = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const session = await createAttorneyReviewCheckoutSession({
      requestId: request.id,
      contractName: contract.name,
      priceCents: ATTORNEY_REVIEW_FEE_CENTS,
      user: fullUser,
      req,
    });
    res.json({ mode: "stripe", url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The requester's own history — what they've asked for and its status.
router.get("/mine", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, c.name as contract_name FROM attorney_review_requests r
       JOIN contracts c ON c.id = r.contract_id
       WHERE r.requested_by_user_id = ? ORDER BY r.created_at DESC`
    )
    .all(req.user.id);
  res.json({ requests: rows });
});

// Every request across every user — gated by ATTORNEY_REVIEW_ADMIN_EMAIL
// since Pact has no staff/admin role system yet (see services/attorney-review.js).
router.get("/queue", (req, res) => {
  if (!isReviewAdmin(req.user)) return res.status(403).json({ error: "Not authorized." });
  const rows = db
    .prepare(
      `SELECT r.*, c.name as contract_name, c.genre, c.state, u.name as requester_name, u.email as requester_email
       FROM attorney_review_requests r
       JOIN contracts c ON c.id = r.contract_id
       JOIN users u ON u.id = r.requested_by_user_id
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ requests: rows });
});

router.put("/:id/status", (req, res) => {
  if (!isReviewAdmin(req.user)) return res.status(403).json({ error: "Not authorized." });
  const { status } = req.body || {};
  if (!["pending", "in_review", "completed", "canceled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const request = db.prepare("SELECT * FROM attorney_review_requests WHERE id = ?").get(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  db.prepare("UPDATE attorney_review_requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, request.id);
  res.json({ ok: true });
});

module.exports = router;
