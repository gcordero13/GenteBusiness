"use client";

import { AlertTriangle, PieChart, TrendingUp, Users } from "lucide-react";
import type { TareaListRow } from "./actions";

// Icon bubble + title shared by every widget header, themed per widget via
// `accent` (a Tailwind text-color class) - the colored top border on each
// widget's own card uses a matching border-t-* class.
function WidgetHeader({ icon: Icon, accent, title }: { icon: typeof TrendingUp; accent: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-current/10 ${accent}`}>
        <Icon className="size-4" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

// Reusable donut: one <circle> per segment, each offset by the cumulative
// length of every prior segment so they tile around the ring without
// gaps or overlap. `-rotate-90` on the <svg> starts the first segment at
// 12 o'clock instead of SVG's default 3 o'clock start point.
function Donut({
  segments,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  centerLabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const size = 120;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetSoFar = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {total === 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted"
            strokeWidth={strokeWidth}
          />
        ) : (
          segments.map((s, i) => {
            const length = (s.value / total) * circumference;
            const dashoffset = -offsetSoFar;
            offsetSoFar += length;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashoffset}
              />
            );
          })
        )}
      </svg>
      {centerLabel && (
        <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-foreground">
          {centerLabel}
        </div>
      )}
    </div>
  );
}

// Same calculation as proyectoPercent in [id]/page.tsx (average of root
// tasks' percentComplete), computed here from whatever `tasks` this widget
// was given (which may be date-filtered) instead of needing a prop passed
// down from the page for a number it can derive itself.
function AvanceGeneralWidget({ tasks }: { tasks: TareaListRow[] }) {
  const rootTasks = tasks.filter((t) => !t.parentTaskId);
  const percent =
    rootTasks.length > 0
      ? Math.round(rootTasks.reduce((sum, t) => sum + t.percentComplete, 0) / rootTasks.length)
      : 0;

  return (
    <div className="rounded-2xl border border-t-4 border-t-[#04B1AF] bg-card p-4 shadow-sm">
      <WidgetHeader icon={TrendingUp} accent="text-[#04B1AF]" title="Avance general" />
      {rootTasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas todavía.</p>
      ) : (
        <div className="flex justify-center">
          <Donut
            segments={[
              { value: percent, color: "#04B1AF" },
              { value: 100 - percent, color: "#e5e7eb" },
            ]}
            centerLabel={`${percent}%`}
          />
        </div>
      )}
    </div>
  );
}

// Counts EVERY task (roots and sub-tasks alike - each has its own
// estado_id independent of percentComplete being a rollup for parents),
// grouped by estado. Tasks with no estado_id fall into a "Sin estado"
// bucket instead of being silently dropped.
function DesgloseEstadoWidget({ tasks }: { tasks: TareaListRow[] }) {
  const groups = new Map<string, { name: string; color: string; count: number }>();
  for (const t of tasks) {
    const key = t.estadoId ?? "sin-estado";
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { name: t.estadoName ?? "Sin estado", color: t.estadoColor ?? "#94a3b8", count: 1 });
    }
  }
  const entries = [...groups.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-2xl border border-t-4 border-t-indigo-400 bg-card p-4 shadow-sm">
      <WidgetHeader icon={PieChart} accent="text-indigo-500" title="Desglose por estado" />
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas todavía.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Donut segments={entries.map((e) => ({ value: e.count, color: e.color }))} centerLabel={String(tasks.length)} />
          <div className="min-w-0 flex-1 space-y-1">
            {entries.map((e) => (
              <div key={e.name} className="flex items-center gap-1.5 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{e.name}</span>
                <span className="shrink-0 font-semibold text-muted-foreground">{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Leaf tasks only (!hasChildren) - a task with sub-tasks isn't anyone's
// direct workload, the same distinction Lista's inline checkbox already
// uses for "is this task's percent directly settable".
function CargaResponsableWidget({ tasks }: { tasks: TareaListRow[] }) {
  const leafTasks = tasks.filter((t) => !t.hasChildren);
  const counts = new Map<string, number>();
  for (const t of leafTasks) {
    const key = t.assigneeName ?? "Sin asignar";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? entries[0][1] : 0;

  return (
    <div className="rounded-2xl border border-t-4 border-t-blue-400 bg-card p-4 shadow-sm">
      <WidgetHeader icon={Users} accent="text-blue-500" title="Carga por responsable" />
      {entries.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas todavía.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-foreground">{name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[#04B1AF]" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
              </div>
              <span className="w-5 shrink-0 text-right font-semibold text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Excludes already-completed tasks (percentComplete === 100) even if their
// dueDate is in the past - a finished task isn't "overdue" in any
// actionable sense. dueDate is a plain "YYYY-MM-DD" string, compared
// lexicographically - the same pattern ProyectosWorkspace's own
// fromDate/toDate filter already relies on.
function VencidasWidget({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysIso = in7Days.toISOString().slice(0, 10);

  const pending = tasks.filter((t) => t.dueDate && t.percentComplete !== 100);
  const vencidas = pending.filter((t) => t.dueDate! < todayIso);
  const porVencer = pending.filter((t) => t.dueDate! >= todayIso && t.dueDate! <= in7DaysIso);
  const urgentes = [...vencidas, ...porVencer]
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0))
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-t-4 border-t-red-400 bg-card p-4 shadow-sm">
      <WidgetHeader icon={AlertTriangle} accent="text-red-500" title="Vencidas / por vencer" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-red-50 p-3 text-center">
          <p className="text-3xl font-bold text-red-600">{vencidas.length}</p>
          <p className="text-[11px] text-muted-foreground">Vencidas</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 text-center">
          <p className="text-3xl font-bold text-amber-600">{porVencer.length}</p>
          <p className="text-[11px] text-muted-foreground">Por vencer (7 días)</p>
        </div>
      </div>
      {urgentes.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Sin tareas vencidas ni próximas a vencer.</p>
      ) : (
        <div className="space-y-1">
          {urgentes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-xs hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
              <span className={`shrink-0 font-semibold ${t.dueDate! < todayIso ? "text-red-600" : "text-amber-600"}`}>
                {t.dueDate}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardView({
  tasks,
  onSelect,
}: {
  tasks: TareaListRow[];
  onSelect: (t: TareaListRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
      <CargaResponsableWidget tasks={tasks} />
      <VencidasWidget tasks={tasks} onSelect={onSelect} />
    </div>
  );
}
