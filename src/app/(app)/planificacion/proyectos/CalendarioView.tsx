"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TareaListRow } from "./actions";

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
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
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
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Calendario</h3>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={goPrev} className="flex size-6 items-center justify-center rounded hover:bg-muted">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[9rem] text-center font-medium text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button type="button" onClick={goNext} className="flex size-6 items-center justify-center rounded hover:bg-muted">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
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
            className={`min-h-[72px] rounded-lg border p-1 ${cell ? "bg-background" : "border-transparent"} ${
              cell && dragOverDate === cell.dateIso ? "border-[#04B1AF] bg-[#04B1AF]/5 ring-2 ring-[#04B1AF]/30" : ""
            }`}
          >
            {cell && (
              <>
                <p className="mb-1 text-right text-[11px] text-muted-foreground">{cell.day}</p>
                <div className="space-y-0.5">
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
                      className={`w-full truncate rounded px-1 text-left text-[10px] hover:bg-muted ${
                        draggingId === t.id ? "opacity-40" : ""
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {cell.tasks.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">+{cell.tasks.length - 3} más</p>
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
