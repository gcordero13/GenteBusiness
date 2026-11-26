import { describe, expect, it } from "vitest";
import { formatFecha, initials, primerNombre, siguientePaso, splitMisCursos } from "./portada";
import type { CatalogCurso } from "./types";

function curso(overrides: Partial<CatalogCurso>): CatalogCurso {
  return {
    id: "c",
    title: "Curso",
    description: null,
    category: "curso",
    cover: null,
    leccionCount: 4,
    completedLecciones: 0,
    completedAt: null,
    enrolled: false,
    hasEvaluacion: false,
    nota: null,
    ...overrides,
  };
}

describe("splitMisCursos", () => {
  it("separates in-progress (most advanced first) from completed (most recent first)", () => {
    const { enProgreso, completados } = splitMisCursos([
      curso({ id: "nuevo" }),
      curso({ id: "poco", enrolled: true, completedLecciones: 1 }),
      curso({ id: "mucho", enrolled: true, completedLecciones: 3 }),
      curso({ id: "viejo", enrolled: true, completedLecciones: 4, completedAt: "2026-10-01T00:00:00Z" }),
      curso({ id: "reciente", enrolled: true, completedLecciones: 4, completedAt: "2026-11-20T00:00:00Z" }),
    ]);
    expect(enProgreso.map((c) => c.id)).toEqual(["mucho", "poco"]);
    expect(completados.map((c) => c.id)).toEqual(["reciente", "viejo"]);
  });
});

describe("siguientePaso", () => {
  it("counts the lessons left in the most advanced course", () => {
    expect(siguientePaso([curso({ title: "Seguridad", enrolled: true, completedLecciones: 3 })])).toBe(
      "Te falta 1 lección para terminar “Seguridad”.",
    );
    expect(siguientePaso([curso({ title: "Seguridad", enrolled: true, completedLecciones: 1 })])).toBe(
      "Te faltan 3 lecciones para terminar “Seguridad”.",
    );
  });

  it("asks to retake a quiz when every lesson is done but the grade is below the minimum", () => {
    expect(
      siguientePaso([curso({ title: "Seguridad", enrolled: true, completedLecciones: 4, hasEvaluacion: true })]),
    ).toBe("Repite algún cuestionario de “Seguridad” para alcanzar la nota mínima.");
  });

  it("returns null with nothing in progress", () => {
    expect(siguientePaso([])).toBeNull();
  });
});

describe("name helpers", () => {
  it("initials and first name", () => {
    expect(initials("María Rodríguez Peña")).toBe("MR");
    expect(initials("ana")).toBe("A");
    expect(initials("")).toBe("?");
    expect(primerNombre("María Rodríguez")).toBe("María");
    expect(primerNombre("persona@empresa.com")).toBe("persona@empresa.com");
  });
});

describe("formatFecha", () => {
  it("formats in the business timezone as dd/mm/yyyy", () => {
    expect(formatFecha("2026-11-12T15:00:00Z")).toBe("12/11/2026");
    // 02:00 UTC is still the previous evening in Santo Domingo (UTC-4).
    expect(formatFecha("2026-11-13T02:00:00Z")).toBe("12/11/2026");
  });
});
