"use client";

import {
  CheckCircle2,
  Eye,
  FileText,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";
import { GoservicesStatusBadge } from "./GoservicesStatusBadge";
import { GoservicesCommentThread } from "./GoservicesCommentThread";
import type { GoservicesRequestRow } from "./actions";
import type { GoservicesExplorerMode } from "./GoservicesTicketExplorer";
import { AssignRequestSelect } from "../../goservices/AssignRequestSelect";
import { AssignedRequestStatusSelect } from "./asignadas/AssignedRequestStatusSelect";

const REQUEST_TYPE_LABELS: Record<GoservicesRequestRow["requestType"], string> = {
  mantenimiento: "Mantenimiento",
  mensajeria: "Mensajería",
};

const UBICACION_LABELS: Record<string, string> = {
  oficina: "Oficina",
  alojamiento: "Alojamiento",
};

// The lifecycle sequence differs by request type: "finalizado_ejecutor" is a
// mantenimiento-only concept (see AssignedRequestStatusSelect) and must never
// show up in a mensajería ticket's stepper.
const MANTENIMIENTO_STEPS: GoservicesStatus[] = ["recibido", "en_proceso", "finalizado_ejecutor", "completado"];
const MENSAJERIA_STEPS: GoservicesStatus[] = ["recibido", "en_proceso", "completado"];

function Field({ label, children, tall }: { label: string; children: ReactNode; tall?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <div
        className={cn(
          "rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-sm",
          tall ? "max-h-40 overflow-y-auto whitespace-pre-wrap" : "truncate",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function StatusStepper({ request }: { request: GoservicesRequestRow }) {
  if (request.status === "cancelado") {
    return <GoservicesStatusBadge status="cancelado" label={STATUS_LABELS.cancelado} />;
  }

  const steps = request.requestType === "mantenimiento" ? MANTENIMIENTO_STEPS : MENSAJERIA_STEPS;
  // "En espera" is a pause, not a forward step in the sequence — the stepper
  // freezes at the last real step reached ("En proceso") and an extra badge
  // next to it communicates the pause, instead of trying to fit "En espera"
  // into the linear progression.
  const isOnHold = request.status === "en_espera";
  const currentIndex = steps.indexOf((isOnHold ? "en_proceso" : request.status) as GoservicesStatus);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {steps.map((step, index) => {
        const reached = currentIndex >= 0 && index <= currentIndex;
        return (
          <span
            key={step}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm",
              reached ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <CheckCircle2 className={cn("size-4", reached ? "text-emerald-500" : "text-muted-foreground/40")} />
            {STATUS_LABELS[step]}
          </span>
        );
      })}
      {isOnHold && <GoservicesStatusBadge status="en_espera" label={STATUS_LABELS.en_espera} />}
    </div>
  );
}

// Shared ticket-detail content — rendered both inline (two-pane "Lista"
// view's right pane) and inside a modal (opened from the Tablero/Tabla
// views), so the two never drift apart.
export function GoservicesTicketDetail({
  request,
  mode,
}: {
  request: GoservicesRequestRow;
  mode: GoservicesExplorerMode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        <p className="text-sm font-semibold text-foreground">Ticket #{request.requestNumber}</p>
        <div className="flex flex-wrap items-center gap-3">
          <StatusStepper request={request} />
          {request.fotoDriveId && request.fotoItemId && (
            <Dialog>
              <DialogTrigger render={<Button variant="secondary" size="sm" className="rounded-full" />}>
                <Eye className="size-3.5" />
                Ver Foto
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Foto de la solicitud</DialogTitle>
                </DialogHeader>
                <img
                  src={`/api/goservices/attachment/${request.fotoDriveId}/${request.fotoItemId}`}
                  alt="Foto de la solicitud"
                  className="max-h-[70vh] w-full object-contain"
                />
              </DialogContent>
            </Dialog>
          )}
          {request.documentoDriveId && request.documentoItemId && (
            <a
              href={`/api/goservices/attachment/${request.documentoDriveId}/${request.documentoItemId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-muted"
            >
              <FileText className="size-3.5" />
              Ver documento
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <Field label="Ticket">#{request.requestNumber}</Field>
          <Field label="Tipo de solicitud">{request.typeLabel}</Field>
          <Field label="Detalle de solicitud" tall>
            {request.detalle}
          </Field>
          <Field label="Estatus">{request.statusLabel}</Field>
          {mode.kind !== "gestor" && (
            <Field label="Asignado a">{request.assignedAppUserEmail ?? "Sin asignar"}</Field>
          )}
        </div>
        <div className="space-y-4">
          <Field label="Solicitud">{REQUEST_TYPE_LABELS[request.requestType]}</Field>
          {request.requestType === "mantenimiento" ? (
            <>
              <Field label="Categoria">{request.subcategoria ?? "—"}</Field>
              <Field label="Ubicación">
                {request.ubicacion ? (UBICACION_LABELS[request.ubicacion] ?? request.ubicacion) : "—"}
              </Field>
            </>
          ) : (
            <>
              <Field label="Nombre de contacto">{request.contactoNombre ?? "—"}</Field>
              <Field label="Teléfono">{request.contactoTelefono ?? "—"}</Field>
              <Field label="Dirección">{request.contactoDireccion ?? "—"}</Field>
            </>
          )}
          <Field label="Fecha de Creación">{request.createdAtLabel}</Field>
        </div>
      </div>

      {mode.kind !== "readonly" && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          {mode.kind === "gestor" && (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Asignado a
                </p>
                <AssignRequestSelect
                  requestId={request.id}
                  assignedAppUserId={request.assignedAppUserId}
                  users={mode.assignableUsers}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Estatus</p>
                <AssignedRequestStatusSelect
                  requestId={request.id}
                  status={request.status}
                  requestType={request.requestType}
                  allStatuses
                />
              </div>
            </div>
          )}
          {mode.kind === "ejecutor" && (
            <AssignedRequestStatusSelect
              requestId={request.id}
              status={request.status}
              requestType={request.requestType}
            />
          )}
        </div>
      )}

      <GoservicesCommentThread requestId={request.id} canComment={mode.kind !== "readonly"} />
    </div>
  );
}
