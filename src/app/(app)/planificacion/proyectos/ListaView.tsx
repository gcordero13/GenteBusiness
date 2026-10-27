"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TareaListRow } from "./actions";

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

export function ListaView({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    if (!fromDate && !toDate) return tasks;
    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      if (fromDate && t.dueDate < fromDate) return false;
      if (toDate && t.dueDate > toDate) return false;
      return true;
    });
  }, [tasks, fromDate, toDate]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-2.5">
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-muted-foreground">Fecha límite desde</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-muted-foreground">hasta</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>
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
        {(fromDate || toDate) && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} de {tasks.length} tareas en ese rango
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sin tareas en este rango.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Título</th>
                <th className="p-3 font-medium">Proyecto</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium">Progreso</th>
                <th className="p-3 font-medium">Prioridad</th>
                <th className="p-3 font-medium">Fecha límite</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:brightness-95" style={{ backgroundColor: softTint(t.color) }}>
                  <td className="cursor-pointer p-3 font-medium text-foreground" onClick={() => onSelect(t)}>
                    <div className="flex items-center gap-1.5">
                      {t.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                      {t.title}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    <Link href={`/planificacion/proyectos/${t.proyectoId}`} className="hover:text-[#04B1AF] hover:underline">
                      {t.proyectoName}
                    </Link>
                  </td>
                  <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: t.estadoColor ?? "#94a3b8" }} />
                      {t.estadoName ?? "—"}
                    </span>
                  </td>
                  <td className="cursor-pointer p-3" onClick={() => onSelect(t)}>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-[#04B1AF]" style={{ width: `${t.percentComplete}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">{t.percentComplete}%</span>
                    </div>
                  </td>
                  <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                    {t.priority ?? "—"}
                  </td>
                  <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                    {t.dueDate ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
