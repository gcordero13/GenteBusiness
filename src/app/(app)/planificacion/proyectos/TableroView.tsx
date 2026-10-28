"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TareaListRow } from "./actions";
import { initials } from "./AssigneePicker";
import { progressOpacity } from "./progress";

export interface TableroColumn {
  key: string;
  label: string;
  color: string | null;
}

export function TableroView({
  tasks,
  columns,
  getColumnKey,
  onSelect,
  onDrop,
}: {
  tasks: TareaListRow[];
  columns: TableroColumn[];
  getColumnKey: (t: TareaListRow) => string;
  onSelect: (t: TareaListRow) => void;
  onDrop?: (taskId: string, columnKey: string, cardEl: HTMLElement | null) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingEl, setDraggingEl] = useState<HTMLElement | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const byColumn = new Map<string, TareaListRow[]>();
  for (const c of columns) byColumn.set(c.key, []);
  for (const t of tasks) {
    const key = getColumnKey(t);
    if (!byColumn.has(key)) byColumn.set(key, []);
    byColumn.get(key)!.push(t);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const items = byColumn.get(col.key) ?? [];
        const isDragOver = dragOverKey === col.key;
        return (
          <div
            key={col.key}
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
            className={`w-64 shrink-0 space-y-2 rounded-xl border border-t-4 bg-card p-3 shadow-sm ${
              isDragOver ? "border-[#04B1AF] bg-[#04B1AF]/5" : ""
            }`}
            style={{ borderTopColor: col.color ?? "#94a3b8" }}
          >
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-semibold text-foreground">{col.label}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
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
                  className={`w-full rounded-lg border bg-background p-2.5 text-left text-xs hover:bg-muted ${
                    onDrop ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === t.id ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    {t.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                    <p className="min-w-0 flex-1 truncate font-semibold text-foreground">{t.title}</p>
                    <Avatar size="sm" className="size-5 shrink-0" title={t.assigneeName ?? "Sin asignar"}>
                      {t.assigneePhotoUrl && <AvatarImage src={t.assigneePhotoUrl} alt="" />}
                      <AvatarFallback className="text-[9px]">{t.assigneeName ? initials(t.assigneeName) : "—"}</AvatarFallback>
                    </Avatar>
                  </div>
                  <p className="truncate text-muted-foreground">{t.proyectoName}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-[#04B1AF]"
                        style={{ width: `${t.percentComplete}%`, opacity: progressOpacity(t.percentComplete) }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{t.percentComplete}%</span>
                  </div>
                  {t.dueDate && <p className="mt-1 text-muted-foreground">{t.dueDate}</p>}
                </button>
              ))}
              {items.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Sin tareas</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
