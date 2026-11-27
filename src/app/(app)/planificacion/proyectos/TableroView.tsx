"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { TareaListRow } from "./actions";
import { EstadoPill, FechaLimiteText, PersonaAvatar, PrioridadBadge } from "./Distintivos";
import { progressOpacity } from "./progress";
import { esCerrada, hoyISO } from "./visual";

export interface TableroColumn {
  key: string;
  label: string;
  color: string | null;
}

export function TableroView({
  tasks,
  allTasks = [],
  columns,
  getColumnKey,
  onSelect,
  onDrop,
  showProyecto = true,
}: {
  tasks: TareaListRow[];
  /** Every loaded task, sub-tasks included, for each card's "2/5" sub-task progress. */
  allTasks?: TareaListRow[];
  columns: TableroColumn[];
  getColumnKey: (t: TareaListRow) => string;
  onSelect: (t: TareaListRow) => void;
  onDrop?: (taskId: string, columnKey: string, cardEl: HTMLElement | null) => void;
  showProyecto?: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingEl, setDraggingEl] = useState<HTMLElement | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const hoy = useMemo(() => hoyISO(), []);

  const hijas = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const t of allTasks) {
      if (!t.parentTaskId) continue;
      const s = map.get(t.parentTaskId) ?? { done: 0, total: 0 };
      s.total += 1;
      if (t.percentComplete === 100) s.done += 1;
      map.set(t.parentTaskId, s);
    }
    return map;
  }, [allTasks]);

  const byColumn = new Map<string, TareaListRow[]>();
  for (const c of columns) byColumn.set(c.key, []);
  for (const t of tasks) {
    const key = getColumnKey(t);
    if (!byColumn.has(key)) byColumn.set(key, []);
    byColumn.get(key)!.push(t);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-3">
      {columns.map((col) => {
        const items = byColumn.get(col.key) ?? [];
        const isDragOver = dragOverKey === col.key;
        return (
          <section
            key={col.key}
            aria-label={col.label}
            onDragOver={(e) => {
              if (!onDrop) return;
              e.preventDefault();
              if (dragOverKey !== col.key) setDragOverKey(col.key);
            }}
            onDragLeave={() => setDragOverKey((prev) => (prev === col.key ? null : prev))}
            onDrop={(e) => {
              if (!onDrop) return;
              e.preventDefault();
              setDragOverKey(null);
              const id = draggingId;
              const el = draggingEl;
              setDraggingId(null);
              setDraggingEl(null);
              if (id) onDrop(id, col.key, el);
            }}
            className={`flex w-72 shrink-0 flex-col gap-2.5 rounded-2xl p-3 transition-colors ${
              isDragOver ? "bg-[#04B1AF]/10 ring-2 ring-[#04B1AF]" : "bg-muted/60"
            }`}
          >
            <header className="flex items-center justify-between px-1 py-0.5">
              <EstadoPill name={col.label} color={col.color} className="text-sm" />
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">{items.length}</span>
            </header>
            {items.map((t) => {
              const s = hijas.get(t.id);
              const cerrada = esCerrada(t.estadoKind) || t.percentComplete === 100;
              return (
                <button
                  key={t.id}
                  type="button"
                  draggable={Boolean(onDrop)}
                  onDragStart={(e) => {
                    setDraggingId(t.id);
                    setDraggingEl(e.currentTarget);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDraggingEl(null);
                  }}
                  onClick={() => onSelect(t)}
                  className={`flex w-full flex-col gap-2.5 rounded-xl border bg-card p-3.5 text-left shadow-xs transition-shadow hover:shadow-md ${
                    onDrop ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === t.id ? "opacity-40" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <PrioridadBadge priority={t.priority} />
                    <span className="truncate text-xs text-muted-foreground">
                      {showProyecto ? t.proyectoName : t.planificacionName}
                    </span>
                  </span>
                  <span className="flex items-start gap-2">
                    {t.color && <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                    <span className={`text-sm leading-snug font-semibold ${cerrada ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {t.title}
                    </span>
                  </span>
                  {s && (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-[#04B1AF]"
                          style={{ width: `${(s.done / s.total) * 100}%`, opacity: progressOpacity((s.done / s.total) * 100) }}
                        />
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        {s.done}/{s.total}
                      </span>
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-2 border-t pt-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <FechaLimiteText dueDate={t.dueDate} hoy={hoy} cerrada={cerrada} />
                    </span>
                    <PersonaAvatar name={t.assigneeName} photoUrl={t.assigneePhotoUrl} />
                  </span>
                </button>
              );
            })}
            {items.length === 0 && (
              <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
                {onDrop ? "Arrastra tareas aquí" : "Sin tareas"}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
