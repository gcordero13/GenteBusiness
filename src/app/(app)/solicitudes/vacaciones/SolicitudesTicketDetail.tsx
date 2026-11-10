"use client";

import type { ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/contacts";
import { EstadoPill, TipoPill } from "./SolicitudesPills";
import { RequestFlowSteps } from "./RequestFlowSteps";
import { VacationRequestActions } from "./VacationRequestActions";
import { EditVacationRequestForm } from "./EditVacationRequestForm";
import type { SolicitudRequestRow } from "./SolicitudesTicketExplorer";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

interface Props {
  request: SolicitudRequestRow;
  attachmentUrl: string | undefined;
  signatures: SignatureWithUrl[];
  userId: string;
  canAuthorize: boolean;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-sm">{children}</div>
    </div>
  );
}

// Shared ticket-detail content for the explorer's right pane, mirroring the
// GoServices ticket explorer's detail pane so both modules feel consistent.
export function SolicitudesTicketDetail({ request, attachmentUrl, signatures, userId, canAuthorize }: Props) {
  const isPendingSupervisorForMe = request.status === "pendiente_supervisor" && request.supervisor_app_user_id === userId;
  const isPendingRrhhForMe = request.status === "pendiente_rrhh" && canAuthorize;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        <Avatar size="lg">
          <AvatarFallback className="bg-[#04B1AF]/15 text-[#04B1AF]">
            {getInitials(`${request.first_name} ${request.last_name}`)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {request.first_name} {request.last_name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TipoPill tipo={request.tipo} />
            <EstadoPill status={request.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Período">{request.period ?? "-"}</Field>
        <Field label="Fechas">
          {request.date_from} → {request.date_to}
        </Field>
      </div>

      {attachmentUrl && (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100"
        >
          <Paperclip className="size-4" aria-hidden="true" />
          Ver documento adjunto
        </a>
      )}

      <div>
        <p className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Flujo de la solicitud
        </p>
        <RequestFlowSteps request={request} />
      </div>

      {isPendingSupervisorForMe && (
        <div>
          <p className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Corregir solicitud
          </p>
          <EditVacationRequestForm
            requestId={request.id}
            tipo={request.tipo}
            period={request.period}
            daysRequested={request.days_requested}
            dateFrom={request.date_from}
            dateTo={request.date_to}
            returnDate={request.return_date}
            daysPending={request.days_pending}
            notes={request.notes}
          />
        </div>
      )}

      {(isPendingSupervisorForMe || isPendingRrhhForMe) && (
        <div>
          <p className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Tu respuesta</p>
          <VacationRequestActions
            requestId={request.id}
            role={isPendingSupervisorForMe ? "supervisor" : "rrhh"}
            signatures={signatures}
            tipo={request.tipo}
          />
        </div>
      )}
    </div>
  );
}
