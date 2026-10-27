const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { logAudit } = require("./signing");
const { snapshotVersion, diffVersions } = require("./versions");
const { contentHash } = require("./contract-factory");
const { sendMail } = require("./mailer");
const { renderAmendmentCertificatePdf } = require("./pdf");

const CERT_DIR = process.env.PACT_AMENDMENT_CERT_DIR || path.join(__dirname, "..", "..", "data", "amendment-certificates");
fs.mkdirSync(CERT_DIR, { recursive: true });

function getParties(contractId) {
  return db.prepare("SELECT * FROM contract_parties WHERE contract_id = ?").all(contractId);
}

function listAmendments(contractId) {
  const amendments = db
    .prepare("SELECT * FROM contract_amendments WHERE contract_id = ? ORDER BY created_at DESC, id DESC")
    .all(contractId);
  return amendments.map((a) => withSignatureStatus(a));
}

function withSignatureStatus(amendment) {
  const signatures = db
    .prepare(
      `SELECT s.*, p.name as party_name, p.email as party_email FROM amendment_signatures s
       JOIN contract_parties p ON p.id = s.party_id
       WHERE s.amendment_id = ? ORDER BY s.id ASC`
    )
    .all(amendment.id);
  const certificate = db.prepare("SELECT * FROM amendment_certificates WHERE amendment_id = ?").get(amendment.id);
  return { ...amendment, signatures, certificate: certificate || null };
}

function getAmendment(contractId, amendmentId) {
  const amendment = db.prepare("SELECT * FROM contract_amendments WHERE id = ? AND contract_id = ?").get(amendmentId, contractId);
  if (!amendment) return null;
  return withSignatureStatus(amendment);
}

// Only one 'pending' amendment per contract at a time — see db.js's
// comment on contract_amendments for why. Every existing signing party
// gets an unsigned amendment_signatures row the moment this is proposed,
// which is what "has everyone signed yet" is derived from everywhere
// else in this file.
function proposeAmendment(contract, actingUser, { amendmentType, title, summary, proposedBody }) {
  if (contract.status !== "signed") {
    const err = new Error("Amendments can only be proposed on a fully executed contract.");
    err.status = 409;
    throw err;
  }
  const existing = db.prepare("SELECT 1 FROM contract_amendments WHERE contract_id = ? AND status = 'pending'").get(contract.id);
  if (existing) {
    const err = new Error("There is already a pending amendment awaiting signatures — withdraw it first to propose a different one.");
    err.status = 409;
    throw err;
  }
  if (!title || !title.trim()) {
    const err = new Error("A title is required.");
    err.status = 400;
    throw err;
  }
  if (!summary || !summary.trim()) {
    const err = new Error("A plain-language summary of what's changing is required.");
    err.status = 400;
    throw err;
  }
  if (typeof proposedBody !== "string" || !proposedBody.trim()) {
    const err = new Error("The proposed contract text cannot be empty.");
    err.status = 400;
    throw err;
  }
  const type = amendmentType === "addendum" ? "addendum" : "amendment";

  const info = db
    .prepare(
      `INSERT INTO contract_amendments (contract_id, proposed_by_user_id, amendment_type, title, summary, proposed_body)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(contract.id, actingUser.id, type, title.trim(), summary.trim(), proposedBody);
  const amendmentId = info.lastInsertRowid;

  const parties = getParties(contract.id);
  for (const party of parties) {
    db.prepare("INSERT INTO amendment_signatures (amendment_id, party_id) VALUES (?, ?)").run(amendmentId, party.id);
  }

  logAudit(contract.id, actingUser, "amendment_proposed", `${actingUser.name} proposed ${type} "${title.trim()}": ${summary.trim()}`);
  parties
    .filter((p) => p.email !== actingUser.email)
    .forEach((p) =>
      sendMail({
        to: p.email,
        subject: `Pact: a new ${type} was proposed on "${contract.name}"`,
        text: `${actingUser.name} proposed ${type === "addendum" ? "an addendum" : "an amendment"} to "${contract.name}": "${title.trim()}"\n\n${summary.trim()}\n\nOpen Pact to review and sign it.`,
      })
    );

  return getAmendment(contract.id, amendmentId);
}

function findSignatureRow(amendmentId, partyId) {
  return db.prepare("SELECT * FROM amendment_signatures WHERE amendment_id = ? AND party_id = ?").get(amendmentId, partyId);
}

// Shared by the in-app signer (routes/contracts.js) and the public
// token-based one (routes/sign.js) — "party" here is always a real
// contract_parties row; which route resolved it to is irrelevant below.
// Async because executeAmendment below has to be: PDF generation
// (pdf-lib's doc.save()) is inherently async, and the certificate must
// actually exist on disk/in the DB before this resolves — not a
// fire-and-forget that could race a client's immediate "download
// certificate" fetch right after signing completes.
async function signAmendment(amendment, party, { typedSignature, ip }) {
  if (amendment.status !== "pending") {
    const err = new Error("This amendment is no longer open for signing.");
    err.status = 409;
    throw err;
  }
  const row = findSignatureRow(amendment.id, party.id);
  if (!row) {
    const err = new Error("You are not a party to this amendment.");
    err.status = 403;
    throw err;
  }
  if (row.signed_at) {
    const err = new Error("You have already signed this amendment.");
    err.status = 409;
    throw err;
  }
  if (row.rejected_at) {
    const err = new Error("This amendment was already rejected and can no longer be signed.");
    err.status = 409;
    throw err;
  }

  db.prepare("UPDATE amendment_signatures SET signed_at = datetime('now'), signature_name = ?, signature_ip = ? WHERE id = ?").run(
    typedSignature.trim(),
    ip,
    row.id
  );
  logAudit(amendment.contract_id, { name: party.name, email: party.email }, "amendment_signed", `${party.name} signed "${amendment.title}" as "${typedSignature.trim()}" from IP ${ip}.`);

  const allSignatures = db.prepare("SELECT * FROM amendment_signatures WHERE amendment_id = ?").all(amendment.id);
  const allSigned = allSignatures.every((s) => s.signed_at);
  if (allSigned) {
    await executeAmendment(amendment.id);
  }
  return { allSigned };
}

function rejectAmendment(amendment, party, { reason }) {
  if (amendment.status !== "pending") {
    const err = new Error("This amendment is no longer open.");
    err.status = 409;
    throw err;
  }
  const row = findSignatureRow(amendment.id, party.id);
  if (!row) {
    const err = new Error("You are not a party to this amendment.");
    err.status = 403;
    throw err;
  }
  db.prepare("UPDATE amendment_signatures SET rejected_at = datetime('now'), rejection_reason = ? WHERE id = ?").run(reason || null, row.id);
  db.prepare("UPDATE contract_amendments SET status = 'rejected' WHERE id = ?").run(amendment.id);

  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(amendment.contract_id);
  logAudit(amendment.contract_id, { name: party.name, email: party.email }, "amendment_rejected", `${party.name} rejected "${amendment.title}"${reason ? ": " + reason : "."}`);
  getParties(amendment.contract_id)
    .filter((p) => p.email !== party.email)
    .forEach((p) =>
      sendMail({
        to: p.email,
        subject: `Pact: "${amendment.title}" was declined on "${contract.name}"`,
        text: `${party.name} declined the proposed ${amendment.amendment_type} "${amendment.title}" on "${contract.name}"${reason ? `, with this note: ${reason}` : "."}\n\nThe contract's text is unchanged.`,
      })
    );
}

function withdrawAmendment(amendment, actingUser) {
  if (amendment.proposed_by_user_id !== actingUser.id) {
    const err = new Error("Only the person who proposed this amendment can withdraw it.");
    err.status = 403;
    throw err;
  }
  if (amendment.status !== "pending") {
    const err = new Error("Only a pending amendment can be withdrawn.");
    err.status = 409;
    throw err;
  }
  db.prepare("UPDATE contract_amendments SET status = 'withdrawn' WHERE id = ?").run(amendment.id);
  logAudit(amendment.contract_id, actingUser, "amendment_withdrawn", `${actingUser.name} withdrew "${amendment.title}" before it was fully signed.`);
}

// Called the moment the last required signature lands (from signAmendment
// above) — applies proposed_body to the live contract, snapshots the
// pre-amendment text (same mechanism the ordinary post-signature edit
// path uses, so this amendment's "before" state stays in the normal
// redline history too), and issues the certificate.
async function executeAmendment(amendmentId) {
  const amendment = db.prepare("SELECT * FROM contract_amendments WHERE id = ?").get(amendmentId);
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(amendment.contract_id);

  snapshotVersion(contract.id, contract.body, null);
  db.prepare("UPDATE contracts SET body = ?, content_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    amendment.proposed_body,
    contentHash(amendment.proposed_body),
    contract.id
  );
  db.prepare("UPDATE contract_amendments SET status = 'signed', executed_at = datetime('now') WHERE id = ?").run(amendmentId);

  logAudit(
    contract.id,
    null,
    "amendment_executed",
    `"${amendment.title}" signed by all parties and applied — every change from this point reflects the ${amendment.amendment_type}.`
  );

  await issueCertificate(amendmentId);

  getParties(contract.id).forEach((p) =>
    sendMail({
      to: p.email,
      subject: `Pact: "${amendment.title}" is now fully signed on "${contract.name}"`,
      text: `All parties have signed the ${amendment.amendment_type} "${amendment.title}" on "${contract.name}". The contract's text has been updated accordingly — open Pact to view it and download the certificate.`,
    })
  );
}

async function issueCertificate(amendmentId) {
  const amendment = db.prepare("SELECT * FROM contract_amendments WHERE id = ?").get(amendmentId);
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(amendment.contract_id);
  const signatures = db
    .prepare(
      `SELECT s.*, p.name as party_name, p.email as party_email, p.role FROM amendment_signatures s
       JOIN contract_parties p ON p.id = s.party_id
       WHERE s.amendment_id = ? ORDER BY s.id ASC`
    )
    .all(amendmentId);

  const dataFields = {
    amendmentId,
    contractId: contract.id,
    contractName: contract.name,
    amendmentType: amendment.amendment_type,
    title: amendment.title,
    summary: amendment.summary,
    executedAtUtc: amendment.executed_at,
    signatures: signatures.map((s) => ({
      name: s.party_name,
      email: s.party_email,
      role: s.role,
      signatureName: s.signature_name,
      signedAt: s.signed_at,
      signatureIp: s.signature_ip,
    })),
  };
  const dataHash = crypto.createHash("sha256").update(JSON.stringify(dataFields), "utf8").digest("hex");

  const pdfBytes = await renderAmendmentCertificatePdf({ ...dataFields, dataHash });
  const fileName = `${crypto.randomBytes(20).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(CERT_DIR, fileName), Buffer.from(pdfBytes));
  db.prepare("INSERT INTO amendment_certificates (amendment_id, pdf_file_ref, data_hash) VALUES (?, ?, ?)").run(amendmentId, fileName, dataHash);
}

function diffAmendmentAgainstCurrent(contract, amendment) {
  return diffVersions(contract.body, amendment.proposed_body);
}

module.exports = {
  CERT_DIR,
  listAmendments,
  getAmendment,
  proposeAmendment,
  signAmendment,
  rejectAmendment,
  withdrawAmendment,
  diffAmendmentAgainstCurrent,
};
