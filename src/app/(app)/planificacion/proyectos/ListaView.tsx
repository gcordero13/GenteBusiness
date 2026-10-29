"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckSquare, ChevronRight, Square } from "lucide-react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EstadoOption, TareaListRow } from "./actions";
import { initials } from "./AssigneePicker";
import { progressOpacity } from "./progress";

// Soft background tint for a task's own color tag - same hue, low opacity,
// so it reads as a subtle wash behind the row rather than a solid block.
function softTint(hex: string | null): string | undefined {
  if (!hex || hex.length !== 7) return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return undefined;
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}

function isClosedKind(kind: string | null): boolean {
  return kind === "completado" || kind === "cancelado";
}

// Creator + assignee, deduped (a self-created, self-assigned task shows
// just one avatar) - the people "involved" with this task per the names
// this schema actually tracks.
function involucrados(t: TareaListRow): { id: string; name: string; photoUrl: string | null }[] {
  const people = [{ id: t.createdBy, name: t.creatorName, photoUrl: t.creatorPhotoUrl }];
  if (t.assigneeId && t.assigneeId !== t.createdBy) {
    people.push({ id: t.assigneeId, name: t.assigneeName ?? t.assigneeId, photoUrl: t.assigneePhotoUrl });
  }
  return people;
}

function TaskRow({
  task,
  depth,
  childrenByParent,
  expandedIds,
  toggleExpanded,
  onSelect,
  onToggleComplete,
  estados,
  onChangeEstado,
}: {
  task: TareaListRow;
  depth: number;
  childrenByParent: Map<string, TareaListRow[]>;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onSelect: (t: TareaListRow) => void;
  onToggleComplete: (taskId: string, proyectoId: string, rowEl: HTMLElement) => void;
  // Empty estados / no onChangeEstado (the mixed-project "Mis tareas" view,
  // same restriction Tablero's drag-and-drop already has - no single estado
  // catalog applies across projects there) falls back to the read-only badge.
  estados: EstadoOption[];
  onChangeEstado?: (taskId: string, estadoId: string, anchorEl: HTMLElement | null) => void;
}) {
  const children = childrenByParent.get(task.id) ?? [];
  const isExpanded = expandedIds.has(task.id);
  const estadoCellRef = useRef<HTMLDivElement>(null);
  const estadoEditable = Boolean(onChangeEstado) && estados.length > 0;

  return (
    <>
      <tr className="border-b last:border-0 hover:brightness-95" style={{ backgroundColor: softTint(task.color) }}>
        <td className="p-3">
          {task.hasChildren ? (
            <span className="inline-flex" title="Calculado a partir de las subtareas">
              <CheckSquare className="size-4 text-muted-foreground opacity-30" />
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (task.percentComplete === 100) return;
                onToggleComplete(task.id, task.proyectoId, e.currentTarget);
              }}
              className="shrink-0 text-muted-foreground"
            >
              {task.percentComplete === 100 ? (
                <CheckSquare className="size-4 text-[#04B1AF]" />
              ) : (
                <Square className="size-4" />
              )}
            </button>
          )}
        </td>
        <td className="cursor-pointer p-3 font-medium text-foreground" onClick={() => onSelect(task)}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {children.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(task.id);
                }}
                className="shrink-0 text-muted-foreground"
              >
                <ChevronRight className={`size-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="inline-block size-3.5 shrink-0" />
            )}
            {task.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: task.color }} />}
            <span className={children.length > 0 ? "font-semibold" : ""}>{task.title}</span>
            {children.length > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {children.length}
              </span>
            )}
          </div>
        </td>
        <td className="p-3 text-muted-foreground">
          <Link href={`/planificacion/proyectos/${task.proyectoId}`} className="hover:text-[#04B1AF] hover:underline">
            {task.proyectoName}
          </Link>
        </td>
        <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(task)}>
          {task.planificacionName ?? "—"}
        </td>
        <td className={estadoEditable ? "p-3 text-muted-foreground" : "cursor-pointer p-3 text-muted-foreground"} onClick={estadoEditable ? undefined : () => onSelect(task)}>
          {estadoEditable ? (
            <div ref={estadoCellRef} className="inline-block">
              <Select
                value={task.estadoId ?? undefined}
                onValueChange={(v) => v && onChangeEstado!(task.id, v, estadoCellRef.current)}
              >
                <SelectTrigger size="sm" className="h-7 gap-1.5 border-none bg-transparent px-1.5 text-xs shadow-none hover:bg-muted">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.estadoColor ?? "#94a3b8" }} />
                  <SelectValue>{() => task.estadoName ?? "—"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {estados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.color ?? "#94a3b8" }} />
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: task.estadoColor ?? "#94a3b8" }} />
              {task.estadoName ?? "—"}
            </span>
          )}
        </td>
        <td className="cursor-pointer p-3" onClick={() => onSelect(task)}>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-[#04B1AF] transition-[width] duration-300"
                style={{ width: `${task.percentComplete}%`, opacity: progressOpacity(task.percentComplete) }}
              />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{task.percentComplete}%</span>
          </div>
        </td>
        <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(task)}>
          {task.priority ?? "—"}
        </td>
        <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(task)}>
          {task.dueDate ?? "—"}
        </td>
        <td className="cursor-pointer p-3" onClick={() => onSelect(task)}>
          <AvatarGroup>
            {involucrados(task).map((p) => (
              <Avatar key={p.id} size="sm" title={p.name}>
                {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                <AvatarFallback>{initials(p.name)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </td>
      </tr>
      {isExpanded &&
        children.map((child) => (
          <TaskRow
            key={child.id}
            task={child}
            depth={depth + 1}
            childrenByParent={childrenByParent}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            onSelect={onSelect}
            onToggleComplete={onToggleComplete}
            estados={estados}
            onChangeEstado={onChangeEstado}
          />
        ))}
    </>
  );
}

export function ListaView({
  tasks,
  allTasks,
  onSelect,
  onToggleComplete,
  estados = [],
  onChangeEstado,
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
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (tasks.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin tareas todavía.</p>;
  }

  const childrenByParent = new Map<string, TareaListRow[]>();
  for (const t of allTasks) {
    if (!t.parentTaskId) continue;
    if (!childrenByParent.has(t.parentTaskId)) childrenByParent.set(t.parentTaskId, []);
    childrenByParent.get(t.parentTaskId)!.push(t);
  }

  // Closed root tasks (completado/cancelado) sink to the bottom, keeping
  // their relative order otherwise - Array#sort is a stable sort, so this
  // only ever moves closed tasks down, never reorders within either group.
  const sortedTasks = [...tasks].sort((a, b) => Number(isClosedKind(a.estadoKind)) - Number(isClosedKind(b.estadoKind)));

  return (
    <div className="max-h-[32rem] overflow-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="w-8 p-3"></th>
            <th className="p-3 font-medium">Título</th>
            <th className="p-3 font-medium">Proyecto</th>
            <th className="p-3 font-medium">Planificación</th>
            <th className="p-3 font-medium">Estado</th>
            <th className="p-3 font-medium">Progreso</th>
            <th className="p-3 font-medium">Prioridad</th>
            <th className="p-3 font-medium">Fecha límite</th>
            <th className="p-3 font-medium">Involucrados</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              depth={0}
              childrenByParent={childrenByParent}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onSelect={onSelect}
              onToggleComplete={onToggleComplete}
              estados={estados}
              onChangeEstado={onChangeEstado}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
