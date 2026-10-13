"use client";

import { useMemo, useState } from "react";
import { Calendar, LayoutGrid, List } from "lucide-react";
import { MAINTENANCE_CATEGORIES, type MaintenanceCategoryKey } from "./categories";
import type { MaintenanceRecordRow } from "./actions";
import { MaintenanceCalendar } from "./MaintenanceCalendar";
import { MaintenanceListView } from "./MaintenanceListView";
import { MaintenanceBoardView } from "./MaintenanceBoardView";
import { MaintenanceDetailModal } from "./MaintenanceDetailModal";

type ViewMode = "calendario" | "lista" | "tablero";
const ALL_CATEGORY = "__todas__";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof Calendar }[] = [
  { key: "calendario", label: "Calendario", icon: Calendar },
  { key: "lista", label: "Lista", icon: List },
  { key: "tablero", label: "Tablero", icon: LayoutGrid },
];

export function ServiciosGeneralesWorkspace({
  records,
  canManage,
}: {
  records: MaintenanceRecordRow[];
  canManage: boolean;
}) {
  const today = new Date();
  const [view, setView] = useState<ViewMode>("calendario");
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecordRow | null>(null);

  const filteredRecords = useMemo(
    () => (category === ALL_CATEGORY ? records : records.filter((r) => r.category === category)),
    [records, category],
  );

  const monthRecords = useMemo(() => {
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
    const monthEnd = nextMonthDate.toISOString().slice(0, 10);
    return filteredRecords.filter((r) => r.scheduledDate >= monthStart && r.scheduledDate < monthEnd);
  }, [filteredRecords, year, month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(ALL_CATEGORY)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              category === ALL_CATEGORY
                ? "border-[#04B1AF] bg-[#04B1AF] text-white"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas
          </button>
          {MAINTENANCE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key as MaintenanceCategoryKey)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                category === c.key
                  ? "border-[#04B1AF] bg-[#04B1AF] text-white"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <v.icon className="size-3.5" />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "calendario" && (
        <MaintenanceCalendar
          year={year}
          month={month}
          records={monthRecords}
          onNavigate={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
          onSelectRecord={setSelectedRecord}
        />
      )}
      {view === "lista" && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <MaintenanceListView records={filteredRecords} canManage={canManage} onSelectRecord={setSelectedRecord} />
        </div>
      )}
      {view === "tablero" && <MaintenanceBoardView records={filteredRecords} onSelectRecord={setSelectedRecord} />}

      <MaintenanceDetailModal record={selectedRecord} canManage={canManage} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}
