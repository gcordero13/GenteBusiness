import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));

const { generateCertificadoPdf } = await import("./certificadoPdf");

const DATA = {
  codigo: "AB12-CD34-EF56",
  nombre: "María Fernández Peña",
  curso: "Ciberseguridad",
  completedAt: "2026-11-26T15:00:00Z",
  firmaNombre: "Laura Martínez",
  firmaCargo: "Gerente de Gestión Humana",
  firmaImagen: null,
};
const QR_URL = "https://x.test/certificados/AB12-CD34-EF56";

describe("generateCertificadoPdf", () => {
  it("makes a one-page landscape Letter PDF titled after the course", async () => {
    const bytes = await generateCertificadoPdf(DATA, { qrUrl: QR_URL, firmaBytes: null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
    expect(doc.getTitle()).toBe("Certificado - Ciberseguridad");
  });

  it("survives no signer, a very long name, an unreadable signature and characters the font can't draw", async () => {
    const bytes = await generateCertificadoPdf(
      {
        ...DATA,
        nombre: "Nombre Extremadamente Largo De Una Persona Con Muchísimos Apellidos Compuestos 😀",
        curso: "Curso 🚀 con un título bastante largo para ver que se achica sin salirse del certificado",
        firmaNombre: null,
        firmaCargo: null,
      },
      { qrUrl: QR_URL, firmaBytes: new Uint8Array([1, 2, 3]) },
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
