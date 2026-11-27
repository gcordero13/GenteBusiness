import { describe, expect, it } from "vitest";
import type { TareaListRow } from "./actions";
import { buildAvances, buildAvancesXlsx } from "./exportAvances";

function tarea(over: Partial<TareaListRow> & Pick<TareaListRow, "id" | "title">): TareaListRow {
  return {
    proyectoId: "p1",
    proyectoName: "Portal web",
    parentTaskId: null,
    description: null,
    estadoId: null,
    estadoName: "En proceso",
    estadoColor: null,
    estadoKind: "en_proceso",
    priority: "media",
    labels: [],
    startDate: null,
    dueDate: "2026-12-05",
    assigneeId: null,
    assigneeName: "Ana Pérez",
    assigneePhotoUrl: null,
    cicloId: null,
    planificacionId: null,
    planificacionName: null,
    createdBy: "u1",
    creatorName: "Ana Pérez",
    creatorPhotoUrl: null,
    moduloIds: [],
    relationship: "mio",
    percentComplete: 50,
    color: null,
    ...over,
  } as TareaListRow;
}

const DISENO = tarea({ id: "t1", title: "Diseño" });
const BOCETOS = tarea({ id: "s1", title: "Bocetos", parentTaskId: "t1", percentComplete: 100, estadoKind: "completado", estadoName: "Completado" });
const COLORES = tarea({ id: "s2", title: "Colores", parentTaskId: "s1", priority: "alta", dueDate: null, assigneeName: null });
const MAQUETA = tarea({ id: "s3", title: "Maqueta", parentTaskId: "t1" });
const NOMINA = tarea({ id: "t2", title: "Nómina", proyectoId: "p2", proyectoName: "Finanzas" });
const CIERRE = tarea({ id: "s4", title: "Cierre", proyectoId: "p2", proyectoName: "Finanzas", parentTaskId: "t2" });
const SIN_SUBTAREAS = tarea({ id: "t3", title: "Hosting", proyectoId: "p1" });
const ALL = [DISENO, BOCETOS, COLORES, MAQUETA, NOMINA, CIERRE, SIN_SUBTAREAS];

describe("buildAvances", () => {
  it("keeps one row per exported task, with how many sub-tasks are done", () => {
    const { tareas } = buildAvances([DISENO, NOMINA, SIN_SUBTAREAS], ALL);
    expect(tareas).toEqual([
      {
        titulo: "Diseño",
        proyecto: "Portal web",
        estado: "En proceso",
        progreso: 50,
        prioridad: "Media",
        responsable: "Ana Pérez",
        fechaLimite: "2026-12-05",
        subtareas: "1 de 3",
      },
      expect.objectContaining({ titulo: "Nómina", subtareas: "0 de 1" }),
      expect.objectContaining({ titulo: "Hosting", subtareas: "" }),
    ]);
  });

  it("groups every level of sub-tasks under its project, in tree order", () => {
    const { subtareasPorProyecto } = buildAvances([DISENO, NOMINA, SIN_SUBTAREAS], ALL);
    expect(subtareasPorProyecto.map((g) => g.proyecto)).toEqual(["Portal web", "Finanzas"]);
    expect(subtareasPorProyecto[0].filas).toEqual([
      expect.objectContaining({ tareaPrincipal: "Diseño", subtarea: "Bocetos", nivel: 1, progreso: 100, estado: "Completado" }),
      expect.objectContaining({ tareaPrincipal: "Diseño", subtarea: "Colores", nivel: 2, prioridad: "Alta", responsable: "", fechaLimite: "" }),
      expect.objectContaining({ tareaPrincipal: "Diseño", subtarea: "Maqueta", nivel: 1 }),
    ]);
    expect(subtareasPorProyecto[1].filas).toEqual([expect.objectContaining({ tareaPrincipal: "Nómina", subtarea: "Cierre" })]);
  });

  it("writes an Excel file with a Tareas sheet and a Subtareas sheet titled by project", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildAvancesXlsx([DISENO, NOMINA, SIN_SUBTAREAS], ALL));

    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tareas", "Subtareas"]);
    const tareas = wb.getWorksheet("Tareas")!;
    expect(tareas.getRow(1).getCell(1).value).toBe("Título");
    expect(tareas.getRow(2).getCell(1).value).toBe("Diseño");
    expect(tareas.getRow(2).getCell(8).value).toBe("1 de 3");

    const sub = wb.getWorksheet("Subtareas")!;
    expect(sub.getRow(1).getCell(1).value).toBe("Portal web");
    expect(sub.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sub.getRow(2).getCell(2).value).toBe("Subtarea");
    expect(sub.getRow(3).getCell(2).value).toBe("Bocetos");
    expect(sub.getRow(4).getCell(2).alignment?.indent).toBe(1);
    // Next project's block, after its 3 rows and a blank line.
    expect(sub.getRow(7).getCell(1).value).toBe("Finanzas");
  });

  it("only includes sub-tasks of the exported tasks", () => {
    const { subtareasPorProyecto } = buildAvances([NOMINA], ALL);
    expect(subtareasPorProyecto).toEqual([
      { proyecto: "Finanzas", filas: [expect.objectContaining({ subtarea: "Cierre" })] },
    ]);
  });
});
