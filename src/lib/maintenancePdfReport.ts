import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface PdfCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  type: "preventivo" | "correctivo";
}

const BRAND_COLOR = rgb(4 / 255, 177 / 255, 175 / 255);
const TEXT_COLOR = rgb(0.15, 0.15, 0.15);
const MUTED_COLOR = rgb(0.45, 0.45, 0.45);
const LINE_COLOR = rgb(0.85, 0.85, 0.85);
const CONTINUATION_HEADER_HEIGHT = 26;
const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PANEL_GAP = 14;
const PANEL_WIDTH = (CONTENT_WIDTH - PANEL_GAP) / 2;

function ensureSpace(cursor: PdfCursor, neededHeight: number): void {
  if (cursor.y - neededHeight < MARGIN) {
    cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT - 20;
    drawContinuationHeader(cursor);
  }
}

function drawContinuationHeader(cursor: PdfCursor): void {
  const y = PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT;
  const label =
    cursor.type === "correctivo"
      ? "Formulario de Mantenimiento Correctivo (continuación)"
      : "Formulario de Mantenimiento Preventivo (continuación)";
  cursor.page.drawText(label, {
    x: MARGIN,
    y: y + 8,
    size: 9,
    font: cursor.font,
    color: MUTED_COLOR,
  });
  cursor.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.75,
    color: LINE_COLOR,
  });
}

export interface MaintenanceRecordForPdf {
  type: "preventivo" | "correctivo";
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
  correctivo: { label: string; value: string | null }[];
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

function formatDisplayDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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

function drawHeader(cursor: PdfCursor, logo: Awaited<ReturnType<typeof embedLogoImage>>, completedAt: Date): void {
  const topY = PAGE_HEIGHT - MARGIN;
  let nameY = topY - 10;

  if (logo) {
    const { width, height } = logo.scaleToFit(44, 44);
    cursor.page.drawImage(logo, { x: MARGIN, y: topY - height, width, height });
    nameY = topY - height - 12;
    cursor.page.drawText("Gente Sánchez Business", {
      x: MARGIN,
      y: nameY,
      size: 8,
      font: cursor.font,
      color: MUTED_COLOR,
    });
  } else {
    cursor.page.drawText("Gente Sánchez Business", {
      x: MARGIN,
      y: nameY,
      size: 10,
      font: cursor.bold,
      color: TEXT_COLOR,
    });
    nameY -= 14;
  }

  const genLabel = "Generado el:";
  const genValue = formatDisplayDate(completedAt);
  const labelWidth = cursor.font.widthOfTextAtSize(genLabel, 9);
  const valueWidth = cursor.font.widthOfTextAtSize(genValue, 9);
  cursor.page.drawText(genLabel, { x: PAGE_WIDTH - MARGIN - labelWidth, y: topY - 2, size: 9, font: cursor.font, color: MUTED_COLOR });
  cursor.page.drawText(genValue, { x: PAGE_WIDTH - MARGIN - valueWidth, y: topY - 14, size: 9, font: cursor.font, color: MUTED_COLOR });

  const titleY = nameY - 24;
  const title =
    cursor.type === "correctivo"
      ? "FORMULARIO DE MANTENIMIENTO CORRECTIVO"
      : "FORMULARIO DE MANTENIMIENTO PREVENTIVO";
  const titleWidth = cursor.bold.widthOfTextAtSize(title, 14);
  cursor.page.drawText(title, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y: titleY,
    size: 14,
    font: cursor.bold,
    color: TEXT_COLOR,
  });

  const ruleY = titleY - 16;
  cursor.page.drawLine({ start: { x: MARGIN, y: ruleY }, end: { x: PAGE_WIDTH - MARGIN, y: ruleY }, thickness: 1, color: LINE_COLOR });
  cursor.y = ruleY - 20;
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

  const cursor: PdfCursor = { doc, page, y: PAGE_HEIGHT - MARGIN, font, bold, type: record.type };
  drawHeader(cursor, logo, record.completedAt);

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
  drawInfoTable(cursor, "Información del Usuario", userInfoRows);
  drawInfoTable(cursor, "Información del Equipo", equipmentRows);

  if (record.type === "correctivo") {
    const correctivoRows: [string, string][] = record.correctivo.map((f) => [f.label, f.value || "-"]);
    drawInfoTable(cursor, "Diagnóstico y Solución", correctivoRows);
  } else {
    const checklistCols = splitInHalf(record.checklist);
    drawChecklistTable(cursor, checklistCols);
  }

  drawFlowingParagraph(cursor, "Hallazgos", record.findings || "Ninguno");
  drawFlowingParagraph(cursor, "Observaciones", record.observations || "Ninguna");

  // Signature images (55) + gap to the rule (6) + role caption (14) + date
  // line (16) plus a small buffer, so the whole block never splits across a
  // page break.
  ensureSpace(cursor, 110);
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

function drawTableHeaderBar(cursor: PdfCursor, topY: number, title: string, width: number): void {
  const barHeight = 22;
  cursor.page.drawRectangle({ x: MARGIN, y: topY - barHeight, width, height: barHeight, color: BRAND_COLOR });
  cursor.page.drawText(title, {
    x: MARGIN + 8,
    y: topY - barHeight / 2 - 3,
    size: 10,
    font: cursor.bold,
    color: rgb(1, 1, 1),
  });
}

function drawInfoTable(cursor: PdfCursor, title: string, rows: [string, string][]): void {
  const barHeight = 22;
  const rowHeight = 18;
  const height = barHeight + rows.length * rowHeight;
  ensureSpace(cursor, height + 14);

  const topY = cursor.y;
  drawTableHeaderBar(cursor, topY, title, CONTENT_WIDTH);

  const labelX = MARGIN + 8;
  const valueX = MARGIN + 150;
  const valueMaxWidth = CONTENT_WIDTH - 150 - 8;
  rows.forEach(([label, value], index) => {
    const rowTop = topY - barHeight - index * rowHeight;
    cursor.page.drawText(label, { x: labelX, y: rowTop - 13, size: 9, font: cursor.bold, color: MUTED_COLOR });
    cursor.page.drawText(truncateToWidth(value, cursor.font, 9.5, valueMaxWidth), {
      x: valueX,
      y: rowTop - 13,
      size: 9.5,
      font: cursor.font,
      color: TEXT_COLOR,
    });
    if (index < rows.length - 1) {
      cursor.page.drawLine({
        start: { x: MARGIN, y: rowTop - rowHeight },
        end: { x: PAGE_WIDTH - MARGIN, y: rowTop - rowHeight },
        thickness: 0.5,
        color: LINE_COLOR,
      });
    }
  });

  cursor.page.drawRectangle({
    x: MARGIN,
    y: topY - height,
    width: CONTENT_WIDTH,
    height,
    borderColor: LINE_COLOR,
    borderWidth: 1,
  });

  cursor.y = topY - height - 14;
}

function drawChecklistTable(cursor: PdfCursor, columns: [{ label: string; value: boolean | null }[], { label: string; value: boolean | null }[]]): void {
  const barHeight = 22;
  const rows = Math.max(columns[0].length, columns[1].length);
  const height = barHeight + rows * 18;
  ensureSpace(cursor, height + 14);

  const topY = cursor.y;
  drawTableHeaderBar(cursor, topY, "Checklist de Mantenimiento", CONTENT_WIDTH);

  const boxSize = 10;
  columns.forEach((column, colIndex) => {
    const colLeft = MARGIN + colIndex * (PANEL_WIDTH + PANEL_GAP);
    const colX = colLeft + 10;
    column.forEach((item, rowIndex) => {
      const rowTop = topY - barHeight - rowIndex * 18;
      const baselineY = rowTop - 13;
      const boxY = rowTop - 16;
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
        y: baselineY,
        size: 9,
        font: cursor.font,
        color: TEXT_COLOR,
      });
    });
  });

  for (let i = 1; i < rows; i++) {
    const lineY = topY - barHeight - i * 18;
    cursor.page.drawLine({ start: { x: MARGIN, y: lineY }, end: { x: PAGE_WIDTH - MARGIN, y: lineY }, thickness: 0.5, color: LINE_COLOR });
  }

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

  cursor.y = topY - height - 14;
}

function drawFlowingParagraph(cursor: PdfCursor, title: string, text: string): void {
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
  const imgWidth = 160;
  const imgHeight = 55;
  const gap = 40;
  const leftX = MARGIN;
  const rightX = MARGIN + imgWidth + gap;
  const imgTopY = cursor.y - 4;
  const imgBottomY = imgTopY - imgHeight;

  const techImage = await cursor.doc.embedPng(signatures.technicianPng);
  const userImage = await cursor.doc.embedPng(signatures.userPng);
  cursor.page.drawImage(techImage, { x: leftX, y: imgBottomY, width: imgWidth, height: imgHeight });
  cursor.page.drawImage(userImage, { x: rightX, y: imgBottomY, width: imgWidth, height: imgHeight });

  const lineY = imgBottomY - 6;
  cursor.page.drawLine({ start: { x: leftX, y: lineY }, end: { x: leftX + imgWidth, y: lineY }, thickness: 0.75, color: TEXT_COLOR });
  cursor.page.drawLine({ start: { x: rightX, y: lineY }, end: { x: rightX + imgWidth, y: lineY }, thickness: 0.75, color: TEXT_COLOR });

  cursor.page.drawText("Técnico", { x: leftX, y: lineY - 14, size: 10, font: cursor.bold, color: TEXT_COLOR });
  cursor.page.drawText("Usuario", { x: rightX, y: lineY - 14, size: 10, font: cursor.bold, color: TEXT_COLOR });
  cursor.page.drawText(`Fecha: ${formatDisplayDate(completedAt)}`, {
    x: leftX,
    y: lineY - 30,
    size: 9,
    font: cursor.font,
    color: MUTED_COLOR,
  });

  cursor.y = lineY - 44;
}
