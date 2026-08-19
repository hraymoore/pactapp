// Identity / ID & SSN verification, via Stripe Identity.
//
// Deliberate design choice: Pact never collects or stores a government ID
// image, selfie, or SSN itself. That data has serious compliance weight
// (GLBA/FCRA-type obligations, state biometric-privacy laws, breach-notice
// exposure) that a small platform shouldn't take on directly. Instead Pact
// hands the user off to Stripe Identity's hosted, compliant verification
// flow — Stripe captures and stores the sensitive document/SSN data, and
// only reports back a pass/fail verification result plus the verified
// name, which is all `identity_verifications` stores locally.
//
// Swap this file for Persona, Onfido, Plaid Identity Verification, or
// Jumio without touching the routes above it — they all follow the same
// "create a session, redirect, receive a webhook" shape.

function identityConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_IDENTITY_ENABLED !== "false";
}

function getStripe() {
  const Stripe = require("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function createVerificationSession({ user, req, type = "document" }) {
  const stripe = getStripe();
  const origin = `${req.protocol}://${req.get("host")}`;
  // type: "document" verifies a photo ID + selfie match.
  // type: "id_number" verifies a submitted ID number (e.g. a US SSN) against
  // records, collected entirely within Stripe's hosted page — never by Pact.
  const session = await stripe.identity.verificationSessions.create({
    type,
    metadata: { userId: String(user.id) },
    return_url: `${origin}/dashboard.html?identity=complete`,
  });
  return session;
}

async function retrieveVerificationSession(sessionId) {
  const stripe = getStripe();
  return stripe.identity.verificationSessions.retrieve(sessionId);
}

module.exports = { identityConfigured, createVerificationSession, retrieveVerificationSession };
