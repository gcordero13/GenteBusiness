"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ComplaintDetailDialog, type ComplaintDetail } from "./ComplaintDetailDialog";

export interface ComplaintRow {
  id: string;
  complaintNumber: number;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  submitterName: string | null;
  status: string;
  statusLabel: string;
  reviewerComment: string | null;
  hasPhoto: boolean;
}

const STATUS_BADGE_CLASSNAME: Record<string, string> = {
  nuevo: "",
  en_proceso: "bg-amber-100 text-amber-900 border-amber-200",
  resuelto: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export function ComplaintsList({ rows }: { rows: ComplaintRow[] }) {
  const [selected, setSelected] = useState<ComplaintRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay quejas para mostrar.</p>;
  }

  const detail: ComplaintDetail | null = selected
    ? {
        id: selected.id,
        complaintNumber: selected.complaintNumber,
        createdAtLabel: selected.createdAtLabel,
        categoryLabel: selected.categoryLabel,
        message: selected.message,
        submitterName: selected.submitterName,
        status: selected.status,
        reviewerComment: selected.reviewerComment,
        hasPhoto: selected.hasPhoto,
      }
    : null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Mensaje</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => {
                setSelected(row);
                setDialogOpen(true);
              }}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (e.key === " ") e.preventDefault();
                  setSelected(row);
                  setDialogOpen(true);
                }
              }}
            >
              <TableCell className="align-top text-muted-foreground">#{row.complaintNumber}</TableCell>
              <TableCell className="align-top">{row.createdAtLabel}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell className="max-w-md">
                <p className="truncate">{row.message}</p>
              </TableCell>
              <TableCell className="align-top">
                <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[row.status] || ""}>
                  {row.statusLabel}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ComplaintDetailDialog complaint={detail} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
