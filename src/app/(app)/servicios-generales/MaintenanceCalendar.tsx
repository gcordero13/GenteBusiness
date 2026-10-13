"use client";

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
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, records: recordsByDay.get(day) ?? [] });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MaintenanceCalendar({
  year,
  month,
  records,
  onNavigate,
  onSelectRecord,
}: {
  year: number;
  month: number;
  records: MaintenanceRecordRow[];
  onNavigate: (year: number, month: number) => void;
  onSelectRecord: (record: MaintenanceRecordRow) => void;
}) {
  const cells = buildMonthGrid(year, month, records);

  function goPrev() {
    onNavigate(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  }
  function goNext() {
    onNavigate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
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
      <div className="grid grid-cols-7 gap-1 text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pb-1 text-center font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`min-h-[72px] rounded-lg border p-1 ${cell ? "bg-background" : "border-transparent"}`}
          >
            {cell && (
              <>
                <p className="mb-1 text-right text-[11px] text-muted-foreground">{cell.day}</p>
                <div className="space-y-0.5">
                  {cell.records.slice(0, 3).map((r) => {
                    const meta = CATEGORY_BY_KEY.get(r.category);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectRecord(r)}
                        className="flex w-full items-center gap-1 rounded hover:bg-muted"
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
