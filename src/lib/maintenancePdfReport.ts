import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface PdfCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

const BRAND_COLOR = rgb(4 / 255, 177 / 255, 175 / 255);
const PANEL_HEADER_COLOR = rgb(0.2, 0.29, 0.38);
const TEXT_COLOR = rgb(0.15, 0.15, 0.15);
const MUTED_COLOR = rgb(0.45, 0.45, 0.45);
const LINE_COLOR = rgb(0.85, 0.85, 0.85);
const ZEBRA_COLOR = rgb(0.96, 0.97, 0.97);
const HEADER_HEIGHT = 72;
const CONTINUATION_HEADER_HEIGHT = 26;
const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PANEL_GAP = 14;
const PANEL_WIDTH = (CONTENT_WIDTH - PANEL_GAP) / 2;
const FRESH_PAGE_USABLE_HEIGHT = PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT - 20 - MARGIN - 20;

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

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
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

  cursor.y = PAGE_HEIGHT - HEADER_HEIGHT - 22;
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
  ];
  const equipmentRows: [string, string][] = [
    ["Nombre del Host", record.hostName ?? "-"],
    ["Memoria RAM", record.ram ?? "-"],
    ["Sistema Operativo", record.os ?? "-"],
    ["Almacenamiento Total", record.storageTotal ?? "-"],
    ["Almacenamiento Utilizado", record.storageUsed ?? "-"],
    ["Almacenamiento Libre", record.storageFree ?? "-"],
  ];
  const panelRowCount = Math.max(userInfoRows.length, equipmentRows.length);
  const panelHeight = 22 + panelRowCount * 24 + 8;
  ensureSpace(cursor, panelHeight + 16);
  drawInfoPanels(cursor, "Información del Usuario", userInfoRows, "Información del Equipo", equipmentRows, panelHeight);

  const checklistCols = splitInHalf(record.checklist);
  const checklistRows = Math.max(checklistCols[0].length, checklistCols[1].length);
  ensureSpace(cursor, 22 + checklistRows * 18 + 14);
  drawChecklistTable(cursor, checklistCols);

  drawFieldBox(cursor, "Hallazgos", record.findings || "Ninguno");
  drawFieldBox(cursor, "Observaciones", record.observations || "Ninguna");

  // 80 (gap to image) + 60 (image height, drawn upward from the gap baseline
  // overlaps within the gap) + 34 (label/date offset below the image
  // baseline) plus a small buffer for descenders, so the whole block never
  // splits across a page break.
  ensureSpace(cursor, 130);
  await drawSignatures(cursor, signatures, record.completedAt);

  drawFooters(doc, font);

  return doc.save();
}

function splitInHalf<T>(items: T[]): [T[], T[]] {
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
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

function drawPanel(cursor: PdfCursor, x: number, topY: number, title: string, rows: [string, string][], height: number): void {
  const headerHeight = 22;
  cursor.page.drawRectangle({ x, y: topY - headerHeight, width: PANEL_WIDTH, height: headerHeight, color: PANEL_HEADER_COLOR });
  cursor.page.drawText(title, {
    x: x + 8,
    y: topY - headerHeight / 2 - 3,
    size: 9.5,
    font: cursor.bold,
    color: rgb(1, 1, 1),
  });
  cursor.page.drawRectangle({
    x,
    y: topY - height,
    width: PANEL_WIDTH,
    height: height - headerHeight,
    borderColor: LINE_COLOR,
    borderWidth: 1,
  });

  const rowHeight = 24;
  const valueMaxWidth = PANEL_WIDTH - 16;
  rows.forEach(([label, value], index) => {
    const rowTop = topY - headerHeight - index * rowHeight;
    if (index % 2 === 1) {
      cursor.page.drawRectangle({ x, y: rowTop - rowHeight, width: PANEL_WIDTH, height: rowHeight, color: ZEBRA_COLOR });
    }
    cursor.page.drawText(label.toUpperCase(), {
      x: x + 8,
      y: rowTop - 10,
      size: 7,
      font: cursor.bold,
      color: MUTED_COLOR,
    });
    cursor.page.drawText(truncateToWidth(value, cursor.font, 9.5, valueMaxWidth), {
      x: x + 8,
      y: rowTop - 20,
      size: 9.5,
      font: cursor.font,
      color: TEXT_COLOR,
    });
  });
}

function drawInfoPanels(
  cursor: PdfCursor,
  leftTitle: string,
  leftRows: [string, string][],
  rightTitle: string,
  rightRows: [string, string][],
  height: number,
): void {
  const topY = cursor.y;
  drawPanel(cursor, MARGIN, topY, leftTitle, leftRows, height);
  drawPanel(cursor, MARGIN + PANEL_WIDTH + PANEL_GAP, topY, rightTitle, rightRows, height);
  cursor.y = topY - height - 14;
}

function drawChecklistTable(cursor: PdfCursor, columns: [{ label: string; value: boolean | null }[], { label: string; value: boolean | null }[]]): void {
  sectionTitle(cursor, "Checklist de Mantenimiento");
  const topY = cursor.y + 6;
  const rows = Math.max(columns[0].length, columns[1].length);
  const height = rows * 18 + 12;

  cursor.page.drawRectangle({
    x: MARGIN,
    y: topY - height,
    width: CONTENT_WIDTH,
    height,
    borderColor: LINE_COLOR,
    borderWidth: 1,
  });
  cursor.page.drawLine({
    start: { x: MARGIN + PANEL_WIDTH + PANEL_GAP / 2, y: topY },
    end: { x: MARGIN + PANEL_WIDTH + PANEL_GAP / 2, y: topY - height },
    thickness: 0.5,
    color: LINE_COLOR,
  });

  const boxSize = 10;
  columns.forEach((column, colIndex) => {
    const colX = MARGIN + colIndex * (PANEL_WIDTH + PANEL_GAP) + 10;
    column.forEach((item, rowIndex) => {
      const rowY = topY - 14 - rowIndex * 18;
      const boxY = rowY - boxSize + 2;
      if (item.value) {
        cursor.page.drawRectangle({ x: colX, y: boxY, width: boxSize, height: boxSize, color: BRAND_COLOR });
        cursor.page.drawLine({
          start: { x: colX + 2, y: boxY + 5 },
          end: { x: colX + 4.5, y: boxY + 2.5 },
          thickness: 1.2,
          color: rgb(1, 1, 1),
        });
        cursor.page.drawLine({
          start: { x: colX + 4.5, y: boxY + 2.5 },
          end: { x: colX + 8.5, y: boxY + 8 },
          thickness: 1.2,
          color: rgb(1, 1, 1),
        });
      } else {
        cursor.page.drawRectangle({
          x: colX,
          y: boxY,
          width: boxSize,
          height: boxSize,
          borderColor: LINE_COLOR,
          borderWidth: 1,
        });
      }
      const labelMaxWidth = PANEL_WIDTH - 20 - boxSize;
      cursor.page.drawText(truncateToWidth(item.label, cursor.font, 9, labelMaxWidth), {
        x: colX + 18,
        y: rowY,
        size: 9,
        font: cursor.font,
        color: TEXT_COLOR,
      });
    });
  });

  cursor.y = topY - height - 14;
}

function drawFieldBox(cursor: PdfCursor, title: string, text: string): void {
  const contentWidth = CONTENT_WIDTH - 16;
  const lineHeight = 13;
  const lines = wrapText(text, cursor.font, 9.5, contentWidth);
  const boxHeight = lines.length * lineHeight + 16;

  if (18 + boxHeight > FRESH_PAGE_USABLE_HEIGHT) {
    // Pathologically long content that wouldn't fit in a single box even on
    // a fresh page — fall back to plain flowing text so pagination can
    // split it across pages instead of one unsplittable, overflowing box.
    drawFlowingParagraph(cursor, title, text, lines);
    return;
  }

  ensureSpace(cursor, 18 + boxHeight + 14);
  sectionTitle(cursor, title);
  const topY = cursor.y + 4;
  cursor.page.drawRectangle({
    x: MARGIN,
    y: topY - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: LINE_COLOR,
    borderWidth: 1,
  });
  let lineY = topY - 12;
  for (const line of lines) {
    cursor.page.drawText(line, { x: MARGIN + 8, y: lineY, size: 9.5, font: cursor.font, color: TEXT_COLOR });
    lineY -= lineHeight;
  }
  cursor.y = topY - boxHeight - 14;
  sectionDivider(cursor);
}

function drawFlowingParagraph(cursor: PdfCursor, title: string, text: string, precomputedLines?: string[]): void {
  ensureSpace(cursor, 16 + 14);
  sectionTitle(cursor, title);
  const lines = precomputedLines ?? wrapText(text, cursor.font, 10, PAGE_WIDTH - MARGIN * 2);
  for (const line of lines) {
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
