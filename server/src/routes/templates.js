const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/genres", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT genre FROM templates ORDER BY genre").all();
  res.json({ genres: rows.map((r) => r.genre) });
});

router.get("/", (req, res) => {
  const { genre } = req.query;
  const rows =
    genre && genre !== "All"
      ? db
          .prepare("SELECT id, name, genre, min_tier, description FROM templates WHERE genre = ? ORDER BY name")
          .all(genre)
      : db.prepare("SELECT id, name, genre, min_tier, description FROM templates ORDER BY genre, name").all();
  res.json({ templates: rows });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Template not found." });
  res.json({ template: row });
});

module.exports = router;
