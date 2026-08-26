const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/genres", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT genre FROM templates ORDER BY genre").all();
  res.json({ genres: rows.map((r) => r.genre) });
});

router.get("/", (req, res) => {
  const { genre, q } = req.query;
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

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT id, name, genre, min_tier, description, keywords FROM templates ${where} ORDER BY genre, name`)
    .all(params);
  res.json({ templates: rows });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Template not found." });
  res.json({ template: row });
});

module.exports = router;
