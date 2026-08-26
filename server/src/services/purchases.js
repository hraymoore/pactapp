const db = require("../db");
const { createContractFromTemplate } = require("./contract-factory");

const PRICE_CENTS = { download: 399, edit: 799 };

function priceFor(purchaseType) {
  return PRICE_CENTS[purchaseType];
}

// Called once payment is confirmed — either immediately, when Stripe isn't
// configured ("direct" mode, same fallback pattern as billing/identity), or
// from the Stripe webhook once a real checkout.session.completed event
// arrives for a one-time purchase.
function fulfillPurchase({ userId, userName, userEmail, templateId, purchaseType, stripeSessionId }) {
  const template = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
  if (!template) {
    const err = new Error("Template not found.");
    err.status = 404;
    throw err;
  }

  let contractId = null;
  if (purchaseType === "edit") {
    contractId = createContractFromTemplate({
      ownerId: userId,
      ownerName: userName,
      ownerEmail: userEmail,
      name: template.name,
      template,
      sourceNote: `Purchased as a one-time $7.99 editable contract (not a subscription).`,
    });
  }

  const info = db
    .prepare(
      "INSERT INTO purchases (user_id, template_id, purchase_type, amount_cents, status, stripe_session_id, contract_id) VALUES (?, ?, ?, ?, 'paid', ?, ?)"
    )
    .run(userId, templateId, purchaseType, priceFor(purchaseType), stripeSessionId || null, contractId);

  return db.prepare("SELECT * FROM purchases WHERE id = ?").get(info.lastInsertRowid);
}

module.exports = { priceFor, fulfillPurchase };
