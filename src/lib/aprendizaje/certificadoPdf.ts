import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import qrcode from "qrcode-generator";
import { CERTIFICADO_LOGO_PNG_BASE64 } from "./certificadoLogo";
import { fechaCertificado, fitFontSize, type CertificadoData } from "./certificado";

const NAVY = rgb(0x0b / 255, 0x25 / 255, 0x45 / 255);
const TEAL = rgb(0x03 / 255, 0x6e / 255, 0x6c / 255);
const AQUA = rgb(0x04 / 255, 0xb1 / 255, 0xaf / 255);
const PAPER = rgb(1, 0.996, 0.984);
const WHITE = rgb(1, 1, 1);
const INK = rgb(0.11, 0.15, 0.2);
const MUTED = rgb(0.36, 0.42, 0.47);
const RULE = rgb(0.6, 0.64, 0.68);

/** Drops characters the standard (WinAnsi) fonts can't encode, e.g. emoji. */
function safe(font: PDFFont, text: string): string {
  return [...text]
    .filter((ch) => {
      try {
        font.encodeText(ch);
        return true;
      } catch {
        return false;
      }
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, cx: number) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null; // Unreadable signature: the certificate still goes out, just without it.
  }
}

/** Draws the QR as vector squares, so it stays sharp at any zoom or print size. */
function drawQr(page: PDFPage, text: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  page.drawRectangle({ x: x - 5, y: y - 5, width: size + 10, height: size + 10, color: WHITE, borderColor: RULE, borderWidth: 0.5 });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        // A hair of overlap avoids white seams between modules in some viewers.
        page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: INK });
      }
    }
  }
}

/**
 * The course certificate (approved design, 2026-11-26): Letter landscape,
 * company logo, recipient and course, completion date, and a footer with the
 * course's signer, a "Curso Aprobado" seal and a QR to the public check.
 * No grade and no class count, as asked.
 */
export async function generateCertificadoPdf(
  data: CertificadoData,
  opts: { qrUrl: string; firmaBytes: Uint8Array | null },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificado - ${data.curso}`);
  doc.setAuthor("Gente Sánchez Business");
  doc.setSubject(`Certificado de finalización de ${data.nombre}`);

  const page = doc.addPage([792, 612]);
  const W = page.getWidth();
  const H = page.getHeight();
  const cx = W / 2;
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesBoldItalic = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Paper, left band (navy → teal → aqua) and the two frames.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  page.drawRectangle({ x: 0, y: (H * 2) / 3, width: 11, height: H / 3, color: NAVY });
  page.drawRectangle({ x: 0, y: H / 3, width: 11, height: H / 3, color: TEAL });
  page.drawRectangle({ x: 0, y: 0, width: 11, height: H / 3, color: AQUA });
  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: TEAL, borderWidth: 2.5 });
  page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: RULE, borderWidth: 0.8 });

  // Logo.
  const logo = await doc.embedPng(CERTIFICADO_LOGO_PNG_BASE64);
  const logoDims = logo.scaleToFit(175, 130);
  const logoTop = H - 46;
  page.drawImage(logo, { x: cx - logoDims.width / 2, y: logoTop - logoDims.height, ...logoDims });

  // Titles, recipient and course.
  const textWidth = W - 220;
  let y = logoTop - logoDims.height - 28;
  centered(page, "CERTIFICADO DE FINALIZACIÓN", y, helvBold, 9.5, TEAL, cx);
  y -= 42;
  centered(page, "Certificado", y, timesBold, 36, NAVY, cx);
  y -= 32;
  centered(page, "Se otorga a", y, helv, 11, MUTED, cx);

  const nombre = safe(timesBoldItalic, data.nombre);
  const nombreSize = fitFontSize(nombre, 34, textWidth, (t, s) => timesBoldItalic.widthOfTextAtSize(t, s), 16);
  y -= 40;
  centered(page, nombre, y, timesBoldItalic, nombreSize, INK, cx);
  const underline = Math.min(textWidth + 40, Math.max(260, timesBoldItalic.widthOfTextAtSize(nombre, nombreSize) + 40));
  page.drawLine({ start: { x: cx - underline / 2, y: y - 8 }, end: { x: cx + underline / 2, y: y - 8 }, thickness: 0.8, color: AQUA });

  y -= 34;
  centered(page, "por haber completado satisfactoriamente el curso", y, helv, 11, MUTED, cx);
  const curso = safe(helvBold, data.curso);
  const cursoSize = fitFontSize(curso, 19, textWidth, (t, s) => helvBold.widthOfTextAtSize(t, s), 10);
  y -= 27;
  centered(page, curso, y, helvBold, cursoSize, NAVY, cx);
  y -= 23;
  centered(page, `Completado el ${fechaCertificado(data.completedAt)}`, y, helv, 10, MUTED, cx);

  // Footer: signature (left), seal (middle), QR (right).
  const footY = 60;
  const leftCx = 60 + 95;

  const firma = opts.firmaBytes ? await embedImage(doc, opts.firmaBytes) : null;
  if (firma) {
    const d = firma.scaleToFit(150, 46);
    page.drawImage(firma, { x: leftCx - d.width / 2, y: footY + 33, ...d });
  }
  page.drawLine({ start: { x: leftCx - 85, y: footY + 30 }, end: { x: leftCx + 85, y: footY + 30 }, thickness: 0.7, color: RULE });
  const firmante = (data.firmaNombre && safe(helvBold, data.firmaNombre)) || "Gestión Humana";
  centered(page, firmante, footY + 16, helvBold, fitFontSize(firmante, 9.5, 180, (t, s) => helvBold.widthOfTextAtSize(t, s), 7), INK, leftCx);
  if (data.firmaNombre && data.firmaCargo) {
    const cargo = safe(helv, data.firmaCargo);
    centered(page, cargo, footY + 4, helv, fitFontSize(cargo, 8, 180, (t, s) => helv.widthOfTextAtSize(t, s), 6), MUTED, leftCx);
  }

  const sealCy = footY + 36;
  page.drawCircle({ x: cx, y: sealCy, size: 41, color: WHITE, borderColor: AQUA, borderWidth: 1.2 });
  page.drawCircle({ x: cx, y: sealCy, size: 36, color: AQUA, borderColor: TEAL, borderWidth: 2.5 });
  centered(page, "CURSO", sealCy + 7, helvBold, 7.5, WHITE, cx);
  centered(page, "Aprobado", sealCy - 11, timesBoldItalic, 15, WHITE, cx);

  const qrSize = 72;
  const qrX = W - 60 - 190;
  drawQr(page, opts.qrUrl, qrX, footY - 2, qrSize);
  const textX = qrX + qrSize + 14;
  page.drawText("Escanea para verificar", { x: textX, y: footY + 50, size: 9.5, font: helvBold, color: INK });
  page.drawText("Constancia en línea de", { x: textX, y: footY + 36, size: 8, font: helv, color: MUTED });
  page.drawText("Gente Sánchez Business", { x: textX, y: footY + 25, size: 8, font: helv, color: MUTED });
  page.drawText(data.codigo, { x: textX, y: footY + 8, size: 9, font: helvBold, color: TEAL });

  return doc.save();
}
