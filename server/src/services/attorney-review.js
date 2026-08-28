const db = require("../db");
const { sendMail } = require("./mailer");
const { logAudit } = require("./signing");

// $99 flat fee, regardless of contract complexity or state — a placeholder
// price point, not a researched market rate. Adjust once you know what an
// actual attorney review costs you to fulfill.
const ATTORNEY_REVIEW_FEE_CENTS = 9900;

// Pact has no staff/admin role system yet — this is the whole "who can see
// every request" gate for now. Set ATTORNEY_REVIEW_ADMIN_EMAIL to your own
// Pact login email to unlock website/attorney-queue.html.
function isReviewAdmin(user) {
  const adminEmail = process.env.ATTORNEY_REVIEW_ADMIN_EMAIL;
  return !!(adminEmail && user && user.email && user.email.toLowerCase() === adminEmail.toLowerCase());
}

function createRequest({ contractId, userId, notes }) {
  const info = db
    .prepare(
      "INSERT INTO attorney_review_requests (contract_id, requested_by_user_id, notes, amount_cents) VALUES (?, ?, ?, ?)"
    )
    .run(contractId, userId, notes || null, ATTORNEY_REVIEW_FEE_CENTS);
  return db.prepare("SELECT * FROM attorney_review_requests WHERE id = ?").get(info.lastInsertRowid);
}

// Called once payment is confirmed — directly (Stripe unconfigured, same
// "direct mode" fallback every other purchase uses) or from the webhook
// once a real checkout.session.completed event arrives.
function markPaid(requestId, stripeSessionId) {
  db.prepare(
    "UPDATE attorney_review_requests SET payment_status = 'paid', stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(stripeSessionId || null, requestId);

  const request = db
    .prepare(
      `SELECT r.*, c.name as contract_name, u.name as requester_name, u.email as requester_email
       FROM attorney_review_requests r
       JOIN contracts c ON c.id = r.contract_id
       JOIN users u ON u.id = r.requested_by_user_id
       WHERE r.id = ?`
    )
    .get(requestId);
  if (!request) return null;

  logAudit(request.contract_id, { name: request.requester_name, email: request.requester_email }, "attorney_review_requested", `Attorney review requested and paid (#${request.id}).`);

  const notifyEmail = process.env.ATTORNEY_REVIEW_ADMIN_EMAIL;
  if (notifyEmail) {
    sendMail({
      to: notifyEmail,
      subject: `New attorney review request: "${request.contract_name}"`,
      text:
        `${request.requester_name} <${request.requester_email}> paid for an attorney review of "${request.contract_name}".\n\n` +
        `Notes: ${request.notes || "(none)"}\n\n` +
        `Manage it: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/attorney-queue.html`,
    });
  }
  return request;
}

module.exports = { ATTORNEY_REVIEW_FEE_CENTS, isReviewAdmin, createRequest, markPaid };
