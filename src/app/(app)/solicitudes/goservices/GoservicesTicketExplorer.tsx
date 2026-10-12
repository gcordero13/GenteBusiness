"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Inbox,
  MousePointerClick,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/goservicesStatus";
import { GoservicesBoardView } from "./GoservicesBoardView";
import { GoservicesTableView } from "./GoservicesTableView";
import { GoservicesTicketDetail } from "./GoservicesTicketDetail";
import type { GoservicesRequestRow } from "./actions";

export type ViewMode = "list" | "board" | "table";

export type GoservicesExplorerMode =
  | { kind: "readonly" }
  | { kind: "ejecutor" }
  | {
      kind: "gestor";
      assignableUsers: { id: string; email: string }[];
    };

const PAGE_SIZE = 10;
const ALL_TAB = "todas";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function GoservicesTicketExplorer({
  requests,
  mode,
  viewMode = "list",
}: {
  requests: GoservicesRequestRow[];
  mode: GoservicesExplorerMode;
  viewMode?: ViewMode;
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
  // Board/table are gestor-only alternative views (confirmed with the user:
  // a Kanban-style board grouped by status, and a flat sortable grid),
  // switched via the `viewMode` prop so the switcher can live in the same
  // row as the page's type filter instead of inside this component. A click
  // on a card/row opens that ticket's detail in a modal, without leaving the
  // board/table view behind.
  const [modalRequestId, setModalRequestId] = useState<string | null>(null);
  const modalRequest = modalRequestId ? (requests.find((r) => r.id === modalRequestId) ?? null) : null;

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
    <div className="flex w-full min-w-0 flex-col gap-3">
      {viewMode === "board" ? (
        <GoservicesBoardView requests={requests} onSelect={setModalRequestId} />
      ) : viewMode === "table" ? (
        <GoservicesTableView requests={requests} onSelect={setModalRequestId} />
      ) : (
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
          // Keyed by tab+ticket (not just ticket id) so the whole detail
          // subtree — fields, assign/status controls, comment thread — gets
          // a clean teardown and rebuild on every navigation, never a
          // partial re-render that could leave a previous ticket's controls
          // behind alongside the new one.
          <GoservicesTicketDetail key={`${activeTab}:${selectedRequest.id}`} request={selectedRequest} mode={mode} />
        )}
      </div>
    </div>
      )}

      {/* Tablero/Tabla open the ticket in a modal instead of switching back
          to the Lista view, so the board/table stay in place behind it. */}
      <Dialog open={!!modalRequest} onOpenChange={(open) => !open && setModalRequestId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de la solicitud</DialogTitle>
          </DialogHeader>
          {modalRequest && <GoservicesTicketDetail key={modalRequest.id} request={modalRequest} mode={mode} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
