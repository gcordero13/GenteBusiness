export interface CategoryCount {
  category: string;
  label: string;
  count: number;
}

export function ComplaintsCategoryChart({ counts }: { counts: CategoryCount[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  const barHeight = 24;
  const gap = 12;
  const chartHeight = counts.length * (barHeight + gap);
  const labelWidth = 140;
  const chartWidth = 320;

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-3 text-sm font-semibold">Quejas por categoría</p>
      <svg
        width="100%"
        viewBox={`0 0 ${labelWidth + chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Quejas por categoría"
      >
        {counts.map((c, i) => {
          const y = i * (barHeight + gap);
          const width = (c.count / max) * chartWidth;
          return (
            <g key={c.category}>
              <text x={0} y={y + barHeight / 2 + 4} className="fill-muted-foreground text-xs">
                {c.label}
              </text>
              <rect x={labelWidth} y={y} width={width} height={barHeight} rx={4} className="fill-[#04B1AF]" />
              <text x={labelWidth + width + 6} y={y + barHeight / 2 + 4} className="fill-foreground text-xs font-medium">
                {c.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
