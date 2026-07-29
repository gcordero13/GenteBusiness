import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface PdfCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
}

function ensureSpace(cursor: PdfCursor, neededHeight: number): void {
  if (cursor.y - neededHeight < MARGIN) {
    cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - MARGIN;
  }
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

export async function buildMaintenancePdfBytes(
  record: MaintenanceRecordForPdf,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const cursor: PdfCursor = { doc, page, y: PAGE_HEIGHT - MARGIN };
  cursor.page.drawText("FORMULARIO DE MANTENIMIENTO PREVENTIVO", {
    x: MARGIN,
    y: cursor.y,
    size: 14,
    font: bold,
  });
  cursor.y -= 30;

  const userInfoRows: [string, string][] = [
    ["Nombre", `${record.firstName} ${record.lastName}`],
    ["Posición", record.position ?? "-"],
    ["Empresa", record.companyName ?? "-"],
    ["Departamento", record.departmentName ?? "-"],
    ["Correo", record.email ?? "-"],
    ["Nombre del Host", record.hostName ?? "-"],
  ];
  ensureSpace(cursor, 18 + userInfoRows.length * 16 + 10);
  drawSection(cursor, bold, font, "Información del Usuario", userInfoRows);

  const equipmentRows: [string, string][] = [
    ["Memoria RAM", record.ram ?? "-"],
    ["Sistema Operativo", record.os ?? "-"],
    ["Almacenamiento Total", record.storageTotal ?? "-"],
    ["Almacenamiento Utilizado", record.storageUsed ?? "-"],
    ["Almacenamiento Libre", record.storageFree ?? "-"],
  ];
  ensureSpace(cursor, 18 + equipmentRows.length * 16 + 10);
  drawSection(cursor, bold, font, "Información del Equipo", equipmentRows);

  ensureSpace(cursor, 18 + record.checklist.length * 16 + 10);
  drawChecklist(cursor, bold, font, record.checklist);

  drawParagraph(cursor, bold, font, "Hallazgos", record.findings || "Ninguno");
  drawParagraph(cursor, bold, font, "Observaciones", record.observations || "Ninguna");

  // 80 (gap to image) + 60 (image height, drawn upward from the gap baseline
  // overlaps within the gap) + 34 (label/date offset below the image
  // baseline) plus a small buffer for descenders, so the whole block never
  // splits across a page break.
  ensureSpace(cursor, 130);
  await drawSignatures(cursor, bold, font, signatures, record.completedAt);

  return doc.save();
}

function drawSection(
  cursor: PdfCursor,
  bold: PDFFont,
  font: PDFFont,
  title: string,
  rows: [string, string][],
): void {
  cursor.page.drawText(title, { x: MARGIN, y: cursor.y, size: 12, font: bold, color: rgb(0, 0, 0) });
  cursor.y -= 18;
  for (const [label, value] of rows) {
    cursor.page.drawText(`${label}:`, { x: MARGIN, y: cursor.y, size: 10, font: bold });
    cursor.page.drawText(value, { x: MARGIN + 160, y: cursor.y, size: 10, font });
    cursor.y -= 16;
  }
  cursor.y -= 10;
}

function drawChecklist(
  cursor: PdfCursor,
  bold: PDFFont,
  font: PDFFont,
  checklist: { label: string; value: boolean | null }[],
): void {
  cursor.page.drawText("Checklist de Mantenimiento", { x: MARGIN, y: cursor.y, size: 12, font: bold });
  cursor.y -= 18;
  for (const item of checklist) {
    cursor.page.drawText(item.value ? "[X]" : "[ ]", { x: MARGIN, y: cursor.y, size: 10, font });
    cursor.page.drawText(item.label, { x: MARGIN + 30, y: cursor.y, size: 10, font });
    cursor.y -= 16;
  }
  cursor.y -= 10;
}

function drawParagraph(cursor: PdfCursor, bold: PDFFont, font: PDFFont, title: string, text: string): void {
  ensureSpace(cursor, 16 + 14);
  cursor.page.drawText(title, { x: MARGIN, y: cursor.y, size: 12, font: bold });
  cursor.y -= 16;
  for (const line of wrapText(text, font, 10, PAGE_WIDTH - MARGIN * 2)) {
    ensureSpace(cursor, 14);
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size: 10, font });
    cursor.y -= 14;
  }
  cursor.y -= 10;
}

async function drawSignatures(
  cursor: PdfCursor,
  bold: PDFFont,
  font: PDFFont,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
  completedAt: Date,
): Promise<void> {
  const y = cursor.y - 80;
  const techImage = await cursor.doc.embedPng(signatures.technicianPng);
  const userImage = await cursor.doc.embedPng(signatures.userPng);
  cursor.page.drawImage(techImage, { x: MARGIN, y, width: 140, height: 60 });
  cursor.page.drawImage(userImage, { x: MARGIN + 260, y, width: 140, height: 60 });
  cursor.page.drawText("Técnico", { x: MARGIN, y: y - 14, size: 10, font: bold });
  cursor.page.drawText("Usuario", { x: MARGIN + 260, y: y - 14, size: 10, font: bold });
  cursor.page.drawText(`Fecha: ${completedAt.toLocaleDateString("es-MX")}`, {
    x: MARGIN,
    y: y - 34,
    size: 10,
    font,
  });
}
