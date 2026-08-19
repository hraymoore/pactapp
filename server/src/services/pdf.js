const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE_SIZE = [612, 792];
const MARGIN = 56;
const GOLD = rgb(0.8, 0.64, 0.29);
const INK = rgb(0.08, 0.08, 0.1);
const MUTED = rgb(0.4, 0.4, 0.45);

async function renderContractPdf({ contract, parties, audit }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  function ensureSpace() {
    if (y < MARGIN + 20) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  }

  function writeLine(text, { size = 11, color = INK, f = font, gap = 16 } = {}) {
    const maxWidth = PAGE_SIZE[0] - MARGIN * 2;
    const words = String(text).split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
        ensureSpace();
        page.drawText(line, { x: MARGIN, y, size, font: f, color });
        y -= gap;
        line = word;
      } else {
        line = test;
      }
    }
    ensureSpace();
    page.drawText(line, { x: MARGIN, y, size, font: f, color });
    y -= gap;
  }

  writeLine("PACT", { size: 20, f: bold, color: GOLD, gap: 28 });
  writeLine(contract.name, { size: 16, f: bold, gap: 22 });
  writeLine(`Status: ${contract.status.toUpperCase()}  |  Exported: ${new Date().toISOString()}`, {
    size: 9,
    color: MUTED,
    gap: 22,
  });

  contract.body.split("\n").forEach((paragraph) => writeLine(paragraph || " ", { size: 10.5, gap: 15 }));

  y -= 8;
  writeLine("SIGNATURES", { size: 13, f: bold, color: GOLD, gap: 20 });
  parties.forEach((p) => {
    writeLine(`${p.name} <${p.email}>  —  ${p.role}`, { size: 10, f: bold, gap: 14 });
    writeLine(
      p.signed_at
        ? `Signed electronically as "${p.signature_name}" on ${p.signed_at} UTC from IP ${p.signature_ip}`
        : "Not yet signed",
      { size: 9.5, color: MUTED, gap: 18 }
    );
  });

  y -= 8;
  writeLine("AUDIT TRAIL", { size: 13, f: bold, color: GOLD, gap: 20 });
  if (audit.length === 0) {
    writeLine("No events recorded yet.", { size: 9.5, color: MUTED, gap: 14 });
  }
  audit.forEach((a) => {
    writeLine(`${a.created_at} UTC — ${a.action}${a.detail ? ": " + a.detail : ""}`, {
      size: 9,
      color: MUTED,
      gap: 13,
    });
  });

  return doc.save();
}

module.exports = { renderContractPdf };
