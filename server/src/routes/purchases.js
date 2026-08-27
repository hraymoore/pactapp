const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { billingConfigured, createOneTimeCheckoutSession } = require("../services/billing-provider");
const { priceFor, fulfillPurchase } = require("../services/purchases");
const { renderBlankTemplatePdf } = require("../services/pdf");
const { isValidStateCode } = require("../us-states");

router.use(express.json());
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, t.name as template_name, t.genre as template_genre
       FROM purchases p JOIN templates t ON t.id = p.template_id
       WHERE p.user_id = ? ORDER BY p.created_at DESC`
    )
    .all(req.user.id);
  res.json({ purchases: rows });
});

router.post("/checkout", async (req, res) => {
  const { templateId, purchaseType, state } = req.body || {};
  if (!["download", "edit"].includes(purchaseType)) {
    return res.status(400).json({ error: "purchaseType must be 'download' ($3.99) or 'edit' ($7.99)." });
  }
  const template = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
  if (!template) return res.status(404).json({ error: "Template not found." });

  // "edit" fulfillment creates a real contract, so it needs a governing
  // state like any other contract-creation path — "download" is just a
  // blank PDF, no contract, so no state is required.
  if (purchaseType === "edit" && !isValidStateCode(state)) {
    return res.status(400).json({ error: "Select a valid governing state before buying the editable version." });
  }

  const priceCents = priceFor(purchaseType);

  if (!billingConfigured()) {
    const purchase = fulfillPurchase({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      templateId: template.id,
      purchaseType,
      stripeSessionId: null,
      state,
    });
    return res.json({
      mode: "direct",
      purchase,
      note: "Stripe is not configured yet — this purchase was fulfilled directly so you can keep testing. Add STRIPE_SECRET_KEY to server/.env to collect real payment.",
    });
  }

  try {
    const session = await createOneTimeCheckoutSession({ template, purchaseType, priceCents, user: req.user, req, state });
    res.json({ mode: "stripe", url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Only "download" ($3.99) purchases serve a PDF here — an "edit" ($7.99)
// purchase creates a real contract at fulfillment time, so it's opened
// from the normal Contracts list instead.
router.get("/:id/download", (req, res) => {
  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!purchase) return res.status(404).json({ error: "Purchase not found." });
  if (purchase.status !== "paid") return res.status(402).json({ error: "This purchase hasn't been completed yet." });
  if (purchase.purchase_type !== "download") {
    return res.status(400).json({ error: "This was an editable purchase — open it from your Contracts list instead." });
  }

  const template = db.prepare("SELECT * FROM templates WHERE id = ?").get(purchase.template_id);
  renderBlankTemplatePdf(template)
    .then((pdfBytes) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${template.name.replace(/[^a-z0-9]+/gi, "_")}_blank.pdf"`
      );
      res.send(Buffer.from(pdfBytes));
    })
    .catch((err) => {
      console.error("[pact] Blank template PDF generation failed:", err);
      res.status(500).json({ error: "Failed to generate PDF." });
    });
});

module.exports = router;
