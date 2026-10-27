// Extracts searchable text from an archived upload so it feeds
// archive_fts and the "Auto-fill details with Pact AI" feature.
//
// Scope decision, stated plainly rather than silently cut: full OCR
// (rasterizing each page to an image, then running Tesseract on it) is
// NOT implemented for scanned/image-only PDFs — that needs a PDF
// rasterizer (pdf.js + a native <canvas> binding, or a headless-Chrome
// render), which is a real sub-project on its own, not a quick addition.
// What IS implemented:
//   - PNG/JPEG/TIFF: full OCR via tesseract.js (pure JS/WASM, no native
//     binary or system install required).
//   - PDF: the document's own embedded text layer, via pdf-parse. This
//     covers the common case (a PDF exported from Word, DocuSign, Adobe
//     Sign, a scanner that already ran its own OCR) but returns little or
//     nothing for a true flat scanned image saved as PDF.
//   - DOCX: full text via mammoth.
// Every extraction failure is caught and turned into a stored
// extraction_note rather than blocking the upload — the file and its
// metadata are still valid and searchable by title/tags/notes even when
// text extraction comes up empty.
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

async function extractText(buffer, mimeType) {
  try {
    if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/tiff") {
      const { createWorker } = require("tesseract.js");
      const worker = await createWorker("eng");
      try {
        const { data } = await worker.recognize(buffer);
        return { text: data.text || "", note: null };
      } finally {
        await worker.terminate();
      }
    }
    if (mimeType === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      // pdf-parse inserts its own "-- N of M --" page separators into the
      // text; strip them so they don't pollute full-text search results.
      const text = (result.text || "").replace(/^-- \d+ of \d+ --$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
      return {
        text,
        note: text ? null : "No embedded text layer was found in this PDF — it may be a flat scanned image. Full-page OCR of scanned PDFs isn't supported yet; add metadata manually.",
      };
    }
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || "", note: null };
    }
    return { text: "", note: "Unrecognized file type — no text was extracted." };
  } catch (err) {
    return { text: "", note: `Text extraction failed: ${err.message}` };
  }
}

module.exports = { extractText };
