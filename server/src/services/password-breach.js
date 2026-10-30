const crypto = require("crypto");

// HIBP's Pwned Passwords API, via k-anonymity: only the first 5 hex chars
// of the password's SHA-1 hash ever leave this server — the full password
// (and even its full hash) never does. No API key required; this is a
// free, public, no-signup endpoint by design.
const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

// Fails OPEN, not closed: if the HIBP API is slow, down, or unreachable
// (this app's own egress policy included), a password change is never
// blocked on a third party being available — unlike malware scanning
// (services/malware-scan-provider.js), a missed breach check doesn't
// leave an exploitable hole, it just means this one advisory check didn't
// run this time. Returns { checked, breached }; the caller only acts on
// `breached === true` and otherwise proceeds.
async function checkPasswordBreached(password) {
  const sha1 = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true" },
    });
    if (!response.ok) return { checked: false, breached: false };
    const text = await response.text();
    const breached = text
      .split("\n")
      .some((line) => line.split(":")[0].trim().toUpperCase() === suffix);
    return { checked: true, breached };
  } catch (err) {
    return { checked: false, breached: false };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { checkPasswordBreached };
