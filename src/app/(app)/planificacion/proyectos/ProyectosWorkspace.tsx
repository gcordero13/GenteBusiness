"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, LayoutGrid, List, Network } from "lucide-react";
import { updateTareaFecha, type EstadoOption, type TareaListRow } from "./actions";
import { ListaView } from "./ListaView";
import { TableroView, type TableroColumn } from "./TableroView";
import { CalendarioView } from "./CalendarioView";
import { JerarquiaView } from "./JerarquiaView";
import { TareaDetailModal } from "./TareaDetailModal";
import type { AssigneeOption } from "./TareaCreateDialog";

type ViewMode = "lista" | "tablero" | "calendario" | "jerarquia";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "tablero", label: "Tablero", icon: LayoutGrid },
  { key: "calendario", label: "Calendario", icon: Calendar },
  { key: "jerarquia", label: "Jerarquía", icon: Network },
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
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<ViewMode>("lista");
  const [selected, setSelected] = useState<TareaListRow | null>(null);

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

  function dropEstado(taskId: string, columnKey: string) {
    if (!onDropEstado) return;
    startTransition(async () => {
      await onDropEstado(taskId, columnKey);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {VIEW_OPTIONS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
              view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <v.icon className="size-3.5" />
            {v.label}
          </button>
        ))}
      </div>

      {view === "lista" && <ListaView tasks={tasks} onSelect={setSelected} />}
      {view === "tablero" && (
        <TableroView
          tasks={tasks}
          columns={columns}
          getColumnKey={getColumnKey}
          onSelect={setSelected}
          onDrop={onDropEstado ? dropEstado : undefined}
        />
      )}
      {view === "calendario" && <CalendarioView tasks={tasks} onSelect={setSelected} onReschedule={reschedule} />}
      {view === "jerarquia" && <JerarquiaView tasks={tasks} onSelect={setSelected} />}

      <TareaDetailModal
        tarea={selected}
        onClose={() => setSelected(null)}
        estados={estados}
        assignees={assignees}
      />
    </div>
  );
}
