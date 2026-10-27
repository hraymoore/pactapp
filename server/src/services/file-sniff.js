// Content-sniffing by magic bytes — "enforce server-side by content
// sniffing, not just extension" for the archive upload allow-list.
// Deliberately hand-rolled instead of pulling in a sniffing library:
// the allow-list is small and fixed (five formats), and every current
// major version of the obvious npm package (file-type) is ESM-only,
// which doesn't interoperate cleanly with this CommonJS codebase.
const SIGNATURES = [
  { type: "application/pdf", ext: "pdf", check: (b) => b.length >= 5 && b.toString("latin1", 0, 5) === "%PDF-" },
  {
    type: "image/png",
    ext: "png",
    check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  { type: "image/jpeg", ext: "jpg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/tiff",
    ext: "tiff",
    check: (b) =>
      b.length >= 4 &&
      ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
        (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)),
  },
  // ZIP magic — DOCX (and every other OOXML/zip-based format) shares this
  // signature. document-text-extractor.js's mammoth pass is the real
  // confirmation that a file sniffed as "docx-shaped" is actually valid
  // OOXML; a file that fails to parse there is rejected as corrupt/
  // mismatched rather than silently stored.
  {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    check: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
];

// Returns { type, ext } for the first matching signature, or null if the
// buffer doesn't match any allow-listed format — the caller rejects it
// regardless of what extension or Content-Type the upload claimed.
function sniffFileType(buffer) {
  for (const sig of SIGNATURES) {
    if (sig.check(buffer)) return { type: sig.type, ext: sig.ext };
  }
  return null;
}

module.exports = { sniffFileType };
