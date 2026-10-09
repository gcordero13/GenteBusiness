import type { ReactNode } from "react";
import { Wrench, Truck, Building2, User } from "lucide-react";
import type { GoservicesRequestRow } from "./actions";
import { GoservicesRequestDetailDialog } from "./GoservicesRequestDetailDialog";
import { GoservicesStatusBadge } from "./GoservicesStatusBadge";

export function GoservicesTicketCard({
  request,
  actions,
}: {
  request: GoservicesRequestRow;
  actions?: ReactNode;
}) {
  const TypeIcon = request.requestType === "mantenimiento" ? Wrench : Truck;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <TypeIcon className="size-4 text-[#04B1AF]" />
          <span>#{request.requestNumber}</span>
        </div>
        <GoservicesStatusBadge status={request.status} label={request.statusLabel} />
      </div>
      <p className="mt-2 text-sm font-medium">{request.typeLabel}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{request.detalle}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <User className="size-3.5" />
          {request.requesterName}
        </span>
        {request.departmentName && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="size-3.5" />
            {request.departmentName}
          </span>
        )}
        <span>{request.createdAtLabel}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <GoservicesRequestDetailDialog request={request} />
        {actions}
      </div>
    </div>
  );
}
