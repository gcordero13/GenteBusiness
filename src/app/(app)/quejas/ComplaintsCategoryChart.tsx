export interface CategoryCount {
  category: string;
  label: string;
  count: number;
}

export function ComplaintsCategoryChart({
  counts,
  title = "Quejas por categoría",
}: {
  counts: CategoryCount[];
  title?: string;
}) {
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="space-y-2">
        {counts.map((c) => (
          <div key={c.category} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{c.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-6 rounded bg-[#04B1AF]"
                style={{ width: `${(c.count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-medium">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
