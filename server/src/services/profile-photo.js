const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

// Outside the web root (website/) on purpose — see db.js's photo_file_ref
// comment. express.static only ever serves website/, so nothing here is
// reachable except through the authenticated GET /api/profile/photo
// route below, which is the "serve through authenticated... URLs" half
// of spec 1.1.
const PHOTO_DIR = process.env.PACT_PROFILE_PHOTO_DIR || path.join(__dirname, "..", "..", "data", "profile-photos");
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const FULL_SIZE = 512;
const THUMB_SIZE = 128;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

function fullPath(fileRef) {
  return path.join(PHOTO_DIR, `${fileRef}-full.webp`);
}
function thumbPath(fileRef) {
  return path.join(PHOTO_DIR, `${fileRef}-thumb.webp`);
}

// The real "allow-list, verified by content sniffing" check (spec 1.1):
// sharp decodes actual pixel data rather than trusting the upload's
// extension or declared mimetype, so a renamed .exe or any other
// non-image payload throws here instead of silently passing through —
// there is no separate magic-byte check layered on top because this
// already IS one, and a stronger one than a signature-prefix lookup
// (it fails on a truncated or merely well-headered-but-corrupt file too).
async function processAndStorePhoto(buffer, { cropX = null, cropY = null, cropSize = null } = {}) {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error("Image must be 5MB or smaller.");
    err.status = 400;
    throw err;
  }

  let image = sharp(buffer, { failOn: "error" });
  let metadata;
  try {
    metadata = await image.metadata();
  } catch (err) {
    const wrapped = new Error("That file isn't a readable image (or isn't really a JPG/PNG/WebP).");
    wrapped.status = 400;
    throw wrapped;
  }
  if (!ALLOWED_FORMATS.has(metadata.format)) {
    const err = new Error("Only JPG, PNG, and WebP images are allowed.");
    err.status = 400;
    throw err;
  }

  // .rotate() with no args applies the image's own EXIF orientation
  // before anything strips the EXIF that recorded it — otherwise a photo
  // taken in portrait on a phone would end up sideways once that tag is
  // gone. sharp drops all metadata (EXIF included — GPS tags among them)
  // on re-encode by default; withMetadata() is never called, which is
  // what actually satisfies "strips EXIF data."
  image = sharp(buffer, { failOn: "error" }).rotate();

  // A caller-supplied square region (from the frontend's crop/zoom step)
  // is honored if given and sane; otherwise this falls back to a plain
  // center-crop via resize's "cover" fit, so the endpoint still produces
  // a correct square image even without a crop step (e.g. a future API
  // consumer that just uploads a file).
  if (
    Number.isFinite(cropX) &&
    Number.isFinite(cropY) &&
    Number.isFinite(cropSize) &&
    cropSize > 0 &&
    cropX >= 0 &&
    cropY >= 0
  ) {
    image = image.extract({
      left: Math.round(cropX),
      top: Math.round(cropY),
      width: Math.round(cropSize),
      height: Math.round(cropSize),
    });
  }

  const fileRef = crypto.randomBytes(20).toString("hex");
  const fullBuffer = await image.clone().resize(FULL_SIZE, FULL_SIZE, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
  const thumbBuffer = await image.clone().resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" }).webp({ quality: 85 }).toBuffer();

  fs.writeFileSync(fullPath(fileRef), fullBuffer);
  fs.writeFileSync(thumbPath(fileRef), thumbBuffer);
  return fileRef;
}

function deletePhotoFiles(fileRef) {
  if (!fileRef) return;
  for (const p of [fullPath(fileRef), thumbPath(fileRef)]) {
    try {
      fs.unlinkSync(p);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}

module.exports = { processAndStorePhoto, deletePhotoFiles, fullPath, thumbPath, MAX_UPLOAD_BYTES };
