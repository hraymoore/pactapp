// "Trusted counterparties / address book" (spec 1.4 #8) — a per-owner
// list for faster contract sending. A saved contact is just a
// convenience (name + email) with no relationship to any Pact account
// of its own, same as any counterparty entered by hand.
const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(express.json());
router.use(requireAuth);

router.get("/", (req, res) => {
  const contacts = db.prepare("SELECT * FROM saved_contacts WHERE user_id = ? ORDER BY name ASC").all(req.user.id);
  res.json({ contacts });
});

router.post("/", (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
  if (!email || !EMAIL_FORMAT.test(email.trim())) return res.status(400).json({ error: "Enter a valid email address." });
  const info = db
    .prepare("INSERT INTO saved_contacts (user_id, name, email) VALUES (?, ?, ?)")
    .run(req.user.id, name.trim(), email.trim().toLowerCase());
  const contact = db.prepare("SELECT * FROM saved_contacts WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ contact });
});

router.delete("/:id", (req, res) => {
  const contact = db.prepare("SELECT * FROM saved_contacts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  db.prepare("DELETE FROM saved_contacts WHERE id = ?").run(contact.id);
  res.json({ ok: true });
});

module.exports = router;
