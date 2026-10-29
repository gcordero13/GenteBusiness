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

export function DashboardView({ tasks }: { tasks: TareaListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
    </div>
  );
}
