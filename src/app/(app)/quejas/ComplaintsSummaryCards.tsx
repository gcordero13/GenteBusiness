export interface ComplaintsSummary {
  total: number;
  anonymous: number;
  named: number;
}

export function ComplaintsSummaryCards({ summary }: { summary: ComplaintsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Total de quejas</p>
        <p className="mt-2 text-2xl font-bold">{summary.total}</p>
      </div>
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Anónimas</p>
        <p className="mt-2 text-2xl font-bold">{summary.anonymous}</p>
      </div>
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Con nombre</p>
        <p className="mt-2 text-2xl font-bold">{summary.named}</p>
      </div>
    </div>
  );
}
