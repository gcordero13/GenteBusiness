import { describe, expect, it } from "vitest";
import { etiquetaArchivo, tamanoArchivo, tipoVisor } from "./visor";

describe("tipoVisor", () => {
  it.each([
    ["image/png", "foto.png", "imagen"],
    ["video/mp4", "demo.mp4", "video"],
    ["audio/mpeg", "charla.mp3", "audio"],
    ["application/pdf", "guia.pdf", "documento"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "manual.docx", "documento"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "datos.xlsx", "documento"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "clase.pptx", "documento"],
    ["text/plain", "notas.txt", "documento"],
    // Uploads sometimes arrive without a useful type: fall back to the extension.
    ["application/octet-stream", "Procedimiento.DOCX", "documento"],
    ["", "presentacion.ppt", "documento"],
    ["application/zip", "plantillas.zip", "otro"],
    ["application/octet-stream", "instalador.exe", "otro"],
  ])("%s %s → %s", (contentType, filename, tipo) => {
    expect(tipoVisor(contentType, filename)).toBe(tipo);
  });
});

describe("file labels", () => {
  it("names the file type briefly for its icon", () => {
    expect(etiquetaArchivo("Guía de inducción.pdf")).toBe("PDF");
    expect(etiquetaArchivo("datos.xlsx")).toBe("XLSX");
    expect(etiquetaArchivo("sin-extension")).toBe("ARCHIVO");
  });

  it("writes sizes the way people read them", () => {
    expect(tamanoArchivo(null)).toBe("");
    expect(tamanoArchivo(900)).toBe("900 B");
    expect(tamanoArchivo(84 * 1024)).toBe("84 KB");
    expect(tamanoArchivo(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});
