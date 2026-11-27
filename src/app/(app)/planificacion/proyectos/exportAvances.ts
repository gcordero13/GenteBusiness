// Plain module (no "use server"): the "Exportar" button of the task views.
// Builds an Excel workbook in the browser with two sheets:
//  - "Tareas": the tasks currently in view (date filter applied).
//  - "Subtareas": every level of their sub-tasks, grouped under a title row
//    with the project's name (user request, 2026-11-27).
import type { TareaListRow } from "./actions";

const PRIORIDAD: Record<NonNullable<TareaListRow["priority"]>, string> = { alta: "Alta", media: "Media", baja: "Baja" };

export interface FilaTarea {
  titulo: string;
  proyecto: string;
  estado: string;
  progreso: number;
  prioridad: string;
  responsable: string;
  /** ISO date (YYYY-MM-DD) or "". */
  fechaLimite: string;
  /** "2 de 5" completed sub-tasks, or "" when it has none. */
  subtareas: string;
}

export interface FilaSubtarea {
  tareaPrincipal: string;
  subtarea: string;
  /** 1 = direct sub-task of the main task, 2 = sub-task of a sub-task… */
  nivel: number;
  estado: string;
  progreso: number;
  prioridad: string;
  responsable: string;
  fechaLimite: string;
}

export interface Avances {
  tareas: FilaTarea[];
  subtareasPorProyecto: { proyecto: string; filas: FilaSubtarea[] }[];
}

function hijosPorPadre(allTasks: TareaListRow[]): Map<string, TareaListRow[]> {
  const byParent = new Map<string, TareaListRow[]>();
  for (const t of allTasks) {
    if (!t.parentTaskId) continue;
    if (!byParent.has(t.parentTaskId)) byParent.set(t.parentTaskId, []);
    byParent.get(t.parentTaskId)!.push(t);
  }
  return byParent;
}

/** Every descendant of the task, depth-first in list order, with its level. */
function descendientes(root: TareaListRow, byParent: Map<string, TareaListRow[]>): { tarea: TareaListRow; nivel: number }[] {
  const out: { tarea: TareaListRow; nivel: number }[] = [];
  const visit = (id: string, nivel: number) => {
    for (const child of byParent.get(id) ?? []) {
      out.push({ tarea: child, nivel });
      visit(child.id, nivel + 1);
    }
  };
  visit(root.id, 1);
  return out;
}

const esCompletada = (t: TareaListRow) => t.estadoKind === "completado" || t.percentComplete === 100;

/** Pure: the rows of both sheets, for the exported (root) tasks. */
export function buildAvances(rootTasks: TareaListRow[], allTasks: TareaListRow[]): Avances {
  const byParent = hijosPorPadre(allTasks);
  const grupos = new Map<string, { proyecto: string; filas: FilaSubtarea[] }>();

  const tareas = rootTasks.map((t): FilaTarea => {
    const subs = descendientes(t, byParent);
    if (subs.length > 0) {
      const grupo = grupos.get(t.proyectoId) ?? { proyecto: t.proyectoName, filas: [] };
      grupos.set(t.proyectoId, grupo);
      for (const { tarea: s, nivel } of subs) {
        grupo.filas.push({
          tareaPrincipal: t.title,
          subtarea: s.title,
          nivel,
          estado: s.estadoName ?? "",
          progreso: s.percentComplete,
          prioridad: s.priority ? PRIORIDAD[s.priority] : "",
          responsable: s.assigneeName ?? "",
          fechaLimite: s.dueDate ?? "",
        });
      }
    }
    return {
      titulo: t.title,
      proyecto: t.proyectoName,
      estado: t.estadoName ?? "",
      progreso: t.percentComplete,
      prioridad: t.priority ? PRIORIDAD[t.priority] : "",
      responsable: t.assigneeName ?? "",
      fechaLimite: t.dueDate ?? "",
      subtareas: subs.length > 0 ? `${subs.filter((s) => esCompletada(s.tarea)).length} de ${subs.length}` : "",
    };
  });

  return { tareas, subtareasPorProyecto: [...grupos.values()] };
}

const TEAL = "FF036E6C";
const NAVY = "FF0B2545";
const HEADER_FILL = "FFE2F6F5";

/** "2026-12-05" → a date cell (UTC midnight, so Excel shows the same day). */
function fecha(iso: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : "";
}

/** The .xlsx bytes. exceljs is imported lazily so it only loads when someone exports. */
export async function buildAvancesXlsx(rootTasks: TareaListRow[], allTasks: TareaListRow[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const { tareas, subtareasPorProyecto } = buildAvances(rootTasks, allTasks);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gente Sánchez Business";
  wb.created = new Date();

  const estiloEncabezado = (row: import("exceljs").Row) => {
    row.font = { bold: true, color: { argb: NAVY } };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.border = { bottom: { style: "thin", color: { argb: TEAL } } };
      cell.alignment = { vertical: "middle" };
    });
    row.height = 20;
  };

  // Hoja 1: Tareas.
  const hojaTareas = wb.addWorksheet("Tareas", { views: [{ state: "frozen", ySplit: 1 }] });
  hojaTareas.columns = [
    { header: "Título", key: "titulo", width: 42 },
    { header: "Proyecto", key: "proyecto", width: 26 },
    { header: "Estado", key: "estado", width: 16 },
    { header: "Progreso %", key: "progreso", width: 12 },
    { header: "Prioridad", key: "prioridad", width: 11 },
    { header: "Responsable", key: "responsable", width: 26 },
    { header: "Fecha límite", key: "fechaLimite", width: 14, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Subtareas completadas", key: "subtareas", width: 22 },
  ];
  estiloEncabezado(hojaTareas.getRow(1));
  for (const t of tareas) hojaTareas.addRow({ ...t, fechaLimite: fecha(t.fechaLimite) });
  hojaTareas.autoFilter = { from: "A1", to: "H1" };

  // Hoja 2: Subtareas, con el proyecto como título de cada bloque.
  const hojaSub = wb.addWorksheet("Subtareas");
  hojaSub.columns = [
    { key: "tareaPrincipal", width: 34 },
    { key: "subtarea", width: 40 },
    { key: "estado", width: 16 },
    { key: "progreso", width: 12 },
    { key: "prioridad", width: 11 },
    { key: "responsable", width: 26 },
    { key: "fechaLimite", width: 14, style: { numFmt: "dd/mm/yyyy" } },
  ];
  if (subtareasPorProyecto.length === 0) {
    hojaSub.addRow(["Las tareas exportadas no tienen subtareas."]).font = { italic: true };
  }
  for (const grupo of subtareasPorProyecto) {
    const titulo = hojaSub.addRow([grupo.proyecto]);
    hojaSub.mergeCells(titulo.number, 1, titulo.number, 7);
    titulo.height = 24;
    const celda = titulo.getCell(1);
    celda.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    celda.alignment = { vertical: "middle", indent: 1 };

    estiloEncabezado(
      hojaSub.addRow(["Tarea principal", "Subtarea", "Estado", "Progreso %", "Prioridad", "Responsable", "Fecha límite"]),
    );
    for (const f of grupo.filas) {
      const row = hojaSub.addRow({ ...f, fechaLimite: fecha(f.fechaLimite) });
      row.getCell("subtarea").alignment = { indent: f.nivel - 1 };
    }
    hojaSub.addRow([]);
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Builds the workbook in the browser and downloads it. */
export async function exportAvancesXlsx(rootTasks: TareaListRow[], allTasks: TareaListRow[]): Promise<void> {
  const buffer = await buildAvancesXlsx(rootTasks, allTasks);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `avance-tareas-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
