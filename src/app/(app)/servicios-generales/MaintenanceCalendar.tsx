"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CATEGORY_BY_KEY } from "./categories";
import type { MaintenanceRecordRow } from "./actions";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface DayCell {
  day: number;
  dateIso: string;
  records: MaintenanceRecordRow[];
}

// Expects `records` already scoped to the given month/year.
function buildMonthGrid(year: number, month: number, records: MaintenanceRecordRow[]): (DayCell | null)[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7; // Monday-first week

  const recordsByDay = new Map<number, MaintenanceRecordRow[]>();
  for (const r of records) {
    const day = Number(r.scheduledDate.slice(8, 10));
    if (!recordsByDay.has(day)) recordsByDay.set(day, []);
    recordsByDay.get(day)!.push(r);
  }

  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, dateIso, records: recordsByDay.get(day) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// A record can only be dragged to a new day while it's still open - a
// finished or cancelled ticket has nothing left to reschedule.
function isReschedulable(r: MaintenanceRecordRow): boolean {
  return r.status === "programado" || r.status === "vencido";
}

export function MaintenanceCalendar({
  year,
  month,
  records,
  onNavigate,
  onSelectRecord,
  onCreateAtDate,
  onRescheduleRecord,
}: {
  year: number;
  month: number;
  records: MaintenanceRecordRow[];
  onNavigate: (year: number, month: number) => void;
  onSelectRecord: (record: MaintenanceRecordRow) => void;
  onCreateAtDate: (dateIso: string) => void;
  onRescheduleRecord: (recordId: string, newDateIso: string) => void;
}) {
  const cells = buildMonthGrid(year, month, records);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  function goPrev() {
    onNavigate(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  }
  function goNext() {
    onNavigate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  }

  function handleDrop(dateIso: string) {
    setDragOverDate(null);
    const id = draggingId;
    setDraggingId(null);
    if (id) onRescheduleRecord(id, dateIso);
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Calendario de Mantenimientos</h3>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={goPrev}
            className="flex size-6 items-center justify-center rounded hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[9rem] text-center font-medium text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={goNext}
            className="flex size-6 items-center justify-center rounded hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Haz clic en un día para programar - arrastra un mantenimiento a otro día para reprogramarlo.
      </p>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pb-1 text-center font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div
            key={i}
            onClick={() => cell && onCreateAtDate(cell.dateIso)}
            onDragOver={(e) => {
              if (!cell) return;
              e.preventDefault();
              if (dragOverDate !== cell.dateIso) setDragOverDate(cell.dateIso);
            }}
            onDragLeave={() => setDragOverDate((prev) => (cell && prev === cell.dateIso ? null : prev))}
            onDrop={(e) => {
              if (!cell) return;
              e.preventDefault();
              handleDrop(cell.dateIso);
            }}
            className={`min-h-[72px] rounded-lg border p-1 transition-colors ${
              cell ? "cursor-pointer bg-background hover:border-[#04B1AF]/50" : "border-transparent"
            } ${cell && dragOverDate === cell.dateIso ? "border-[#04B1AF] bg-[#04B1AF]/5 ring-2 ring-[#04B1AF]/30" : ""}`}
          >
            {cell && (
              <>
                <p className="mb-1 text-right text-[11px] text-muted-foreground">{cell.day}</p>
                <div className="space-y-0.5">
                  {cell.records.slice(0, 3).map((r) => {
                    const meta = CATEGORY_BY_KEY.get(r.category);
                    const draggable = isReschedulable(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        draggable={draggable}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDraggingId(r.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRecord(r);
                        }}
                        title={draggable ? "Arrastra para reprogramar" : undefined}
                        className={`flex w-full items-center gap-1 rounded hover:bg-muted ${
                          draggable ? "cursor-grab active:cursor-grabbing" : ""
                        } ${draggingId === r.id ? "opacity-40" : ""}`}
                      >
                        <span className={`size-1.5 shrink-0 rounded-full ${meta?.dotClass ?? "bg-muted-foreground"}`} />
                        <span className="truncate text-left text-[10px] text-foreground">
                          {r.scheduledTime ? `${r.scheduledTime.slice(0, 5)} ` : ""}
                          {r.assetName ?? meta?.label.split(" ")[0]}
                        </span>
                      </button>
                    );
                  })}
                  {cell.records.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">+{cell.records.length - 3} más</p>
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
