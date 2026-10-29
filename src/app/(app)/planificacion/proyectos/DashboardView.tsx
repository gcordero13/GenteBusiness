"use client";

import type { TareaListRow } from "./actions";

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
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-foreground">
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
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Avance general</p>
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
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Desglose por estado</p>
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
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Carga por responsable</p>
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

export function DashboardView({ tasks }: { tasks: TareaListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
      <CargaResponsableWidget tasks={tasks} />
    </div>
  );
}
