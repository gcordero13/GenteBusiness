"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Download, LayoutDashboard, LayoutGrid, List, Network } from "lucide-react";
import { updateTareaFecha, updateTareaPercent, type EstadoOption, type PlanificacionRow, type TareaListRow } from "./actions";
import { ListaView } from "./ListaView";
import { TableroView, type TableroColumn } from "./TableroView";
import { CalendarioView } from "./CalendarioView";
import { JerarquiaView } from "./JerarquiaView";
import { DashboardView } from "./DashboardView";
import { TareaDetailModal } from "./TareaDetailModal";
import type { AssigneeOption } from "./TareaCreateDialog";
import { celebrateCompletion } from "./celebrate";
import { exportAvancesXlsx } from "./exportAvances";

type ViewMode = "lista" | "tablero" | "calendario" | "jerarquia" | "dashboard";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "tablero", label: "Tablero", icon: LayoutGrid },
  { key: "calendario", label: "Calendario", icon: Calendar },
  { key: "jerarquia", label: "Jerarquía", icon: Network },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
];

// Reused by both the landing screen (one instance per "Mis tareas"/
// "Compartido conmigo" section, tasks spanning many projects, drag-to-
// change-estado disabled since different projects' estado catalogs don't
// share a common id space) and the project detail screen (one instance,
// tasks scoped to that project, drag-to-change-estado enabled via
// onDropEstado bound to that project's own plan_estados).
export function ProyectosWorkspace({
  tasks,
  columns,
  columnKeyBy,
  onDropEstado,
  defaultProyectoId,
  estados,
  assignees,
  planificaciones = [],
}: {
  tasks: TareaListRow[];
  columns: TableroColumn[];
  columnKeyBy: "estadoId" | "estadoName";
  onDropEstado?: (tareaId: string, estadoId: string) => Promise<{ error?: string }>;
  defaultProyectoId?: string;
  // Catalogs for TareaDetailModal's edit form. Pass [] when the caller spans
  // multiple projects with unrelated catalogs (e.g. the landing page) -
  // TareaDetailModal degrades those fields to read-only when empty.
  estados: EstadoOption[];
  assignees: AssigneeOption[];
  planificaciones?: PlanificacionRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<ViewMode>("lista");
  const [selected, setSelected] = useState<TareaListRow | null>(null);
  // Lives at this shared level (not inside any one view) so it applies
  // uniformly across Lista/Tablero/Calendario/Jerarquía - confirmed with
  // the user: "no como un tab", shown next to the view switcher.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const filteredTasks = useMemo(() => {
    if (!fromDate && !toDate) return tasks;
    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      if (fromDate && t.dueDate < fromDate) return false;
      if (toDate && t.dueDate > toDate) return false;
      return true;
    });
  }, [tasks, fromDate, toDate]);

  // Sub-tasks are a checklist that lives inside their parent task's detail
  // view (and the nested Jerarquía tree) - confirmed with the user: they
  // must not also show up as their own independent cards/rows in the
  // estado-driven views, which would just be clutter. Jerarquía is the one
  // view that needs the full set, including sub-tasks, to nest correctly.
  //
  // A task whose real parent ISN'T in this same batch is treated as a root
  // too (same fallback JerarquiaView already uses) - confirmed with the
  // user with a real bug report: someone who only has a sub-task shared or
  // assigned directly to them (without visibility into its ancestors) was
  // seeing it in Jerarquía but nowhere else, since it has a parentTaskId
  // but that parent never shows up in their own fetched task list.
  const rootFilteredTasks = useMemo(
    () => filteredTasks.filter((t) => !t.parentTaskId || !tasks.some((p) => p.id === t.parentTaskId)),
    [filteredTasks, tasks],
  );

  const getColumnKey =
    columnKeyBy === "estadoId"
      ? (t: TareaListRow) => t.estadoId ?? "sin-estado"
      : (t: TareaListRow) => t.estadoName ?? "sin-estado";

  function reschedule(taskId: string, newDateIso: string) {
    const task = tasks.find((t) => t.id === taskId);
    startTransition(async () => {
      await updateTareaFecha(taskId, newDateIso, task?.proyectoId ?? defaultProyectoId ?? "");
      router.refresh();
    });
  }

  function toggleListaComplete(taskId: string, proyectoId: string, rowEl: HTMLElement) {
    startTransition(async () => {
      const result = await updateTareaPercent(taskId, 100, proyectoId);
      if (!result.error) celebrateCompletion(rowEl);
      router.refresh();
    });
  }

  function dropEstado(taskId: string, columnKey: string, cardEl: HTMLElement | null) {
    if (!onDropEstado) return;
    const task = tasks.find((t) => t.id === taskId);
    const wasComplete = task?.percentComplete === 100;
    const targetEstado = estados.find((e) => e.id === columnKey);
    startTransition(async () => {
      const result = await onDropEstado(taskId, columnKey);
      if (!result.error && !wasComplete && targetEstado?.kind === "completado") {
        celebrateCompletion(cardEl);
      }
      router.refresh();
    });
  }

  // Lista's inline Estado combobox - same transition rules as dropEstado
  // (Tablero drag-and-drop), just a different trigger element.
  function changeListaEstado(taskId: string, estadoId: string, anchorEl: HTMLElement | null) {
    if (!onDropEstado) return;
    const task = tasks.find((t) => t.id === taskId);
    const wasComplete = task?.percentComplete === 100;
    const targetEstado = estados.find((e) => e.id === estadoId);
    startTransition(async () => {
      const result = await onDropEstado(taskId, estadoId);
      if (!result.error && !wasComplete && targetEstado?.kind === "completado") {
        celebrateCompletion(anchorEl);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold sm:px-2.5 ${
                view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title={v.label}
            >
              <v.icon className="size-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        {/* Lives here (not inside any one view, not a tab of its own) so it
            applies uniformly across all four views - confirmed with the
            user: next to the view switcher, not tucked below the table. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(fromDate || toDate) && (
            <span className="text-xs text-muted-foreground">
              {rootFilteredTasks.length} de {tasks.filter((t) => !t.parentTaskId || !tasks.some((p) => p.id === t.parentTaskId)).length}
            </span>
          )}
          <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Desde
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Hasta
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          </label>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </button>
          )}
          {/* Excel with two sheets: the tasks in view (date filter applied)
              and, on "Subtareas", all their sub-tasks under a title row per
              project. allTasks is the unfiltered set so sub-tasks whose own
              date falls outside the filter still come along with their parent. */}
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await exportAvancesXlsx(rootFilteredTasks, tasks);
              } finally {
                setExporting(false);
              }
            }}
            title="Exportar avances a Excel (tareas y subtareas)"
            className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <Download className="size-3.5" />
            {exporting ? "Exportando…" : "Exportar"}
          </button>
        </div>
      </div>

      {/* allTasks is the ORIGINAL unfiltered set, not filteredTasks - a
          sub-task's own due date rarely matches its parent's, so if the
          date filter excluded it there'd be nothing to expand into even
          though the parent itself passed the filter. */}
      {view === "lista" && (
        <ListaView
          tasks={rootFilteredTasks}
          allTasks={tasks}
          onSelect={setSelected}
          onToggleComplete={toggleListaComplete}
          estados={estados}
          onChangeEstado={onDropEstado ? changeListaEstado : undefined}
        />
      )}
      {view === "tablero" && (
        <TableroView
          tasks={rootFilteredTasks}
          columns={columns}
          getColumnKey={getColumnKey}
          onSelect={setSelected}
          onDrop={onDropEstado ? dropEstado : undefined}
        />
      )}
      {view === "calendario" && <CalendarioView tasks={rootFilteredTasks} onSelect={setSelected} onReschedule={reschedule} />}
      {view === "jerarquia" && <JerarquiaView tasks={filteredTasks} onSelect={setSelected} />}
      {view === "dashboard" && <DashboardView tasks={filteredTasks} onSelect={setSelected} />}

      <TareaDetailModal
        tarea={selected}
        onClose={() => setSelected(null)}
        onSelectTarea={setSelected}
        estados={estados}
        assignees={assignees}
        planificaciones={planificaciones}
      />
    </div>
  );
}
