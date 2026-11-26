import { describe, expect, it } from "vitest";
import { fechaCertificado, fitFontSize, toCertificadoData, verificacionUrl } from "./certificado";

describe("certificado helpers", () => {
  it("writes the completion date in Spanish, in Dominican Republic time", () => {
    expect(fechaCertificado("2026-11-26T02:30:00Z")).toBe("25 de noviembre de 2026");
    expect(fechaCertificado("2026-01-05T15:00:00Z")).toBe("5 de enero de 2026");
  });

  it("builds the public verification link", () => {
    expect(verificacionUrl("https://app.example.com/", "AB12-CD34-EF56")).toBe(
      "https://app.example.com/certificados/AB12-CD34-EF56",
    );
  });

  it("shrinks a long text until it fits, but not below the minimum", () => {
    const width = (text: string, size: number) => text.length * size * 0.5;
    expect(fitFontSize("Ana", 40, 300, width, 16)).toBe(40);
    expect(fitFontSize("x".repeat(20), 40, 300, width, 16)).toBe(30);
    expect(fitFontSize("x".repeat(40), 40, 300, width, 16)).toBe(16);
  });

  it("maps the RPC row, with no signature image unless both ids are set", () => {
    expect(
      toCertificadoData({
        codigo: "AB12-CD34-EF56",
        nombre: "Ana Pérez",
        curso_title: "Ciberseguridad",
        completed_at: "2026-11-26T15:00:00Z",
        firma_nombre: "  ",
        firma_cargo: null,
        firma_drive_id: "d",
        firma_item_id: null,
      }),
    ).toEqual({
      codigo: "AB12-CD34-EF56",
      nombre: "Ana Pérez",
      curso: "Ciberseguridad",
      completedAt: "2026-11-26T15:00:00Z",
      firmaNombre: null,
      firmaCargo: null,
      firmaImagen: null,
    });
  });
});
