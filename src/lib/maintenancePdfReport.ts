import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface PdfCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

const BRAND_COLOR = rgb(4 / 255, 177 / 255, 175 / 255);
const TEXT_COLOR = rgb(0.15, 0.15, 0.15);
const MUTED_COLOR = rgb(0.45, 0.45, 0.45);
const LINE_COLOR = rgb(0.85, 0.85, 0.85);
const HEADER_HEIGHT = 72;
const CONTINUATION_HEADER_HEIGHT = 26;

function ensureSpace(cursor: PdfCursor, neededHeight: number): void {
  if (cursor.y - neededHeight < MARGIN) {
    cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT - 20;
    drawContinuationHeader(cursor);
  }
}

function drawContinuationHeader(cursor: PdfCursor): void {
  cursor.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT,
    width: PAGE_WIDTH,
    height: 3,
    color: BRAND_COLOR,
  });
  cursor.page.drawText("Formulario de Mantenimiento Preventivo (continuación)", {
    x: MARGIN,
    y: PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT + 6,
    size: 9,
    font: cursor.font,
    color: MUTED_COLOR,
  });
}

export interface MaintenanceRecordForPdf {
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string | null;
  departmentName: string | null;
  email: string | null;
  hostName: string | null;
  ram: string | null;
  os: string | null;
  storageTotal: string | null;
  storageUsed: string | null;
  storageFree: string | null;
  checklist: { label: string; value: boolean | null }[];
  findings: string | null;
  observations: string | null;
  completedAt: Date;
}

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function formatDateForFilename(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

async function embedLogoImage(doc: PDFDocument, bytes: Uint8Array) {
  try {
    if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return await doc.embedPng(bytes);
    }
    if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return await doc.embedJpg(bytes);
    }
  } catch {
    // Unsupported or corrupt image data — the report still generates, just
    // without a logo, rather than failing maintenance completion entirely.
  }
  return null;
}

function drawHeader(cursor: PdfCursor, logo: Awaited<ReturnType<typeof embedLogoImage>>): void {
  cursor.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - HEADER_HEIGHT,
    width: PAGE_WIDTH,
    height: HEADER_HEIGHT,
    color: BRAND_COLOR,
  });

  let titleX = MARGIN;
  if (logo) {
    const { width, height } = logo.scaleToFit(40, 40);
    cursor.page.drawImage(logo, {
      x: MARGIN,
      y: PAGE_HEIGHT - HEADER_HEIGHT / 2 - height / 2,
      width,
      height,
    });
    titleX = MARGIN + 40 + 14;
  }

  cursor.page.drawText("FORMULARIO DE MANTENIMIENTO PREVENTIVO", {
    x: titleX,
    y: PAGE_HEIGHT - HEADER_HEIGHT / 2 - 2,
    size: 13,
    font: cursor.bold,
    color: rgb(1, 1, 1),
  });
  cursor.page.drawText("Gente Sánchez Business", {
    x: titleX,
    y: PAGE_HEIGHT - HEADER_HEIGHT / 2 - 16,
    size: 10,
    font: cursor.font,
    color: rgb(1, 1, 1),
  });

  cursor.y = PAGE_HEIGHT - HEADER_HEIGHT - 26;
}

function drawFooters(doc: PDFDocument, font: PDFFont): void {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN, y: 34 },
      end: { x: PAGE_WIDTH - MARGIN, y: 34 },
      thickness: 0.5,
      color: LINE_COLOR,
    });
    const label = `Página ${index + 1} de ${pages.length}`;
    const width = font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: 20,
      size: 8,
      font,
      color: MUTED_COLOR,
    });
  });
}

export async function buildMaintenancePdfBytes(
  record: MaintenanceRecordForPdf,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
  logoBytes?: Uint8Array | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes ? await embedLogoImage(doc, logoBytes) : null;

  const cursor: PdfCursor = { doc, page, y: PAGE_HEIGHT - MARGIN, font, bold };
  drawHeader(cursor, logo);

  const userInfoRows: [string, string][] = [
    ["Nombre", `${record.firstName} ${record.lastName}`],
    ["Posición", record.position ?? "-"],
    ["Empresa", record.companyName ?? "-"],
    ["Departamento", record.departmentName ?? "-"],
    ["Correo", record.email ?? "-"],
    ["Nombre del Host", record.hostName ?? "-"],
  ];
  ensureSpace(cursor, 18 + userInfoRows.length * 16 + 14);
  drawSection(cursor, "Información del Usuario", userInfoRows);

  const equipmentRows: [string, string][] = [
    ["Memoria RAM", record.ram ?? "-"],
    ["Sistema Operativo", record.os ?? "-"],
    ["Almacenamiento Total", record.storageTotal ?? "-"],
    ["Almacenamiento Utilizado", record.storageUsed ?? "-"],
    ["Almacenamiento Libre", record.storageFree ?? "-"],
  ];
  ensureSpace(cursor, 18 + equipmentRows.length * 16 + 14);
  drawSection(cursor, "Información del Equipo", equipmentRows);

  ensureSpace(cursor, 18 + record.checklist.length * 18 + 14);
  drawChecklist(cursor, record.checklist);

  drawParagraph(cursor, "Hallazgos", record.findings || "Ninguno");
  drawParagraph(cursor, "Observaciones", record.observations || "Ninguna");

  // 80 (gap to image) + 60 (image height, drawn upward from the gap baseline
  // overlaps within the gap) + 34 (label/date offset below the image
  // baseline) plus a small buffer for descenders, so the whole block never
  // splits across a page break.
  ensureSpace(cursor, 130);
  await drawSignatures(cursor, signatures, record.completedAt);

  drawFooters(doc, font);

  return doc.save();
}

function sectionTitle(cursor: PdfCursor, title: string): void {
  cursor.page.drawRectangle({
    x: MARGIN,
    y: cursor.y - 10,
    width: 3,
    height: 13,
    color: BRAND_COLOR,
  });
  cursor.page.drawText(title, {
    x: MARGIN + 10,
    y: cursor.y,
    size: 12,
    font: cursor.bold,
    color: TEXT_COLOR,
  });
  cursor.y -= 18;
}

function sectionDivider(cursor: PdfCursor): void {
  cursor.y -= 4;
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 0.5,
    color: LINE_COLOR,
  });
  cursor.y -= 14;
}

function drawSection(cursor: PdfCursor, title: string, rows: [string, string][]): void {
  sectionTitle(cursor, title);
  for (const [label, value] of rows) {
    cursor.page.drawText(`${label}:`, { x: MARGIN, y: cursor.y, size: 10, font: cursor.bold, color: TEXT_COLOR });
    cursor.page.drawText(value, { x: MARGIN + 160, y: cursor.y, size: 10, font: cursor.font, color: TEXT_COLOR });
    cursor.y -= 16;
  }
  sectionDivider(cursor);
}

function drawChecklist(cursor: PdfCursor, checklist: { label: string; value: boolean | null }[]): void {
  sectionTitle(cursor, "Checklist de Mantenimiento");
  const boxSize = 10;
  for (const item of checklist) {
    const boxY = cursor.y - boxSize + 2;
    if (item.value) {
      cursor.page.drawRectangle({ x: MARGIN, y: boxY, width: boxSize, height: boxSize, color: BRAND_COLOR });
      cursor.page.drawLine({
        start: { x: MARGIN + 2, y: boxY + 5 },
        end: { x: MARGIN + 4.5, y: boxY + 2.5 },
        thickness: 1.2,
        color: rgb(1, 1, 1),
      });
      cursor.page.drawLine({
        start: { x: MARGIN + 4.5, y: boxY + 2.5 },
        end: { x: MARGIN + 8.5, y: boxY + 8 },
        thickness: 1.2,
        color: rgb(1, 1, 1),
      });
    } else {
      cursor.page.drawRectangle({
        x: MARGIN,
        y: boxY,
        width: boxSize,
        height: boxSize,
        borderColor: LINE_COLOR,
        borderWidth: 1,
      });
    }
    cursor.page.drawText(item.label, { x: MARGIN + 20, y: cursor.y, size: 10, font: cursor.font, color: TEXT_COLOR });
    cursor.y -= 18;
  }
  sectionDivider(cursor);
}

function drawParagraph(cursor: PdfCursor, title: string, text: string): void {
  ensureSpace(cursor, 16 + 14);
  sectionTitle(cursor, title);
  for (const line of wrapText(text, cursor.font, 10, PAGE_WIDTH - MARGIN * 2)) {
    ensureSpace(cursor, 14);
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size: 10, font: cursor.font, color: TEXT_COLOR });
    cursor.y -= 14;
  }
  sectionDivider(cursor);
}

async function drawSignatures(
  cursor: PdfCursor,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
  completedAt: Date,
): Promise<void> {
  sectionTitle(cursor, "Firmas");
  const y = cursor.y - 80;
  const techImage = await cursor.doc.embedPng(signatures.technicianPng);
  const userImage = await cursor.doc.embedPng(signatures.userPng);

  cursor.page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: 160,
    height: 68,
    borderColor: LINE_COLOR,
    borderWidth: 1,
  });
  cursor.page.drawRectangle({
    x: MARGIN + 260,
    y: y - 4,
    width: 160,
    height: 68,
    borderColor: LINE_COLOR,
    borderWidth: 1,
  });
  cursor.page.drawImage(techImage, { x: MARGIN + 10, y, width: 140, height: 60 });
  cursor.page.drawImage(userImage, { x: MARGIN + 270, y, width: 140, height: 60 });
  cursor.page.drawText("Técnico", { x: MARGIN, y: y - 18, size: 10, font: cursor.bold, color: TEXT_COLOR });
  cursor.page.drawText("Usuario", { x: MARGIN + 260, y: y - 18, size: 10, font: cursor.bold, color: TEXT_COLOR });
  cursor.page.drawText(`Fecha: ${completedAt.toLocaleDateString("es-MX")}`, {
    x: MARGIN,
    y: y - 38,
    size: 10,
    font: cursor.font,
    color: MUTED_COLOR,
  });
}
