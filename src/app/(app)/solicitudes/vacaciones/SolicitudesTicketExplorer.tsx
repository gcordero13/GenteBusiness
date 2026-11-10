"use client";

import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/contacts";
import { EstadoPill, STATUS_LABEL, TIPO_LABEL, TipoPill } from "./SolicitudesPills";
import { SolicitudesTicketDetail } from "./SolicitudesTicketDetail";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const PAGE_SIZE = 10;
const ALL_VALUE = "__all__";

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface SolicitudRequestRow {
  id: string;
  first_name: string;
  last_name: string;
  tipo: string;
  period: string | null;
  date_from: string;
  date_to: string;
  return_date: string | null;
  days_requested: number | null;
  days_pending: number | null;
  notes: string | null;
  status: string;
  supervisor_app_user_id: string;
  created_at: string;
  supervisor_decision: string | null;
  supervisor_decided_at: string | null;
  supervisor_comments: string | null;
  supervisor_first_name: string | null;
  supervisor_last_name: string | null;
  rrhh_decision: string | null;
  rrhh_decided_at: string | null;
  rrhh_comments: string | null;
  rrhh_period_confirmed: string | null;
  rrhh_has_current_vacation: boolean | null;
  rrhh_is_advance: boolean | null;
  constancia_drive_id: string | null;
  constancia_item_id: string | null;
}

interface SolicitudesTicketExplorerProps {
  requests: SolicitudRequestRow[];
  attachmentUrlByRequestId: Record<string, string>;
  signatures: SignatureWithUrl[];
  userId: string;
  canAuthorize: boolean;
}

export function SolicitudesTicketExplorer({
  requests,
  attachmentUrlByRequestId,
  signatures,
  userId,
  canAuthorize,
}: SolicitudesTicketExplorerProps) {
  const [estadoTab, setEstadoTab] = useState(ALL_VALUE);
  const [tipoFilter, setTipoFilter] = useState(ALL_VALUE);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile (<md) shows one pane at a time - the list or the selected
  // request's detail - instead of stacking both, matching the pattern
  // already established by the GoServices ticket explorer.
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const estadoTabs = useMemo(() => [ALL_VALUE, ...Object.keys(STATUS_LABEL)], []);

  const estadoCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_VALUE]: requests.length };
    for (const status of Object.keys(STATUS_LABEL)) {
      counts[status] = requests.filter((r) => r.status === status).length;
    }
    return counts;
  }, [requests]);

  const searchTokens = useMemo(() => normalizeForSearch(search.trim()).split(/\s+/).filter(Boolean), [search]);

  const filtered = useMemo(
    () =>
      requests.filter((r) => {
        if (estadoTab !== ALL_VALUE && r.status !== estadoTab) return false;
        if (tipoFilter !== ALL_VALUE && r.tipo !== tipoFilter) return false;
        if (searchTokens.length > 0) {
          const fullName = normalizeForSearch(`${r.first_name} ${r.last_name}`);
          if (!searchTokens.every((token) => fullName.includes(token))) return false;
        }
        return true;
      }),
    [requests, estadoTab, tipoFilter, searchTokens],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
  // drops out of the filtered/sorted list (tab change, filter change, etc.)
  // without needing a separate effect to sync it.
  const selectedRequest = useMemo(() => {
    const found = selectedId ? sorted.find((r) => r.id === selectedId) : undefined;
    return found ?? sorted[0] ?? null;
  }, [sorted, selectedId]);

  function changeEstadoTab(tab: string) {
    setEstadoTab(tab);
    setPage(1);
  }

  function toggleSort() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    setPage(1);
  }

  function goToPage(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>;
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
      {/* LEFT PANE: estado tabs, filters, list, pagination */}
      <div
        className={cn(
          mobileView === "detail" ? "hidden md:flex" : "flex",
          "w-full min-w-0 flex-col border-b border-border md:w-[34%] md:min-w-[300px] md:border-r md:border-b-0 md:overflow-hidden",
        )}
      >
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-2">
          {estadoTabs.map((tab) => {
            const label = tab === ALL_VALUE ? "Todas" : (STATUS_LABEL[tab] ?? tab);
            const active = estadoTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => changeEstadoTab(tab)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150",
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
                  {estadoCounts[tab] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por colaborador..."
            className="h-8 min-w-0 flex-1 text-sm"
            aria-label="Buscar por colaborador"
          />
          <Select
            value={tipoFilter}
            onValueChange={(value) => {
              if (!value) return;
              setTipoFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Filtrar por tipo">
              <SelectValue>
                {(value: string) => (value === ALL_VALUE ? "Todos" : (TIPO_LABEL[value] ?? value))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todos los tipos</SelectItem>
              {Object.entries(TIPO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <p className="text-sm text-muted-foreground">No hay solicitudes que coincidan con el filtro.</p>
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
                  <Avatar size="sm" className={cn("mt-0.5 transition-all", isSelected && "ring-2 ring-[#04B1AF]/50")}>
                    <AvatarFallback className="bg-[#04B1AF]/15 text-[#04B1AF]">
                      {getInitials(`${r.first_name} ${r.last_name}`)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {r.first_name} {r.last_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <TipoPill tipo={r.tipo} />
                      <EstadoPill status={r.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-600">
                      {r.date_from} → {r.date_to}
                    </p>
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

      {/* RIGHT PANE: selected request detail */}
      <div className={cn(mobileView === "list" ? "hidden md:block" : "block", "min-w-0 flex-1 overflow-y-auto p-5")}>
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
          <SolicitudesTicketDetail
            key={selectedRequest.id}
            request={selectedRequest}
            attachmentUrl={attachmentUrlByRequestId[selectedRequest.id]}
            signatures={signatures}
            userId={userId}
            canAuthorize={canAuthorize}
          />
        )}
      </div>
    </div>
  );
}
