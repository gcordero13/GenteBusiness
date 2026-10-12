"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Eye,
  FileText,
  Inbox,
  MousePointerClick,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { AssignRequestSelect } from "../../goservices/AssignRequestSelect";
import { AssignedRequestStatusSelect } from "./asignadas/AssignedRequestStatusSelect";

export type GoservicesExplorerMode =
  | { kind: "readonly" }
  | { kind: "ejecutor" }
  | {
      kind: "gestor";
      assignableUsers: { id: string; email: string }[];
    };

const PAGE_SIZE = 10;
const ALL_TAB = "todas";

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const currentIndex = steps.indexOf(request.status as GoservicesStatus);

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
    </div>
  );
}

export function GoservicesTicketExplorer({
  requests,
  mode,
}: {
  requests: GoservicesRequestRow[];
  mode: GoservicesExplorerMode;
}) {
  // Deep-linking: /solicitudes/goservices?ticket=<id> (also used by the
  // status-change/assignment emails) should land on that ticket pre-selected
  // — and on the tab that actually shows it, since a ticket whose status
  // isn't "Todas" would otherwise be hidden by the default tab filter.
  const searchParams = useSearchParams();
  const deepLinkedRequest = useMemo(() => {
    const ticketId = searchParams.get("ticket");
    return ticketId ? (requests.find((r) => r.id === ticketId) ?? null) : null;
  }, [requests, searchParams]);

  // Deep-link status wins regardless of mode. Otherwise, ejecutor/gestor
  // users land on "Recibido" (the actionable queue) while a requester's own
  // "Mis solicitudes" view still defaults to showing everything they've
  // submitted.
  const [activeTab, setActiveTab] = useState<string>(
    () => deepLinkedRequest?.status ?? (mode.kind === "ejecutor" || mode.kind === "gestor" ? "recibido" : ALL_TAB),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => deepLinkedRequest?.id ?? null);
  // Mobile (<md) shows one pane at a time — the list or the selected ticket's
  // detail — instead of stacking both. A deep link should land straight on
  // the ticket's detail rather than the list.
  const [mobileView, setMobileView] = useState<"list" | "detail">(() => (deepLinkedRequest ? "detail" : "list"));
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);

  const tabs = useMemo(() => [ALL_TAB, ...Object.keys(STATUS_LABELS)], []);

  // Counts are always against the full, unfiltered-by-tab `requests` prop so
  // each tab shows "how many total", not "how many on the current page" —
  // this is what lets the tab bar double as a mini dashboard on mobile,
  // where the larger GoservicesStatusSummary cards are hidden.
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_TAB]: requests.length };
    for (const status of Object.keys(STATUS_LABELS)) {
      counts[status] = requests.filter((r) => r.status === status).length;
    }
    return counts;
  }, [requests]);

  const filtered = useMemo(
    () => (activeTab === ALL_TAB ? requests : requests.filter((r) => r.status === activeTab)),
    [requests, activeTab],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
    return copy;
  }, [filtered, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, sorted.length);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Falls back to the first visible row whenever the previously-selected id
  // drops out of the filtered/sorted list (tab change, status change, etc.)
  // without needing a separate effect to sync it.
  const selectedRequest = useMemo(() => {
    const found = selectedId ? sorted.find((r) => r.id === selectedId) : undefined;
    return found ?? sorted[0] ?? null;
  }, [sorted, selectedId]);

  function changeTab(tab: string) {
    setActiveTab(tab);
    setPage(1);
  }

  function toggleSort() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    setPage(1);
  }

  function goToPage(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md",
        "transition-shadow duration-300 hover:shadow-lg",
        // Bounded rather than a flat 75vh: tall enough to feel like a real
        // workspace, but clamped so it never balloons on very tall screens
        // nor forces excessive scrolling on short ones.
        "md:h-[70vh] md:max-h-[44rem] md:min-h-[28rem] md:flex-row",
      )}
    >
      {/* LEFT PANE: tabs, sort, list, pagination */}
      <div
        className={cn(
          mobileView === "detail" ? "hidden md:flex" : "flex",
          "w-full min-w-0 flex-col border-b border-border md:w-[30%] md:min-w-[280px] md:border-r md:border-b-0 md:overflow-hidden",
        )}
      >
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-2">
          {tabs.map((tab) => {
            const label = tab === ALL_TAB ? "Todas" : (STATUS_LABELS[tab] ?? tab);
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => changeTab(tab)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150",
                  active
                    ? "bg-[#04B1AF] text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold tabular-nums",
                    active ? "bg-white/25 text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {tabCounts[tab] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {sorted.length} solicitud{sorted.length === 1 ? "" : "es"}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSort}
            title={sortDir === "desc" ? "Más recientes primero" : "Más antiguos primero"}
          >
            {sortDir === "desc" ? <ArrowDownNarrowWide className="size-4" /> : <ArrowUpNarrowWide className="size-4" />}
          </Button>
        </div>

        <div className="max-h-[32rem] flex-1 overflow-y-auto md:max-h-none">
          {pageItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <Inbox className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No hay solicitudes.</p>
            </div>
          ) : (
            pageItems.map((r) => {
              const isSelected = selectedRequest?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(r.id);
                    setMobileView("detail");
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-l-4 border-border/60 border-l-transparent px-3 py-3 text-left transition-colors",
                    isSelected
                      ? "border-l-[#04B1AF] bg-[#04B1AF]/10"
                      : "hover:border-l-[#04B1AF]/30 hover:bg-muted/60",
                  )}
                >
                  <Avatar
                    size="sm"
                    className={cn("mt-0.5 transition-all", isSelected && "ring-2 ring-[#04B1AF]/50")}
                  >
                    <AvatarFallback className="bg-[#04B1AF]/15 text-[#04B1AF]">{initials(r.requesterName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      <span className="font-normal text-muted-foreground">#{r.requestNumber}</span> · {r.requesterName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.typeLabel}</p>
                    <p className="truncate text-xs text-muted-foreground/80">{r.createdAtLabel}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {pageStart} - {pageEnd} de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" disabled={safePage <= 1} onClick={() => goToPage(1)}>
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" disabled={safePage >= totalPages} onClick={() => goToPage(safePage + 1)}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <span>Página {safePage}</span>
        </div>
      </div>

      {/* RIGHT PANE: status stepper, fields grid, context actions */}
      <div
        className={cn(
          mobileView === "list" ? "hidden md:block" : "block",
          "min-w-0 flex-1 overflow-y-auto p-5",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileView("list")}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          <ChevronLeft className="size-4" />
          Volver a la lista
        </button>
        {!selectedRequest ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MousePointerClick className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Selecciona una solicitud para ver el detalle.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="text-sm font-semibold text-foreground">Ticket #{selectedRequest.requestNumber}</p>
              <div className="flex flex-wrap items-center gap-3">
                <StatusStepper request={selectedRequest} />
                {selectedRequest.fotoDriveId && selectedRequest.fotoItemId && (
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
                        src={`/api/goservices/attachment/${selectedRequest.fotoDriveId}/${selectedRequest.fotoItemId}`}
                        alt="Foto de la solicitud"
                        className="max-h-[70vh] w-full object-contain"
                      />
                    </DialogContent>
                  </Dialog>
                )}
                {selectedRequest.documentoDriveId && selectedRequest.documentoItemId && (
                  <a
                    href={`/api/goservices/attachment/${selectedRequest.documentoDriveId}/${selectedRequest.documentoItemId}`}
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
                <Field label="Ticket">#{selectedRequest.requestNumber}</Field>
                <Field label="Tipo de solicitud">{selectedRequest.typeLabel}</Field>
                <Field label="Detalle de solicitud" tall>
                  {selectedRequest.detalle}
                </Field>
                <Field label="Estatus">{selectedRequest.statusLabel}</Field>
                <Field label="Asignado a">{selectedRequest.assignedAppUserEmail ?? "Sin asignar"}</Field>
              </div>
              <div className="space-y-4">
                <Field label="Solicitud">{REQUEST_TYPE_LABELS[selectedRequest.requestType]}</Field>
                {selectedRequest.requestType === "mantenimiento" ? (
                  <>
                    <Field label="Categoria">{selectedRequest.subcategoria ?? "—"}</Field>
                    <Field label="Ubicación">
                      {selectedRequest.ubicacion
                        ? (UBICACION_LABELS[selectedRequest.ubicacion] ?? selectedRequest.ubicacion)
                        : "—"}
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Nombre de contacto">{selectedRequest.contactoNombre ?? "—"}</Field>
                    <Field label="Teléfono">{selectedRequest.contactoTelefono ?? "—"}</Field>
                    <Field label="Dirección">{selectedRequest.contactoDireccion ?? "—"}</Field>
                  </>
                )}
                <Field label="Fecha de Creación">{selectedRequest.createdAtLabel}</Field>
              </div>
            </div>

            {mode.kind !== "readonly" && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                {mode.kind === "gestor" && (
                  <div className="flex flex-wrap gap-2">
                    <AssignRequestSelect
                      key={selectedRequest.id}
                      requestId={selectedRequest.id}
                      assignedAppUserId={selectedRequest.assignedAppUserId}
                      users={mode.assignableUsers}
                    />
                    <AssignedRequestStatusSelect
                      key={selectedRequest.id}
                      requestId={selectedRequest.id}
                      status={selectedRequest.status}
                      requestType={selectedRequest.requestType}
                      allStatuses
                    />
                  </div>
                )}
                {mode.kind === "ejecutor" && (
                  <AssignedRequestStatusSelect
                    key={selectedRequest.id}
                    requestId={selectedRequest.id}
                    status={selectedRequest.status}
                    requestType={selectedRequest.requestType}
                  />
                )}
              </div>
            )}

            <GoservicesCommentThread
              key={selectedRequest.id}
              requestId={selectedRequest.id}
              canComment={mode.kind !== "readonly"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
