import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

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

  let y = PAGE_HEIGHT - MARGIN;
  page.drawText("FORMULARIO DE MANTENIMIENTO PREVENTIVO", { x: MARGIN, y, size: 14, font: bold });
  y -= 30;

  y = drawSection(page, bold, font, y, "Información del Usuario", [
    ["Nombre", `${record.firstName} ${record.lastName}`],
    ["Posición", record.position ?? "-"],
    ["Empresa", record.companyName ?? "-"],
    ["Departamento", record.departmentName ?? "-"],
    ["Correo", record.email ?? "-"],
    ["Nombre del Host", record.hostName ?? "-"],
  ]);

  y = drawSection(page, bold, font, y, "Información del Equipo", [
    ["Memoria RAM", record.ram ?? "-"],
    ["Sistema Operativo", record.os ?? "-"],
    ["Almacenamiento Total", record.storageTotal ?? "-"],
    ["Almacenamiento Utilizado", record.storageUsed ?? "-"],
    ["Almacenamiento Libre", record.storageFree ?? "-"],
  ]);

  y = drawChecklist(page, bold, font, y, record.checklist);
  y = drawParagraph(page, bold, font, y, "Hallazgos", record.findings || "Ninguno");
  y = drawParagraph(page, bold, font, y, "Observaciones", record.observations || "Ninguna");
  await drawSignatures(doc, page, bold, font, y, signatures, record.completedAt);

  return doc.save();
}

function drawSection(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  title: string,
  rows: [string, string][],
): number {
  let y = startY;
  page.drawText(title, { x: MARGIN, y, size: 12, font: bold, color: rgb(0, 0, 0) });
  y -= 18;
  for (const [label, value] of rows) {
    page.drawText(`${label}:`, { x: MARGIN, y, size: 10, font: bold });
    page.drawText(value, { x: MARGIN + 160, y, size: 10, font });
    y -= 16;
  }
  return y - 10;
}

function drawChecklist(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  checklist: { label: string; value: boolean | null }[],
): number {
  let y = startY;
  page.drawText("Checklist de Mantenimiento", { x: MARGIN, y, size: 12, font: bold });
  y -= 18;
  for (const item of checklist) {
    page.drawText(item.value ? "[X]" : "[ ]", { x: MARGIN, y, size: 10, font });
    page.drawText(item.label, { x: MARGIN + 30, y, size: 10, font });
    y -= 16;
  }
  return y - 10;
}

function drawParagraph(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  title: string,
  text: string,
): number {
  let y = startY;
  page.drawText(title, { x: MARGIN, y, size: 12, font: bold });
  y -= 16;
  for (const line of wrapText(text, font, 10, PAGE_WIDTH - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y, size: 10, font });
    y -= 14;
  }
  return y - 10;
}

async function drawSignatures(
  doc: PDFDocument,
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
  completedAt: Date,
): Promise<void> {
  const y = startY - 80;
  const techImage = await doc.embedPng(signatures.technicianPng);
  const userImage = await doc.embedPng(signatures.userPng);
  page.drawImage(techImage, { x: MARGIN, y, width: 140, height: 60 });
  page.drawImage(userImage, { x: MARGIN + 260, y, width: 140, height: 60 });
  page.drawText("Técnico", { x: MARGIN, y: y - 14, size: 10, font: bold });
  page.drawText("Usuario", { x: MARGIN + 260, y: y - 14, size: 10, font: bold });
  page.drawText(`Fecha: ${completedAt.toLocaleDateString("es-MX")}`, { x: MARGIN, y: y - 34, size: 10, font });
}
