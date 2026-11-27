"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TareaListRow } from "./actions";
import { hoyISO } from "./visual";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface DayCell {
  day: number;
  dateIso: string;
  tasks: TareaListRow[];
}

function buildMonthGrid(year: number, month: number, tasks: TareaListRow[]): (DayCell | null)[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

  const tasksByDay = new Map<number, TareaListRow[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const day = Number(t.dueDate.slice(8, 10));
    if (!tasksByDay.has(day)) tasksByDay.set(day, []);
    tasksByDay.get(day)!.push(t);
  }

  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, dateIso, tasks: tasksByDay.get(day) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarioView({
  tasks,
  onSelect,
  onReschedule,
}: {
  tasks: TareaListRow[];
  onSelect: (t: TareaListRow) => void;
  onReschedule: (taskId: string, newDateIso: string) => void;
}) {
  const hoy = hoyISO();
  const [year, setYear] = useState(Number(hoy.slice(0, 4)));
  const [month, setMonth] = useState(Number(hoy.slice(5, 7)));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthTasks = tasks.filter((t) => t.dueDate?.startsWith(monthPrefix));
  const cells = buildMonthGrid(year, month, monthTasks);

  function goPrev() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function goNext() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-xs">
      <div className="mb-4 flex min-w-[40rem] items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {MONTH_NAMES[month - 1]} {year}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Mes anterior"
            className="flex size-9 items-center justify-center rounded-lg border hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Mes siguiente"
            className="flex size-9 items-center justify-center rounded-lg border hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid min-w-[40rem] grid-cols-7 gap-1.5 text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pb-1 text-center font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              if (!cell) return;
              e.preventDefault();
              if (dragOverDate !== cell.dateIso) setDragOverDate(cell.dateIso);
            }}
            onDragLeave={() => setDragOverDate((prev) => (cell && prev === cell.dateIso ? null : prev))}
            onDrop={(e) => {
              if (!cell) return;
              e.preventDefault();
              setDragOverDate(null);
              const id = draggingId;
              setDraggingId(null);
              if (id) onReschedule(id, cell.dateIso);
            }}
            className={`min-h-[88px] rounded-lg border p-1.5 ${cell ? "bg-background" : "border-transparent"} ${
              cell && dragOverDate === cell.dateIso ? "border-[#04B1AF] bg-[#04B1AF]/5 ring-2 ring-[#04B1AF]/30" : ""
            }`}
          >
            {cell && (
              <>
                <p
                  className={`mb-1 ml-auto flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                    cell.dateIso === hoy ? "bg-[#036E6C] font-semibold text-white" : "text-muted-foreground"
                  }`}
                >
                  {cell.day}
                </p>
                <div className="space-y-1">
                  {cell.tasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDraggingId(t.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => onSelect(t)}
                      title={`${t.title}${t.assigneeName ? ` · ${t.assigneeName}` : ""}`}
                      style={{ backgroundColor: `color-mix(in srgb, ${t.estadoColor ?? "#94a3b8"} 16%, transparent)` }}
                      className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs text-foreground hover:brightness-95 ${
                        draggingId === t.id ? "opacity-40" : ""
                      } ${t.percentComplete === 100 ? "line-through opacity-70" : ""}`}
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.estadoColor ?? "#94a3b8" }} />
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                  {cell.tasks.length > 3 && (
                    <p className="px-1.5 text-xs text-muted-foreground">+{cell.tasks.length - 3} más</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
