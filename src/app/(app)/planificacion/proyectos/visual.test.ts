import { describe, expect, it } from "vitest";
import { colorDe, esCerrada, fechaLimite, iniciales, resumenTareas, saludProyecto, subtareasResumen } from "./visual";

describe("fechaLimite", () => {
  const HOY = "2026-11-27";

  it("shows a plain, readable date", () => {
    expect(fechaLimite("2026-12-05", HOY, false)).toEqual({ label: "5 dic 2026", tone: "normal" });
  });

  it("warns about today and tomorrow", () => {
    expect(fechaLimite("2026-11-27", HOY, false)).toEqual({ label: "Vence hoy", tone: "pronto" });
    expect(fechaLimite("2026-11-28", HOY, false)).toEqual({ label: "Vence mañana", tone: "pronto" });
  });

  it("flags overdue open tasks, but not closed ones", () => {
    expect(fechaLimite("2026-11-24", HOY, false)).toEqual({ label: "Venció el 24 nov", tone: "vencida" });
    expect(fechaLimite("2026-11-24", HOY, true)).toEqual({ label: "24 nov 2026", tone: "normal" });
  });

  it("has nothing to show without a date", () => {
    expect(fechaLimite(null, HOY, false)).toBeNull();
  });
});

describe("saludProyecto", () => {
  it("goes from Al día to Atento to En riesgo with overdue tasks", () => {
    expect(saludProyecto(0)).toEqual({ label: "Al día", tone: "ok" });
    expect(saludProyecto(2)).toEqual({ label: "Atento", tone: "atento" });
    expect(saludProyecto(3)).toEqual({ label: "En riesgo", tone: "riesgo" });
  });
});

describe("subtareasResumen", () => {
  it("counts done direct sub-tasks", () => {
    expect(subtareasResumen([{ percentComplete: 100 }, { percentComplete: 40 }, { percentComplete: 100 }])).toBe("2/3");
    expect(subtareasResumen([])).toBeNull();
  });
});

describe("resumenTareas", () => {
  const base = { parentTaskId: null, percentComplete: 0, dueDate: null, estadoKind: "asignado", assigneeName: null, assigneePhotoUrl: null };
  it("sums up a project's tasks for its header", () => {
    const r = resumenTareas(
      [
        { ...base, percentComplete: 100, estadoKind: "completado", assigneeName: "Ana" },
        { ...base, percentComplete: 20, dueDate: "2026-11-20", assigneeName: "Luis" },
        { ...base, parentTaskId: "x", percentComplete: 100, assigneeName: "Ana" },
        { ...base, dueDate: "2026-12-20" },
      ],
      "2026-11-27",
    );
    expect(r).toEqual({
      percent: 40,
      tareas: 4,
      completadas: 2,
      vencidas: 1,
      personas: [
        { name: "Ana", photoUrl: null },
        { name: "Luis", photoUrl: null },
      ],
    });
  });

  it("is zero for an empty project", () => {
    expect(resumenTareas([], "2026-11-27")).toMatchObject({ percent: 0, tareas: 0, vencidas: 0 });
  });
});

describe("helpers", () => {
  it("makes a project's initials", () => {
    expect(iniciales("Portal de clientes")).toBe("PC");
    expect(iniciales("Cierre fiscal 2026")).toBe("CF");
    expect(iniciales("  ")).toBe("?");
  });

  it("gives the same color to the same id, from the palette", () => {
    expect(colorDe("abc")).toBe(colorDe("abc"));
    expect(colorDe("abc")).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("knows closed estados", () => {
    expect(esCerrada("completado")).toBe(true);
    expect(esCerrada("cancelado")).toBe(true);
    expect(esCerrada("en_proceso")).toBe(false);
    expect(esCerrada(null)).toBe(false);
  });
});
