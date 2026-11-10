import { describe, expect, it } from "vitest";
import { generateVacationCertificatePdf, type VacationCertificateData } from "./generateVacationCertificate";

const BASE_DATA: VacationCertificateData = {
  firstName: "Ana",
  lastName: "García",
  position: "Analista",
  companyName: "Sanchez Business Corp",
  tipo: "vacaciones",
  period: "2026",
  dateFrom: "2026-11-13",
  dateTo: "2026-11-20",
  daysRequested: 6,
  supervisorFirstName: "Carlos",
  supervisorLastName: "Jefe",
  supervisorDecidedAt: "2026-11-10T12:00:00Z",
  rrhhDecidedAt: "2026-11-11T12:00:00Z",
};

describe("generateVacationCertificatePdf", () => {
  it("produces a valid PDF with no logo or signatures", async () => {
    const pdfBytes = await generateVacationCertificatePdf(BASE_DATA, null, null, null);

    expect(pdfBytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");
  });

  it("produces a valid PDF for a non-vacaciones tipo with a long motivo-free body", async () => {
    const pdfBytes = await generateVacationCertificatePdf(
      { ...BASE_DATA, tipo: "medico", period: null, daysRequested: null },
      null,
      null,
      null,
    );

    expect(pdfBytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");
  });

  it("embeds a 1x1 PNG logo and signature images without throwing", async () => {
    // Smallest possible valid 1x1 transparent PNG.
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );

    const pdfBytes = await generateVacationCertificatePdf(BASE_DATA, onePixelPng, onePixelPng, onePixelPng);

    expect(pdfBytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");
  });

  it("does not throw when given corrupted image bytes for logo/signatures", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);

    const pdfBytes = await generateVacationCertificatePdf(BASE_DATA, garbage, garbage, garbage);

    expect(pdfBytes.length).toBeGreaterThan(0);
  });
});
