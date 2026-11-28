import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FirmasCorreo } from "./FirmasCorreo";

const props = {
  persona: {
    nombre: "Ana",
    apellido: "Pérez",
    puesto: "Analista",
    email: "ana@example.com",
    extension: "101",
    celular: "8095551234",
    tieneWhatsapp: false,
    fotoUrl: null,
  },
  plantilla: "sbc" as const,
  fondo: null,
  fondoSinFoto: null,
  logoEmpresa: null,
  logoGrupo: null,
  logosGrupo: [],
  fuentes: { texto: "f-texto", nombre: "f-nombre" },
};

describe("FirmasCorreo", () => {
  it("is 'Mi firma de correo' on the person's own profile", () => {
    render(<FirmasCorreo {...props} />);
    expect(screen.getByRole("heading", { name: "Mi firma de correo" })).toBeInTheDocument();
    expect(screen.getByText(/con tus datos/)).toBeInTheDocument();
  });

  it("names the person when someone who manages contacts looks at it", () => {
    render(<FirmasCorreo {...props} propia={false} />);
    expect(screen.getByRole("heading", { name: "Firma de correo de Ana Pérez" })).toBeInTheDocument();
    expect(screen.getByText(/con sus datos/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Con foto" })).toHaveAttribute("title", "Este contacto no tiene foto");
  });
});
