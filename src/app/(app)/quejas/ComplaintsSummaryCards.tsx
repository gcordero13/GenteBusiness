import { EyeOff, Inbox, UserCheck } from "lucide-react";

export interface ComplaintsSummary {
  total: number;
  anonymous: number;
  named: number;
}

export function ComplaintsSummaryCards({ summary }: { summary: ComplaintsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Inbox className="size-4 text-[#04B1AF]" />
          Total de quejas
        </div>
        <p className="mt-2 text-2xl font-bold">{summary.total}</p>
      </div>
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <EyeOff className="size-4 text-[#04B1AF]" />
          Anónimas
        </div>
        <p className="mt-2 text-2xl font-bold">{summary.anonymous}</p>
      </div>
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <UserCheck className="size-4 text-[#04B1AF]" />
          Con nombre
        </div>
        <p className="mt-2 text-2xl font-bold">{summary.named}</p>
      </div>
    </div>
  );
}
