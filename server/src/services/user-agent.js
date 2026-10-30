// A small, deliberately approximate User-Agent parser for the Active
// Sessions list ("device, browser") — purely cosmetic display, so a full
// dependency (ua-parser-js and its regex database) is more than this
// needs. Order matters: Edge and Chrome both carry "Safari" in their UA
// string, so the more specific checks run first.
function describeUserAgent(userAgent) {
  if (!userAgent) return "Unknown device";

  let browser = "Unknown browser";
  if (/Edg\//.test(userAgent)) browser = "Edge";
  else if (/OPR\//.test(userAgent)) browser = "Opera";
  else if (/Chrome\//.test(userAgent)) browser = "Chrome";
  else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Version\/.*Safari\//.test(userAgent)) browser = "Safari";
  else if (/Safari\//.test(userAgent)) browser = "Safari";

  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/.test(userAgent)) os = "iOS";
  else if (/Android/.test(userAgent)) os = "Android";
  else if (/Mac OS X/.test(userAgent)) os = "macOS";
  else if (/Windows/.test(userAgent)) os = "Windows";
  else if (/Linux/.test(userAgent)) os = "Linux";

  return `${browser} on ${os}`;
}

module.exports = { describeUserAgent };
