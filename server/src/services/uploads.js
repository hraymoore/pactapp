const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const UPLOAD_DIR = process.env.PACT_UPLOAD_DIR || path.join(__dirname, "..", "..", "data", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Never trust the original filename on disk — random name only, the
    // real filename is stored as metadata in contract_attachments.
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomBytes(20).toString("hex")}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Unsupported file type. Upload a PDF, Word doc, plain text file, or image."));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_UPLOAD_BYTES } });

module.exports = { upload, UPLOAD_DIR, MAX_UPLOAD_BYTES };
