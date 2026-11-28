import { describe, expect, it } from "vitest";
import { formatoTelefono, lineasFirma, nombreArchivoFirma, plantillaDeEmpresa, type PersonaFirma } from "./firmaDatos";

const PERSONA: PersonaFirma = {
  nombre: "Gerónimo",
  apellido: "Cordero Bello",
  puesto: "Especialista de TI",
  email: "gcordero@sanchezbusinesscorp.com",
  extension: "160",
  celular: "8295213235",
  tieneWhatsapp: true,
  fotoUrl: null,
};

describe("plantillaDeEmpresa", () => {
  it("picks each company's design", () => {
    expect(plantillaDeEmpresa("Kexford")).toBe("kexford");
    expect(plantillaDeEmpresa("José Sánchez Comercial")).toBe("jsc");
    expect(plantillaDeEmpresa("Sánchez Business & Corp")).toBe("sbc");
    expect(plantillaDeEmpresa(null)).toBe("sbc");
  });
});

describe("formatoTelefono", () => {
  it("writes ten-digit numbers with dashes", () => {
    expect(formatoTelefono("8295213235")).toBe("829-521-3235");
    expect(formatoTelefono("(829) 521 3235")).toBe("829-521-3235");
    expect(formatoTelefono("18295213235")).toBe("829-521-3235");
    expect(formatoTelefono("ext 12")).toBe("ext 12");
  });
});

describe("lineasFirma", () => {
  it("Sánchez Business: WhatsApp, office with extension, email and web", () => {
    expect(lineasFirma(PERSONA, "sbc")).toEqual([
      { icono: "whatsapp", texto: "829-521-3235" },
      { icono: "telefono", texto: "809-468-1600 ext. 160" },
      { icono: "correo", texto: "gcordero@sanchezbusinesscorp.com" },
      { icono: "web", texto: "sanchezbusinesscorp.com" },
    ]);
  });

  it("Kexford: its own order, with the user handle and the email last", () => {
    expect(lineasFirma(PERSONA, "kexford").map((l) => l.icono)).toEqual(["whatsapp", "telefono", "web", "usuario", "correo"]);
    expect(lineasFirma(PERSONA, "kexford")[2].texto).toBe("Kexford Punta Cana");
  });

  it("leaves out what the person doesn't have", () => {
    const lineas = lineasFirma({ ...PERSONA, celular: null, extension: null, email: null }, "jsc");
    expect(lineas).toEqual([
      { icono: "telefono", texto: "809-468-1600" },
      { icono: "web", texto: "www.josesanchezcomercial.com" },
    ]);
  });

  it("uses a phone icon for a mobile without WhatsApp", () => {
    expect(lineasFirma({ ...PERSONA, tieneWhatsapp: false }, "sbc")[0]).toEqual({ icono: "celular", texto: "829-521-3235" });
  });
});

describe("nombreArchivoFirma", () => {
  it("names the file after the person and the version", () => {
    expect(nombreArchivoFirma(PERSONA, true)).toBe("Firma - Gerónimo Cordero Bello (con foto).png");
    expect(nombreArchivoFirma(PERSONA, false)).toBe("Firma - Gerónimo Cordero Bello (sin foto).png");
  });
});
