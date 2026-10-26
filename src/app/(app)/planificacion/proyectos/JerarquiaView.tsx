"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TareaListRow } from "./actions";

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

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        {children.length > 0 ? (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="shrink-0">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="inline-block size-3.5 shrink-0" />
        )}
        <button type="button" onClick={() => onSelect(task)} className="flex-1 truncate text-left">
          {task.title}
        </button>
        {task.estadoName && <span className="shrink-0 text-xs text-muted-foreground">{task.estadoName}</span>}
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
    <div className="space-y-0.5 rounded-2xl border bg-card p-3 shadow-sm">
      {roots.map((t) => (
        <TreeNode key={t.id} task={t} childrenByParent={childrenByParent} onSelect={onSelect} depth={0} />
      ))}
    </div>
  );
}
