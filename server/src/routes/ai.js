const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireTier } = require("../middleware/auth");
const { draftWithAI, analyzeWithAI, aiConfigured } = require("../services/ai-provider");

router.use(express.json());

router.get("/status", requireAuth, (req, res) => res.json({ configured: aiConfigured() }));

router.use(requireAuth, requireTier(["pro", "business"]));

router.post("/draft", async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Describe what you want Pact AI to draft." });
  }
  try {
    const text = await draftWithAI(prompt.trim());
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

  try {
    const text = await analyzeWithAI(contract.body, question);
    res.json({ text });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
