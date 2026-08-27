const express = require("express");
const router = express.Router();
const db = require("../db");
const { US_STATES } = require("../us-states");

router.get("/genres", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT genre FROM templates ORDER BY genre").all();
  res.json({ genres: rows.map((r) => r.genre) });
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

module.exports = router;
