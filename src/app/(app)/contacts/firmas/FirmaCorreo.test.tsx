import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FirmaCorreo } from "./FirmaCorreo";

const persona = {
  nombre: "Ana",
  apellido: "Pérez",
  puesto: "Analista",
  email: "ana@example.com",
  extension: "101",
  celular: "8095551234",
  tieneWhatsapp: false,
  fotoUrl: "https://cdn.example.com/foto.png",
};

function render(plantilla: "sbc" | "jsc" | "kexford", conFoto: boolean, fondo: string | null, fondoSinFoto: string | null = null) {
  return renderToStaticMarkup(
    <FirmaCorreo
      persona={persona}
      plantilla={plantilla}
      conFoto={conFoto}
      fondo={fondo}
      fondoSinFoto={fondoSinFoto}
      logoEmpresa="https://cdn.example.com/logo.png"
      logoGrupo="https://cdn.example.com/grupo.png"
      fuentes={{ texto: "f-texto", nombre: "f-nombre" }}
    />,
  );
}

describe("FirmaCorreo", () => {
  for (const plantilla of ["sbc", "jsc", "kexford"] as const) {
    it(`${plantilla}: with the company art, only the art, the photo and the data (the art has its logos)`, () => {
      const conFoto = render(plantilla, true, "https://cdn.example.com/arte.png");
      expect(conFoto).toContain("arte.png");
      expect(conFoto).toContain("foto.png");
      expect(conFoto).not.toContain("logo.png");
      expect(conFoto).not.toContain("grupo.png");
      expect(conFoto).toContain("Ana Pérez");

      const sinFoto = render(plantilla, false, "https://cdn.example.com/arte.png");
      expect(sinFoto).not.toContain("foto.png");
      expect(sinFoto).not.toContain("logo.png");
    });

    it(`${plantilla}: without art, the design is drawn with the company logo`, () => {
      const sinFoto = render(plantilla, false, null);
      expect(sinFoto).toContain("logo.png");
      expect(sinFoto).not.toContain("arte.png");
    });
  }

  it("the 'sin foto' version uses its own art when the company has one", () => {
    const sinFoto = render("sbc", false, "https://cdn.example.com/arte.png", "https://cdn.example.com/arte-sin-foto.png");
    expect(sinFoto).toContain("arte-sin-foto.png");
    expect(sinFoto).not.toContain("arte.png\"");
    const conFoto = render("sbc", true, "https://cdn.example.com/arte.png", "https://cdn.example.com/arte-sin-foto.png");
    expect(conFoto).toContain("arte.png");
    expect(conFoto).not.toContain("arte-sin-foto.png");
  });

  it("sbc: the drawn design has the group's four white logos; with the art they come from the art", () => {
    expect(render("sbc", true, null)).toContain("/firmas/sbc-logos-grupo.png");
    expect(render("sbc", false, null)).toContain("/firmas/sbc-logos-grupo.png");
    expect(render("sbc", true, "https://cdn.example.com/arte.png")).not.toContain("sbc-logos-grupo.png");
  });
});
