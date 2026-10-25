"use client";

import { useMemo, useState } from "react";
import type { PoaObjectiveRow } from "./actions";

type Granularity = "semana" | "mes" | "trimestre" | "año";

const GRANULARITY_OPTIONS: { key: Granularity; label: string }[] = [
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "año", label: "Año" },
];

// Groups an objective's dated progress entries into buckets (ISO week,
// "YYYY-MM", "YYYY-Qn", or "YYYY") and reports the latest value in each
// bucket plus the % of target it represents - computed client-side from
// the full update list, same "fetch everything small, compute in the
// browser" pattern as Suministros' Tablero and Servicios Generales'
// Workspace, since this is an internal tool with modest data volume.
function bucketKey(dateIso: string, granularity: Granularity): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  if (granularity === "año") return String(year);
  if (granularity === "trimestre") return `${year}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (granularity === "mes") return `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  // ISO week number
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${tmp.getUTCFullYear()}-S${String(week).padStart(2, "0")}`;
}

export function ComplianceView({ objective }: { objective: PoaObjectiveRow }) {
  const [granularity, setGranularity] = useState<Granularity>("mes");

  const buckets = useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const u of objective.updates) {
      byBucket.set(bucketKey(u.recordedAt, granularity), u.value); // last write per bucket wins (updates are sorted ascending by recordedAt)
    }
    return [...byBucket.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [objective.updates, granularity]);

  const latestValue = objective.updates.at(-1)?.value ?? null;
  const percent = latestValue != null && objective.targetValue > 0 ? Math.round((latestValue / objective.targetValue) * 100) : null;

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{objective.title}</p>
          <p className="text-xs text-muted-foreground">
            {objective.kpiMetric} · Meta: {objective.targetValue}
            {objective.unit ? ` ${objective.unit}` : ""}
          </p>
        </div>
        {percent != null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              percent >= 100 ? "bg-emerald-50 text-emerald-700" : percent >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
            }`}
          >
            {percent}% de cumplimiento
          </span>
        )}
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
        {GRANULARITY_OPTIONS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGranularity(g.key)}
            className={`flex-1 rounded-md px-2 py-1 font-semibold ${
              granularity === g.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {buckets.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Todavía no hay avances registrados.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Periodo</th>
              <th className="pb-1 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(([bucket, value]) => (
              <tr key={bucket} className="border-b last:border-0">
                <td className="py-1 pr-2 text-foreground">{bucket}</td>
                <td className="py-1 text-muted-foreground">
                  {value}
                  {objective.unit ? ` ${objective.unit}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
