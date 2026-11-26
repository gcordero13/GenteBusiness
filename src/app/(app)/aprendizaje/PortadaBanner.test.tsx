import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortadaBanner } from "./PortadaBanner";

const PERFIL = {
  name: "María Rodríguez",
  position: "Analista",
  department: "Gestión Humana",
  photoUrl: "https://example.com/maria.jpg",
};

describe("PortadaBanner", () => {
  it("greets the person with photo, role and stats", () => {
    render(
      <PortadaBanner
        perfil={PERFIL}
        siguientePaso="Te falta 1 lección para terminar “Seguridad”."
        stats={{ completados: 3, enProgreso: 2, certificados: 3 }}
        canManage={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Hola, María" })).toBeTruthy();
    expect(screen.getByText("Analista · Gestión Humana")).toBeTruthy();
    expect((screen.getByAltText("Foto de María Rodríguez") as HTMLImageElement).src).toBe(PERFIL.photoUrl);
    expect(screen.getByText("Te falta 1 lección para terminar “Seguridad”.")).toBeTruthy();
    expect(screen.getByText("En progreso").nextElementSibling?.textContent).toBe("2");
    expect(screen.queryByRole("link", { name: /Gestionar cursos/ })).toBeNull();
  });

  it("falls back to initials, a default nudge, and shows the manager link", () => {
    render(
      <PortadaBanner
        perfil={{ ...PERFIL, photoUrl: null, position: null, department: null }}
        siguientePaso={null}
        stats={{ completados: 0, enProgreso: 0, certificados: 0 }}
        canManage
      />,
    );
    expect(screen.getByText("MR")).toBeTruthy();
    expect(screen.getByText("Explora el catálogo y empieza tu próximo curso.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gestionar cursos/ }).getAttribute("href")).toBe("/aprendizaje/gestion");
  });
});
