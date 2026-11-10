import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { formatFechaEs } from "@/lib/vacationRequestSummary";
import { TIPO_LABEL } from "@/app/(app)/solicitudes/vacaciones/SolicitudesPills";

export interface VacationCertificateData {
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string | null;
  tipo: string;
  period: string | null;
  dateFrom: string;
  dateTo: string;
  daysRequested: number | null;
  supervisorFirstName: string | null;
  supervisorLastName: string | null;
  supervisorDecidedAt: string | null;
  rrhhDecidedAt: string | null;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
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
  return lines;
}

async function embedImageAuto(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  // PNG magic number: 89 50 4E 47; anything else is tried as JPEG.
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return isPng ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

// Builds the signed "constancia" handed to the employee once RRHH gives the
// final approval - company logo, the request's own details, and both
// captured signatures (jefe directo + RRHH), composed into a single PDF page.
export async function generateVacationCertificatePdf(
  data: VacationCertificateData,
  logoBytes: Uint8Array | null,
  supervisorSignatureBytes: Uint8Array | null,
  rrhhSignatureBytes: Uint8Array | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 60;
  const textWidth = width - margin * 2;
  let y = height - margin;

  if (logoBytes) {
    try {
      const logoImage = await embedImageAuto(doc, logoBytes);
      const dims = logoImage.scaleToFit(160, 70);
      page.drawImage(logoImage, { x: (width - dims.width) / 2, y: y - dims.height, width: dims.width, height: dims.height });
      y -= dims.height + 28;
    } catch {
      // Unreadable/unsupported logo format - continue without it.
    }
  }

  const isVacaciones = data.tipo === "vacaciones";
  const title = isVacaciones ? "Constancia de Vacaciones" : "Constancia de Permiso";
  page.drawText(title, { x: margin, y, size: 18, font: fontBold, color: rgb(0.05, 0.05, 0.05) });
  y -= 36;

  const fullName = `${data.firstName} ${data.lastName}`;
  const tipoLabel = TIPO_LABEL[data.tipo] ?? data.tipo;
  const rangeText =
    data.dateFrom === data.dateTo
      ? `el ${formatFechaEs(data.dateFrom)}`
      : `entre el ${formatFechaEs(data.dateFrom)} y el ${formatFechaEs(data.dateTo)}`;
  const daysText =
    isVacaciones && data.daysRequested ? `, equivalente a ${data.daysRequested} día(s)` : "";
  const periodText = isVacaciones && data.period ? ` correspondiente al período ${data.period}` : "";

  const supervisorName =
    [data.supervisorFirstName, data.supervisorLastName].filter(Boolean).join(" ") || "su jefe directo";

  const paragraphs = [
    `${data.companyName ? `Recursos Humanos de ${data.companyName}` : "Recursos Humanos"} hace constar que el(la) colaborador(a) ${fullName}${
      data.position ? `, quien ocupa el cargo de ${data.position},` : ","
    } fue autorizado(a) para disfrutar de ${tipoLabel.toLowerCase()}${periodText}, ${rangeText}${daysText}.`,
    `Esta solicitud fue aprobada por ${supervisorName}${
      data.supervisorDecidedAt ? ` el ${formatFechaEs(data.supervisorDecidedAt.slice(0, 10))}` : ""
    } y ratificada por Recursos Humanos${data.rrhhDecidedAt ? ` el ${formatFechaEs(data.rrhhDecidedAt.slice(0, 10))}` : ""}.`,
    "Se extiende la presente constancia a solicitud de la parte interesada, para los fines que estime convenientes.",
  ];

  for (const paragraph of paragraphs) {
    for (const line of wrapText(paragraph, font, 12, textWidth)) {
      page.drawText(line, { x: margin, y, size: 12, font });
      y -= 18;
    }
    y -= 10;
  }

  y -= 50;
  const signatureWidth = 160;
  const signatureHeight = 55;
  const colGap = 60;
  const col1X = margin;
  const col2X = margin + signatureWidth + colGap;

  if (supervisorSignatureBytes) {
    try {
      const img = await doc.embedPng(supervisorSignatureBytes);
      const dims = img.scaleToFit(signatureWidth, signatureHeight);
      page.drawImage(img, { x: col1X, y, width: dims.width, height: dims.height });
    } catch {
      // Ignore a corrupted signature file.
    }
  }
  if (rrhhSignatureBytes) {
    try {
      const img = await doc.embedPng(rrhhSignatureBytes);
      const dims = img.scaleToFit(signatureWidth, signatureHeight);
      page.drawImage(img, { x: col2X, y, width: dims.width, height: dims.height });
    } catch {
      // Ignore a corrupted signature file.
    }
  }

  y -= signatureHeight + 6;
  page.drawLine({ start: { x: col1X, y }, end: { x: col1X + signatureWidth, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
  page.drawLine({ start: { x: col2X, y }, end: { x: col2X + signatureWidth, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
  y -= 14;
  page.drawText(supervisorName, { x: col1X, y, size: 10, font });
  page.drawText("Recursos Humanos", { x: col2X, y, size: 10, font });
  y -= 14;
  page.drawText("Jefe directo", { x: col1X, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(data.companyName ?? "", { x: col2X, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });

  page.drawText(`Emitido el ${formatFechaEs(new Date().toISOString().slice(0, 10))}`, {
    x: margin,
    y: margin,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}
