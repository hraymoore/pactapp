const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const {
  isTemplateRequestAdmin,
  createRequest,
  listMine,
  listQueue,
  getRequest,
  generateAiDraft,
  updateDraft,
  reject,
  publish,
} = require("../services/template-requests");

router.use(express.json());
router.use(requireAuth);

const TITLE_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 2000;
const URL_FORMAT = /^https?:\/\/\S+$/i;

// Anyone with a profile can suggest a template — this is a feedback/
// suggestion box, not a paid or tier-gated feature.
router.post("/", (req, res) => {
  const { title, genreSuggestion, sourceUrl, notes } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Give the template a name." });
  if (title.trim().length > TITLE_MAX_LENGTH) return res.status(400).json({ error: `Name must be ${TITLE_MAX_LENGTH} characters or fewer.` });
  if (sourceUrl && !URL_FORMAT.test(sourceUrl.trim())) return res.status(400).json({ error: "Source link must be a valid http(s) URL." });
  if (notes && notes.length > NOTES_MAX_LENGTH) return res.status(400).json({ error: `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.` });

  const request = createRequest({
    userId: req.user.id,
    title: title.trim(),
    genreSuggestion: genreSuggestion && genreSuggestion.trim() ? genreSuggestion.trim() : null,
    sourceUrl: sourceUrl && sourceUrl.trim() ? sourceUrl.trim() : null,
    notes: notes && notes.trim() ? notes.trim() : null,
  });
  res.status(201).json({ request });
});

// The requester's own history — status only; draft content stays
// invisible until published (see services/template-requests.js).
router.get("/mine", (req, res) => {
  res.json({
    requests: listMine(req.user.id).map((r) => ({
      id: r.id,
      title: r.title,
      genreSuggestion: r.genre_suggestion,
      sourceUrl: r.source_url,
      status: r.status,
      publishedTemplateId: r.published_template_id,
      publishedTemplateName: r.published_template_name,
      createdAt: r.created_at,
    })),
  });
});

function requireAdmin(req, res, next) {
  if (!isTemplateRequestAdmin(req.user)) return res.status(403).json({ error: "Not authorized." });
  next();
}

router.get("/queue", requireAdmin, (req, res) => {
  res.json({ requests: listQueue() });
});

router.post("/:id/draft", requireAdmin, async (req, res) => {
  const request = getRequest(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  try {
    const updated = await generateAiDraft(request);
    res.json({ request: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put("/:id", requireAdmin, (req, res) => {
  const request = getRequest(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  const { draftBody, draftDescription, draftGenre, draftMinTier, draftKeywords, adminNotes } = req.body || {};
  try {
    const updated = updateDraft(request.id, { draftBody, draftDescription, draftGenre, draftMinTier, draftKeywords, adminNotes });
    res.json({ request: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/:id/publish", requireAdmin, (req, res) => {
  try {
    const request = publish(req.params.id);
    res.json({ request });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/:id/reject", requireAdmin, (req, res) => {
  const request = getRequest(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  const { adminNotes } = req.body || {};
  const updated = reject(request.id, adminNotes && adminNotes.trim() ? adminNotes.trim() : null);
  res.json({ request: updated });
});

module.exports = router;
