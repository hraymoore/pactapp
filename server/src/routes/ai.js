const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireTier } = require("../middleware/auth");
const { draftWithAI, analyzeWithAI, chatWithAI, aiConfigured } = require("../services/ai-provider");
const { resolveAccess } = require("./contracts");
const { logAiInteraction, isRestrictedRequest, RESTRICTED_RESPONSE } = require("../services/ai-guardrails");

router.use(express.json());

router.get("/status", requireAuth, (req, res) => res.json({ configured: aiConfigured() }));

router.use(requireAuth, requireTier(["pro", "business"]));

router.post("/draft", async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Describe what you want Pact AI to draft." });
  }
  const trimmedPrompt = prompt.trim();

  if (isRestrictedRequest(trimmedPrompt)) {
    logAiInteraction({ userId: req.user.id, type: "draft", input: trimmedPrompt, output: RESTRICTED_RESPONSE, blocked: true });
    return res.json({ text: RESTRICTED_RESPONSE, restricted: true });
  }

  try {
    const text = await draftWithAI(trimmedPrompt);
    logAiInteraction({ userId: req.user.id, type: "draft", input: trimmedPrompt, output: text });
    res.json({ text });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/analyze", async (req, res) => {
  const { contractId, question } = req.body || {};
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId);
  if (!contract) return res.status(404).json({ error: "Contract not found." });

  const isOwner = contract.owner_id === req.user.id;
  const isParty = !!db
    .prepare("SELECT id FROM contract_parties WHERE contract_id = ? AND email = ?")
    .get(contract.id, req.user.email);
  if (!isOwner && !isParty) return res.status(403).json({ error: "You do not have access to this contract." });

  if (contract.ai_restricted) {
    logAiInteraction({
      userId: req.user.id,
      contractId: contract.id,
      type: "analyze",
      input: question || "(default analysis)",
      output: RESTRICTED_RESPONSE,
      blocked: true,
    });
    return res.json({ text: RESTRICTED_RESPONSE, restricted: true });
  }

  try {
    const text = await analyzeWithAI(contract.body, question);
    logAiInteraction({ userId: req.user.id, contractId: contract.id, type: "analyze", input: question || "(default analysis)", output: text });
    res.json({ text });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/chat", async (req, res) => {
  const { messages, contractId } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Send at least one message." });
  }
  const lastUserMessage = [...messages].reverse().find((m) => m.role !== "assistant");

  let contractContext = null;
  let contract = null;
  if (contractId) {
    contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId);
    if (!contract) return res.status(404).json({ error: "Contract not found." });
    if (!resolveAccess(contract, req.user)) {
      return res.status(403).json({ error: "You do not have access to this contract." });
    }
    contractContext = { name: contract.name, body: contract.body };
  }

  const isRestricted = (contract && contract.ai_restricted) || (!contract && isRestrictedRequest(lastUserMessage && lastUserMessage.content));
  if (isRestricted) {
    logAiInteraction({
      userId: req.user.id,
      contractId: contract ? contract.id : null,
      type: "chat",
      input: (lastUserMessage && lastUserMessage.content) || "",
      output: RESTRICTED_RESPONSE,
      blocked: true,
    });
    return res.json({ text: RESTRICTED_RESPONSE, restricted: true });
  }

  try {
    const text = await chatWithAI(messages, contractContext);
    logAiInteraction({
      userId: req.user.id,
      contractId: contract ? contract.id : null,
      type: "chat",
      input: (lastUserMessage && lastUserMessage.content) || "",
      output: text,
    });
    res.json({ text });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// The durable AI-interaction log the guardrails require — a user's own
// draft/analyze/chat history, including blocked (restricted-category)
// attempts, independent of which contract (if any) each call touched.
router.get("/audit", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM ai_audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(req.user.id);
  res.json({ audit: rows });
});

module.exports = router;
