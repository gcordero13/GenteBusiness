"use client";

import { useState } from "react";
import { Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TareaListRow } from "./actions";
import { initials } from "./AssigneePicker";
import { progressOpacity } from "./TableroView";

function TreeNode({
  task,
  childrenByParent,
  onSelect,
  depth,
}: {
  task: TareaListRow;
  childrenByParent: Map<string, TareaListRow[]>;
  onSelect: (t: TareaListRow) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = childrenByParent.get(task.id) ?? [];
  const hasChildren = children.length > 0;

  return (
    <div className="relative">
      {/* Dashed guide line connecting a node to its parent's column, so
          nesting reads as a tree even once several levels deep. */}
      {depth > 0 && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/25"
          style={{ left: `${(depth - 1) * 1.5 + 0.7}rem` }}
        />
      )}
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-2 text-sm hover:bg-muted"
        style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="inline-block size-3.5 shrink-0" />
        )}
        {task.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: task.color }} />}
        <button
          type="button"
          onClick={() => onSelect(task)}
          className={`min-w-[8rem] flex-1 truncate text-left ${hasChildren ? "font-semibold text-foreground" : "text-foreground"}`}
        >
          {task.title}
        </button>

        <div className="flex shrink-0 items-center gap-1.5" title={`Progreso: ${task.percentComplete}%`}>
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-[#04B1AF]"
              style={{ width: `${task.percentComplete}%`, opacity: progressOpacity(task.percentComplete) }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[11px] font-semibold text-muted-foreground">
            {task.percentComplete}%
          </span>
        </div>

        {task.estadoName && (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
            style={{ borderColor: task.estadoColor ?? undefined, color: task.estadoColor ?? undefined }}
          >
            {task.estadoName}
          </span>
        )}

        {task.dueDate && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="size-3" />
            {task.dueDate}
          </span>
        )}

        <Avatar size="sm" className="shrink-0" title={task.assigneeName ?? "Sin asignar"}>
          {task.assigneePhotoUrl && <AvatarImage src={task.assigneePhotoUrl} alt="" />}
          <AvatarFallback>{task.assigneeName ? initials(task.assigneeName) : "—"}</AvatarFallback>
        </Avatar>
      </div>
      {expanded &&
        children.map((c) => (
          <TreeNode key={c.id} task={c} childrenByParent={childrenByParent} onSelect={onSelect} depth={depth + 1} />
        ))}
    </div>
  );
}

// A task whose parent_task_id isn't present in the current `tasks` list
// (e.g. someone shared a deep sub-task directly without sharing its
// ancestors) is treated as a root for display purposes here - it still
// renders correctly, just without its real ancestor chain, which the
// viewer was never granted visibility into anyway.
export function JerarquiaView({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  const childrenByParent = new Map<string, TareaListRow[]>();
  const roots: TareaListRow[] = [];
  for (const t of tasks) {
    if (t.parentTaskId && tasks.some((p) => p.id === t.parentTaskId)) {
      if (!childrenByParent.has(t.parentTaskId)) childrenByParent.set(t.parentTaskId, []);
      childrenByParent.get(t.parentTaskId)!.push(t);
    } else {
      roots.push(t);
    }
  }

  if (roots.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin tareas todavía.</p>;
  }

  return (
    <div className="space-y-1 rounded-2xl border bg-card p-3 shadow-sm">
      <p className="px-2 pb-1 text-[11px] text-muted-foreground">
        Las tareas en <strong className="text-foreground">negrita</strong> tienen subtareas - su progreso se calcula
        automáticamente a partir de ellas. Cada fila muestra, de izquierda a derecha: progreso, estado, fecha límite y
        responsable.
      </p>
      <div className="space-y-0.5">
        {roots.map((t) => (
          <TreeNode key={t.id} task={t} childrenByParent={childrenByParent} onSelect={onSelect} depth={0} />
        ))}
      </div>
    </div>
  );
}
