"use client";

import { useMemo, useState } from "react";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronsUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/goservicesStatus";
import { GoservicesStatusBadge } from "./GoservicesStatusBadge";
import type { GoservicesRequestRow } from "./actions";

const ALL_STATUSES = "todas";

const REQUEST_TYPE_LABELS: Record<GoservicesRequestRow["requestType"], string> = {
  mantenimiento: "Mantenimiento",
  mensajeria: "Mensajería",
};

type SortColumn = "requestNumber" | "requesterName" | "status" | "createdAtIso";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "requestNumber", label: "Ticket" },
  { key: "requesterName", label: "Solicitante" },
  { key: "status", label: "Estatus" },
  { key: "createdAtIso", label: "Fecha" },
];

// Flat, spreadsheet-like grid (what the user described as a "Microsoft
// Lists"-style view) — every column visible at once, sortable by clicking a
// header, as an alternative to opening each ticket's detail individually.
export function GoservicesTableView({
  requests,
  onSelect,
}: {
  requests: GoservicesRequestRow[];
  onSelect: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [sortColumn, setSortColumn] = useState<SortColumn>("createdAtIso");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortColumn(column);
      setSortDir("desc");
    }
  }

  const rows = useMemo(() => {
    const filtered =
      statusFilter === ALL_STATUSES ? requests : requests.filter((r) => r.status === statusFilter);
    const copy = [...filtered];
    copy.sort((a, b) => {
      let diff: number;
      switch (sortColumn) {
        case "requestNumber":
          diff = a.requestNumber - b.requestNumber;
          break;
        case "requesterName":
          diff = a.requesterName.localeCompare(b.requesterName);
          break;
        case "status":
          diff = (STATUS_LABELS[a.status] ?? a.status).localeCompare(STATUS_LABELS[b.status] ?? b.status);
          break;
        case "createdAtIso":
        default:
          diff = new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime();
          break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return copy;
  }, [requests, statusFilter, sortColumn, sortDir]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue>{(v: string) => (v === ALL_STATUSES ? "Todas" : (STATUS_LABELS[v] ?? v))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>Todas</SelectItem>
            {Object.keys(STATUS_LABELS).map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-medium text-muted-foreground">
          {rows.length} solicitud{rows.length === 1 ? "" : "es"}
        </span>
      </div>

      <div className="max-h-[32rem] overflow-y-auto md:max-h-[60vh]">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead key={col.key}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {col.label}
                    {sortColumn === col.key ? (
                      sortDir === "desc" ? (
                        <ArrowDownNarrowWide className="size-3.5" />
                      ) : (
                        <ArrowUpNarrowWide className="size-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="size-3.5 opacity-40" />
                    )}
                  </button>
                </TableHead>
              ))}
              <TableHead>Tipo</TableHead>
              <TableHead>Asignado a</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No hay solicitudes.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className={cn("cursor-pointer")}
                >
                  <TableCell className="font-medium">#{r.requestNumber}</TableCell>
                  <TableCell>{r.requesterName}</TableCell>
                  <TableCell>
                    <GoservicesStatusBadge status={r.status} label={r.statusLabel} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.createdAtLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{REQUEST_TYPE_LABELS[r.requestType]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.assignedAppUserEmail ?? "Sin asignar"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
