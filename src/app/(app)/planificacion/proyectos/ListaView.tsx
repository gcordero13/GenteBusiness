"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, FolderOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { EstadoOption, TareaListRow } from "./actions";
import { BarraAvance, EstadoPill, FechaLimiteText, PersonaAvatar, PrioridadBadge } from "./Distintivos";
import { esCerrada, hoyISO, subtareasResumen } from "./visual";

type ChildrenMap = Map<string, TareaListRow[]>;

interface RowProps {
  childrenByParent: ChildrenMap;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onSelect: (t: TareaListRow) => void;
  onToggleComplete: (taskId: string, proyectoId: string, rowEl: HTMLElement) => void;
  // Empty estados / no onChangeEstado (the mixed-project "Mis tareas" view,
  // same restriction Tablero's drag-and-drop already has - no single estado
  // catalog applies across projects there) falls back to the read-only pill.
  estados: EstadoOption[];
  onChangeEstado?: (taskId: string, estadoId: string, anchorEl: HTMLElement | null) => void;
  showProyecto: boolean;
  hoy: string;
}

/** Square checkbox: done tasks fill with the brand color; parents are computed from their sub-tasks. */
function CompleteToggle({
  task,
  onToggleComplete,
  size = "size-[18px]",
}: {
  task: TareaListRow;
  onToggleComplete: RowProps["onToggleComplete"];
  size?: string;
}) {
  const done = task.percentComplete === 100;
  if (task.hasChildren) {
    return (
      <span
        title="Se completa con sus subtareas"
        className={`${size} inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 ${done ? "bg-[#04B1AF]/30" : ""}`}
      >
        {done && <Check className="size-3 text-white" />}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={done ? "Tarea completada" : `Marcar "${task.title}" como completada`}
      onClick={(e) => {
        e.stopPropagation();
        if (done) return;
        onToggleComplete(task.id, task.proyectoId, e.currentTarget);
      }}
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${
        done ? "border-[#04B1AF] bg-[#04B1AF] text-white" : "border-muted-foreground/50 hover:border-[#04B1AF]"
      }`}
    >
      {done && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}

function EstadoCell({ task, estados, onChangeEstado }: Pick<RowProps, "estados" | "onChangeEstado"> & { task: TareaListRow }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!onChangeEstado || estados.length === 0) return <EstadoPill name={task.estadoName} color={task.estadoColor} />;
  return (
    <div ref={ref} className="inline-block max-w-full" onClick={(e) => e.stopPropagation()}>
      <Select value={task.estadoId ?? undefined} onValueChange={(v) => v && onChangeEstado(task.id, v, ref.current)}>
        <SelectTrigger
          size="sm"
          aria-label={`Estado de "${task.title}"`}
          className="h-auto max-w-full gap-1 border-none bg-transparent p-0 shadow-none hover:opacity-80 [&>svg]:size-3"
        >
          <EstadoPill name={task.estadoName} color={task.estadoColor} />
        </SelectTrigger>
        <SelectContent>
          {estados.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color ?? "#94a3b8" }} />
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TaskRow({ task, depth, ...p }: RowProps & { task: TareaListRow; depth: number }) {
  const children = p.childrenByParent.get(task.id) ?? [];
  const isExpanded = p.expandedIds.has(task.id);
  const resumen = subtareasResumen(children);
  const cerrada = esCerrada(task.estadoKind) || task.percentComplete === 100;

  return (
    <>
      <tr className="cursor-pointer border-t transition-colors hover:bg-muted/50" onClick={() => p.onSelect(task)}>
        <td className="py-2.5 pr-2 pl-4">
          <div className="flex min-w-0 items-center gap-2.5" style={{ paddingLeft: `${depth * 1.75}rem` }}>
            <CompleteToggle task={task} onToggleComplete={p.onToggleComplete} />
            {children.length > 0 ? (
              <button
                type="button"
                aria-label={isExpanded ? "Ocultar subtareas" : "Ver subtareas"}
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.stopPropagation();
                  p.toggleExpanded(task.id);
                }}
                className="-m-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className={`size-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="inline-block size-4 shrink-0" />
            )}
            {task.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: task.color }} />}
            <span
              className={`truncate text-sm ${children.length > 0 ? "font-semibold" : ""} ${
                cerrada ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {task.title}
            </span>
            {resumen && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {resumen} subtareas
              </span>
            )}
          </div>
        </td>
        {p.showProyecto && (
          <td className="px-2 py-2.5 text-sm">
            <Link
              href={`/planificacion/proyectos/${task.proyectoId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-[#036E6C] hover:underline dark:hover:text-[#5FD6D4]"
            >
              {task.proyectoName}
            </Link>
          </td>
        )}
        <td className="px-2 py-2.5">
          <EstadoCell task={task} estados={p.estados} onChangeEstado={p.onChangeEstado} />
        </td>
        <td className="px-2 py-2.5">
          <PrioridadBadge priority={task.priority} />
        </td>
        <td className="px-2 py-2.5">
          {task.assigneeName ? (
            <span className="flex min-w-0 items-center gap-2">
              <PersonaAvatar name={task.assigneeName} photoUrl={task.assigneePhotoUrl} />
              <span className="truncate text-sm">{task.assigneeName}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Sin asignar</span>
          )}
        </td>
        <td className="px-2 py-2.5">
          <FechaLimiteText dueDate={task.dueDate} hoy={p.hoy} cerrada={cerrada} />
        </td>
        <td className="py-2.5 pr-4 pl-2">
          <BarraAvance percent={task.percentComplete} />
        </td>
      </tr>
      {isExpanded && children.map((child) => <TaskRow key={child.id} task={child} depth={depth + 1} {...p} />)}
    </>
  );
}

/** Phone layout: one card per task instead of a wide table (approved redesign). */
function TaskCard({ task, ...p }: RowProps & { task: TareaListRow }) {
  const resumen = subtareasResumen(p.childrenByParent.get(task.id) ?? []);
  const cerrada = esCerrada(task.estadoKind) || task.percentComplete === 100;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => p.onSelect(task)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            p.onSelect(task);
          }
        }}
        className="flex gap-3 rounded-xl border bg-card p-3.5 text-left shadow-xs active:bg-muted/50"
      >
        <span className="pt-0.5">
          <CompleteToggle task={task} onToggleComplete={p.onToggleComplete} size="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className={`text-[15px] leading-snug font-semibold ${cerrada ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {task.title}
          </span>
          {p.showProyecto && <span className="-mt-1 text-xs text-muted-foreground">{task.proyectoName}</span>}
          <span className="flex flex-wrap items-center gap-2">
            <EstadoPill name={task.estadoName} color={task.estadoColor} />
            <PrioridadBadge priority={task.priority} />
            {resumen && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{resumen}</span>
            )}
          </span>
          <span className="flex items-center justify-between gap-2">
            <FechaLimiteText dueDate={task.dueDate} hoy={p.hoy} cerrada={cerrada} />
            {task.assigneeName && <PersonaAvatar name={task.assigneeName} photoUrl={task.assigneePhotoUrl} />}
          </span>
        </span>
      </div>
    </li>
  );
}

interface Grupo {
  key: string;
  title: string | null;
  tasks: TareaListRow[];
}

export function ListaView({
  tasks,
  allTasks,
  onSelect,
  onToggleComplete,
  estados = [],
  onChangeEstado,
  showProyecto = true,
  groupByPlanificacion = false,
}: {
  // Root-level tasks shown as the table's top-level rows.
  tasks: TareaListRow[];
  // Full set (roots + every level of sub-tasks) this project/view has
  // loaded, already in memory - expanding a row reads straight from this,
  // so it's instant with no extra fetch or loading state.
  allTasks: TareaListRow[];
  onSelect: (t: TareaListRow) => void;
  onToggleComplete: (taskId: string, proyectoId: string, rowEl: HTMLElement) => void;
  estados?: EstadoOption[];
  onChangeEstado?: (taskId: string, estadoId: string, anchorEl: HTMLElement | null) => void;
  /** Off inside a single project, where the column would repeat the same name. */
  showProyecto?: boolean;
  /** Group root tasks under their planificación (inside a single project). */
  groupByPlanificacion?: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const hoy = useMemo(() => hoyISO(), []);

  const childrenByParent = useMemo(() => {
    const map: ChildrenMap = new Map();
    for (const t of allTasks) {
      if (!t.parentTaskId) continue;
      if (!map.has(t.parentTaskId)) map.set(t.parentTaskId, []);
      map.get(t.parentTaskId)!.push(t);
    }
    return map;
  }, [allTasks]);

  const grupos = useMemo<Grupo[]>(() => {
    // Closed root tasks (completado/cancelado) sink to the bottom, keeping
    // their relative order otherwise - Array#sort is stable.
    const sorted = [...tasks].sort((a, b) => Number(esCerrada(a.estadoKind)) - Number(esCerrada(b.estadoKind)));
    if (!groupByPlanificacion || !sorted.some((t) => t.planificacionName)) {
      return [{ key: "todas", title: null, tasks: sorted }];
    }
    const byPlan = new Map<string, Grupo>();
    for (const t of sorted) {
      const key = t.planificacionId ?? "sin-planificacion";
      if (!byPlan.has(key)) byPlan.set(key, { key, title: t.planificacionName ?? "Sin planificación", tasks: [] });
      byPlan.get(key)!.tasks.push(t);
    }
    const list = [...byPlan.values()];
    if (list.length <= 1) return [{ key: "todas", title: null, tasks: sorted }];
    return [...list.filter((g) => g.key !== "sin-planificacion"), ...list.filter((g) => g.key === "sin-planificacion")];
  }, [tasks, groupByPlanificacion]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
        <FolderOpen className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sin tareas todavía</p>
        <p className="text-sm text-muted-foreground">Las tareas que crees o te asignen aparecerán aquí.</p>
      </div>
    );
  }

  const rowProps: RowProps = {
    childrenByParent,
    expandedIds,
    toggleExpanded,
    onSelect,
    onToggleComplete,
    estados,
    onChangeEstado,
    showProyecto,
    hoy,
  };
  const columnCount = showProyecto ? 7 : 6;

  return (
    <>
      <div className="hidden max-h-[40rem] overflow-auto rounded-2xl border bg-card shadow-xs md:block">
        <table className="w-full min-w-[56rem] table-fixed">
          <colgroup>
            <col />
            {showProyecto && <col className="w-[11rem]" />}
            <col className="w-[10rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[11rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[9.5rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="py-3 pr-2 pl-4 font-semibold">Tarea</th>
              {showProyecto && <th className="px-2 py-3 font-semibold">Proyecto</th>}
              <th className="px-2 py-3 font-semibold">Estado</th>
              <th className="px-2 py-3 font-semibold">Prioridad</th>
              <th className="px-2 py-3 font-semibold">Responsable</th>
              <th className="px-2 py-3 font-semibold">Fecha límite</th>
              <th className="py-3 pr-4 pl-2 font-semibold">Avance</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.key}>
                {g.title && (
                  <tr className="border-t bg-card">
                    <td colSpan={columnCount} className="px-4 pt-4 pb-1.5">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#036E6C] dark:text-[#5FD6D4]">
                        <FolderOpen className="size-4" />
                        {g.title}
                        <span className="font-normal text-muted-foreground">
                          · {g.tasks.length} {g.tasks.length === 1 ? "tarea" : "tareas"}
                        </span>
                      </span>
                    </td>
                  </tr>
                )}
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} depth={0} {...rowProps} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {grupos.map((g) => (
          <section key={g.key} className="space-y-2">
            {g.title && (
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#036E6C] dark:text-[#5FD6D4]">
                <FolderOpen className="size-4" />
                {g.title}
              </h3>
            )}
            <ul className="space-y-2">
              {g.tasks.map((t) => (
                <TaskCard key={t.id} task={t} {...rowProps} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
