import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CatalogCurso } from "@/lib/aprendizaje/types";
import { PortadaBanner } from "./PortadaBanner";

const PERFIL = {
  name: "María Rodríguez",
  position: "Analista",
  department: "Gestión Humana",
  photoUrl: "https://example.com/maria.jpg",
};

const COMPLETADO: CatalogCurso = {
  id: "c1",
  title: "Ciberseguridad",
  description: null,
  category: "curso",
  cover: null,
  leccionCount: 3,
  completedLecciones: 3,
  completedAt: "2026-11-12T15:00:00Z",
  enrolled: true,
  hasEvaluacion: true,
  nota: 85,
};

describe("PortadaBanner", () => {
  it("greets the person with photo, role and compact counters", () => {
    render(
      <PortadaBanner
        perfil={PERFIL}
        siguientePaso="Te falta 1 lección para terminar “Seguridad”."
        stats={{ completados: 3, enProgreso: 2 }}
        certificados={[COMPLETADO]}
        canManage={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Hola, María" })).toBeTruthy();
    expect(screen.getByText("Analista · Gestión Humana")).toBeTruthy();
    expect((screen.getByAltText("Foto de María Rodríguez") as HTMLImageElement).src).toBe(PERFIL.photoUrl);
    expect(screen.getByText("Te falta 1 lección para terminar “Seguridad”.")).toBeTruthy();
    expect(screen.getByText("En progreso").previousElementSibling?.textContent).toBe("2");
    expect(screen.getByRole("button", { name: "Ver mis certificados (1)" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Gestionar cursos/ })).toBeNull();
  });

  it("opens the certificates when clicking their counter", async () => {
    render(
      <PortadaBanner
        perfil={PERFIL}
        siguientePaso={null}
        stats={{ completados: 1, enProgreso: 0 }}
        certificados={[COMPLETADO]}
        canManage={false}
      />,
    );
    expect(screen.queryByText("Mis certificados")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ver mis certificados (1)" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Mis certificados")).toBeTruthy();
    expect(within(dialog).getByText("Ciberseguridad")).toBeTruthy();
    expect(within(dialog).getByText(/Completado el 12\/11\/2026 · Nota 85%/)).toBeTruthy();
  });

  it("falls back to initials, a default nudge, and shows the manager link", () => {
    render(
      <PortadaBanner
        perfil={{ ...PERFIL, photoUrl: null, position: null, department: null }}
        siguientePaso={null}
        stats={{ completados: 0, enProgreso: 0 }}
        certificados={[]}
        canManage
      />,
    );
    expect(screen.getByText("MR")).toBeTruthy();
    expect(screen.getByText("Explora el catálogo y empieza tu próximo curso.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gestionar cursos/ }).getAttribute("href")).toBe("/aprendizaje/gestion");
  });
});
