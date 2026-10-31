// Mirrors services/mailer.js's shape on purpose — same "not configured"
// check, same fire-and-forget send, same place a future provider swap
// would happen. Any Twilio-compatible provider works since this only
// calls their basic Messages (not Verify) API; Pact owns code generation/
// hashing/expiry itself (see routes/auth.js's /phone/request).
function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function sendSms({ to, body }) {
  if (!smsConfigured()) {
    return {
      sent: false,
      note: "SMS is not configured — add TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER to server/.env to send real texts.",
    };
  }
  const params = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER, Body: body });
  const auth = "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  }).catch((err) => console.error("[pact] Failed to send SMS:", err.message));
  return { sent: true, note: null };
}

module.exports = { smsConfigured, sendSms };
