const db = require("../db");
const { sendMail } = require("./mailer");
const { draftWithAI, aiConfigured } = require("./ai-provider");

// Pact has no staff/admin role system yet — same pattern as
// services/attorney-review.js's isReviewAdmin. A separate env var (not
// reused from attorney review) since there's no reason the same person
// has to handle both queues.
function isTemplateRequestAdmin(user) {
  const adminEmail = process.env.TEMPLATE_REQUEST_ADMIN_EMAIL;
  return !!(adminEmail && user && user.email && user.email.toLowerCase() === adminEmail.toLowerCase());
}

const TIER_ORDER = ["free", "starter", "everyday", "pro", "business"];

function createRequest({ userId, title, genreSuggestion, sourceUrl, notes }) {
  const info = db
    .prepare(
      "INSERT INTO template_requests (requested_by_user_id, title, genre_suggestion, source_url, notes) VALUES (?, ?, ?, ?, ?)"
    )
    .run(userId, title, genreSuggestion || null, sourceUrl || null, notes || null);
  const request = db.prepare("SELECT * FROM template_requests WHERE id = ?").get(info.lastInsertRowid);

  const adminEmail = process.env.TEMPLATE_REQUEST_ADMIN_EMAIL;
  if (adminEmail) {
    const requester = db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId);
    sendMail({
      to: adminEmail,
      subject: `New template request: "${title}"`,
      text:
        `${requester.name} <${requester.email}> suggested a new template: "${title}"` +
        `${genreSuggestion ? ` (genre: ${genreSuggestion})` : ""}.\n\n` +
        `${sourceUrl ? `Source: ${sourceUrl}\n\n` : ""}` +
        `Notes: ${notes || "(none)"}\n\n` +
        `Review it: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/template-requests-queue.html`,
    });
  }
  return request;
}

function listMine(userId) {
  return db
    .prepare(
      `SELECT r.*, t.name as published_template_name FROM template_requests r
       LEFT JOIN templates t ON t.id = r.published_template_id
       WHERE r.requested_by_user_id = ? ORDER BY r.created_at DESC`
    )
    .all(userId);
}

function listQueue() {
  return db
    .prepare(
      `SELECT r.*, u.name as requester_name, u.email as requester_email
       FROM template_requests r JOIN users u ON u.id = r.requested_by_user_id
       ORDER BY r.created_at DESC`
    )
    .all();
}

function getRequest(id) {
  return db.prepare("SELECT * FROM template_requests WHERE id = ?").get(id);
}

// AI drafting is a convenience, not a requirement — if ANTHROPIC_API_KEY
// isn't set, the admin can still write draft_body by hand via updateDraft
// below. This never auto-publishes: a human still reviews/edits before
// anything reaches the live template library.
async function generateAiDraft(request) {
  if (!aiConfigured()) {
    const err = new Error("Pact AI is not connected yet. Add ANTHROPIC_API_KEY to server/.env, or write the draft by hand instead.");
    err.status = 501;
    throw err;
  }
  const prompt =
    `Draft a fill-in-the-blank contract template called "${request.title}"` +
    `${request.genre_suggestion ? ` for the "${request.genre_suggestion}" category` : ""}. ` +
    `${request.notes ? `Here's what it should cover, based on an example the requester found: ${request.notes}` : ""} ` +
    `${request.source_url ? `(They found a reference example at ${request.source_url}, but write this from scratch in your own words — do not copy text from that page, since its license is unknown.)` : ""} ` +
    "Use numbered sections and bracketed placeholders like [DATE] or [AMOUNT] for every deal-specific detail, the " +
    "way a real fill-in contract template reads. Keep it genuinely specific to this type of document — a real " +
    "person filling this in should see the actual fields that document needs, not generic boilerplate.";

  const body = await draftWithAI(prompt);
  db.prepare(
    "UPDATE template_requests SET draft_body = ?, status = 'ready_for_review', updated_at = datetime('now') WHERE id = ?"
  ).run(body, request.id);
  return getRequest(request.id);
}

function updateDraft(id, { draftBody, draftDescription, draftGenre, draftMinTier, draftKeywords, adminNotes }) {
  if (draftMinTier !== undefined && draftMinTier !== null && draftMinTier !== "" && !TIER_ORDER.includes(draftMinTier)) {
    const err = new Error(`Tier must be one of: ${TIER_ORDER.join(", ")}.`);
    err.status = 400;
    throw err;
  }
  db.prepare(
    `UPDATE template_requests SET
       draft_body = COALESCE(?, draft_body),
       draft_description = COALESCE(?, draft_description),
       draft_genre = COALESCE(?, draft_genre),
       draft_min_tier = COALESCE(?, draft_min_tier),
       draft_keywords = COALESCE(?, draft_keywords),
       admin_notes = COALESCE(?, admin_notes),
       status = CASE WHEN status = 'pending' AND ? IS NOT NULL THEN 'ready_for_review' ELSE status END,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    draftBody ?? null,
    draftDescription ?? null,
    draftGenre ?? null,
    draftMinTier ?? null,
    draftKeywords ?? null,
    adminNotes ?? null,
    draftBody ?? null,
    id
  );
  return getRequest(id);
}

function reject(id, adminNotes) {
  const request = getRequest(id);
  if (!request) return null;
  db.prepare(
    "UPDATE template_requests SET status = 'rejected', admin_notes = COALESCE(?, admin_notes), updated_at = datetime('now') WHERE id = ?"
  ).run(adminNotes ?? null, id);
  const requester = db.prepare("SELECT name, email FROM users WHERE id = ?").get(request.requested_by_user_id);
  sendMail({
    to: requester.email,
    subject: `Your template suggestion wasn't added: "${request.title}"`,
    text:
      `Thanks for suggesting "${request.title}" — it won't be added to Pact's template library` +
      `${adminNotes ? ` (${adminNotes})` : "."}.`,
  });
  return getRequest(id);
}

// The only thing that actually writes a new row into `templates` from this
// whole flow — everything before this point only edits template_requests.
// Requires a human (the admin) to have already set every field a template
// needs; nothing here invents a genre/tier/description on its own.
function publish(id) {
  const request = getRequest(id);
  if (!request) {
    const err = new Error("Request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status === "published") {
    const err = new Error("This request has already been published.");
    err.status = 409;
    throw err;
  }
  const missing = ["draft_body", "draft_description", "draft_genre", "draft_min_tier"].filter((f) => !request[f]);
  if (missing.length) {
    const err = new Error(`Fill in ${missing.join(", ")} before publishing.`);
    err.status = 400;
    throw err;
  }
  if (!TIER_ORDER.includes(request.draft_min_tier)) {
    const err = new Error(`Tier must be one of: ${TIER_ORDER.join(", ")}.`);
    err.status = 400;
    throw err;
  }

  const info = db
    .prepare("INSERT INTO templates (name, genre, min_tier, description, body, keywords) VALUES (?, ?, ?, ?, ?, ?)")
    .run(request.title, request.draft_genre, request.draft_min_tier, request.draft_description, request.draft_body, request.draft_keywords || "");

  db.prepare(
    "UPDATE template_requests SET status = 'published', published_template_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(info.lastInsertRowid, id);

  const requester = db.prepare("SELECT name, email FROM users WHERE id = ?").get(request.requested_by_user_id);
  sendMail({
    to: requester.email,
    subject: `Your template suggestion is now live: "${request.title}"`,
    text: `"${request.title}" is now available in Pact's template library, thanks to your suggestion. Find it under ${request.draft_genre}.`,
  });

  return getRequest(id);
}

module.exports = {
  isTemplateRequestAdmin,
  createRequest,
  listMine,
  listQueue,
  getRequest,
  generateAiDraft,
  updateDraft,
  reject,
  publish,
};
