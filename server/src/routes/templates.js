const express = require("express");
const router = express.Router();
const db = require("../db");
const { US_STATES } = require("../us-states");
const { requireAuth } = require("../middleware/auth");
const { renderBlankTemplatePdf } = require("../services/pdf");

router.get("/genres", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT genre FROM templates ORDER BY genre").all();
  res.json({ genres: rows.map((r) => r.genre) });
});

// Public counts for marketing copy (index.html's hero stats) — computed
// from the live template table instead of a hand-typed number, so the two
// can never drift the way "39+ templates" / "12 genres" had before this.
router.get("/stats", (req, res) => {
  const { count: templateCount } = db.prepare("SELECT COUNT(*) as count FROM templates").get();
  const { count: genreCount } = db.prepare("SELECT COUNT(DISTINCT genre) as count FROM templates").get();
  res.json({ templateCount, genreCount });
});

// The full state list for the governing-law selector, plus which states
// currently have deep, state-specific template coverage (beyond the
// generic 'ALL' fallback every state can already use).
router.get("/states", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT state FROM templates WHERE state != 'ALL' ORDER BY state").all();
  res.json({ states: US_STATES, deepCoverageStates: rows.map((r) => r.state) });
});

router.get("/", (req, res) => {
  const { genre, q, state } = req.query;
  const clauses = [];
  const params = {};

  if (genre && genre !== "All") {
    clauses.push("genre = @genre");
    params.genre = genre;
  }
  if (q && q.trim()) {
    clauses.push("(name LIKE @q OR genre LIKE @q OR description LIKE @q OR keywords LIKE @q)");
    params.q = `%${q.trim()}%`;
  }
  // A state filter shows that state's deep templates *and* the generic
  // multi-state ones — never just the generic ones alone, so choosing a
  // state never hides state-specific coverage that exists for it.
  if (state && state !== "All") {
    clauses.push("(state = @state OR state = 'ALL')");
    params.state = state;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT id, name, genre, min_tier, description, keywords, state, ai_restricted FROM templates ${where} ORDER BY genre, name`
    )
    .all(params);
  res.json({ templates: rows });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Template not found." });
  res.json({ template: row });
});

// Free-tier preview: a blank, unsigned copy of any template's raw text —
// available to every profile at every tier, no purchase, no contract
// record created. Distinct from the $3.99 "download only" one-time
// purchase in purchases.js: that one creates a tracked `purchases` row
// (and, for the $7.99 "edit" purchase, a real usable contract) — this is
// just a reference copy, reusing the same PDF renderer since the blank
// template text is identical either way.
router.get("/:id/preview.pdf", requireAuth, (req, res) => {
  const template = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!template) return res.status(404).json({ error: "Template not found." });
  renderBlankTemplatePdf(template)
    .then((pdfBytes) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${template.name.replace(/[^a-z0-9]+/gi, "_")}_preview.pdf"`
      );
      res.send(Buffer.from(pdfBytes));
    })
    .catch((err) => {
      console.error("[pact] Template preview PDF generation failed:", err);
      res.status(500).json({ error: "Failed to generate PDF." });
    });
});

module.exports = router;
