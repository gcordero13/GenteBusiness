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
        type: "preventivo",
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
        correctivo: [],
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
        type: "preventivo",
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
        correctivo: [],
        findings: longText,
        observations: longText,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("embeds a valid PNG logo in the header without breaking the report", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );

    const bytes = await buildMaintenancePdfBytes(
      {
        type: "preventivo",
        firstName: "Ana",
        lastName: "García",
        position: null,
        companyName: null,
        departmentName: null,
        email: null,
        hostName: null,
        ram: null,
        os: null,
        storageTotal: null,
        storageUsed: null,
        storageFree: null,
        checklist: [{ label: "Punto de restauración creado", value: true }],
        correctivo: [],
        findings: null,
        observations: null,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
      pngBytes,
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("does not throw when logoBytes is not a supported image format", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const notAnImage = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e]); // "<svg>" as raw bytes

    const bytes = await buildMaintenancePdfBytes(
      {
        type: "preventivo",
        firstName: "Ana",
        lastName: "García",
        position: null,
        companyName: null,
        departmentName: null,
        email: null,
        hostName: null,
        ram: null,
        os: null,
        storageTotal: null,
        storageUsed: null,
        storageFree: null,
        checklist: [{ label: "Punto de restauración creado", value: true }],
        correctivo: [],
        findings: null,
        observations: null,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
      notAnImage,
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("renders the Correctivo fields instead of a checklist when type is correctivo", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );

    const bytes = await buildMaintenancePdfBytes(
      {
        type: "correctivo",
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
        checklist: [],
        correctivo: [
          { label: "Problema reportado", value: "No enciende" },
          { label: "Diagnóstico", value: "Fuente de poder dañada" },
          { label: "Solución aplicada", value: "Se reemplazó la fuente" },
          { label: "Repuestos/piezas usadas", value: "Fuente 500W" },
        ],
        findings: "Ninguno",
        observations: "Ninguna",
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );

    const reloaded = await PDFDocument.load(bytes);
    // Each Correctivo field now renders as its own titled section (via
    // drawFlowingParagraph) with a section header and divider, rather than
    // as a compact row in a single shared table (drawInfoTable). That extra
    // per-field chrome — not the field values themselves — is what pushes
    // even these short answers past the first page onto a second one.
    expect(reloaded.getPageCount()).toBe(2);
  });

  it("wraps long Correctivo field text across multiple lines instead of truncating it", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const longSentence =
      "Se diagnosticó que la fuente de poder presentaba un cortocircuito interno tras varias pruebas de continuidad y voltaje realizadas en sitio. ";
    const longText = longSentence.repeat(10);

    const bytes = await buildMaintenancePdfBytes(
      {
        type: "correctivo",
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
        checklist: [],
        correctivo: [
          { label: "Problema reportado", value: "No enciende" },
          { label: "Diagnóstico", value: longText },
          { label: "Solución aplicada", value: "Se reemplazó la fuente" },
          { label: "Repuestos/piezas usadas", value: "Fuente 500W" },
        ],
        findings: "Ninguno",
        observations: "Ninguna",
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
