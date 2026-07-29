import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { wrapText, buildMaintenancePdfBytes, formatDateForFilename } from "./maintenancePdfReport";

describe("wrapText", () => {
  it("keeps short text on a single line", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(wrapText("Hola mundo", font, 10, 200)).toEqual(["Hola mundo"]);
  });

  it("wraps long text across multiple lines within maxWidth", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const longText =
      "Esta es una observación muy larga que debería dividirse en varias líneas dentro del ancho máximo permitido para la columna del reporte.";
    const lines = wrapText(longText, font, 10, 150);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(150);
    }
  });
});

describe("formatDateForFilename", () => {
  it("formats as DD-MM-YYYY", () => {
    expect(formatDateForFilename(new Date("2026-07-28T15:00:00Z"))).toBe("28-07-2026");
  });
});

describe("buildMaintenancePdfBytes", () => {
  it("produces a valid single-page PDF containing the user's name", async () => {
    // A valid 1x1 transparent PNG, base64-decoded directly into raw bytes.
    // (The plan's literal fixture routed this through PDFDocument.create() /
    // embedPng() / PDFImage.embed() first, which doesn't return raw PNG bytes —
    // embed() resolves to a ref/index used internally by pdf-lib, not image
    // bytes. Decoding the base64 string straight to a Uint8Array is the
    // correct and simplest way to get real PNG bytes for the test.)
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );

    const bytes = await buildMaintenancePdfBytes(
      {
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        email: "ana@example.com",
        hostName: "DESKTOP-ANA",
        ram: "16 GB",
        os: "Windows 11",
        storageTotal: "512 GB",
        storageUsed: "200 GB",
        storageFree: "312 GB",
        checklist: [
          { label: "Punto de restauración creado", value: true },
          { label: "Limpieza de archivos temporales", value: false },
        ],
        findings: "Ninguno",
        observations: "Ninguna",
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("paginates onto a new page instead of silently clipping long content", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );

    // A realistic Spanish sentence repeated well past the ~150-165 word
    // threshold that forces the findings/observations text to overflow the
    // bottom margin of a single page.
    const longSentence =
      "Se realizó limpieza completa del equipo, actualización de controladores y verificación de temperatura del procesador sin anomalías detectadas durante la revisión. ";
    const longText = longSentence.repeat(20);

    const bytes = await buildMaintenancePdfBytes(
      {
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        email: "ana@example.com",
        hostName: "DESKTOP-ANA",
        ram: "16 GB",
        os: "Windows 11",
        storageTotal: "512 GB",
        storageUsed: "200 GB",
        storageFree: "312 GB",
        checklist: [
          { label: "Punto de restauración creado", value: true },
          { label: "Limpieza de archivos temporales", value: false },
        ],
        findings: longText,
        observations: longText,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
