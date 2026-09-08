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

export interface ComplaintRow {
  id: string;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  submitterName: string | null;
}

export function ComplaintsList({ rows }: { rows: ComplaintRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay quejas para mostrar.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Mensaje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          const toggle = () => setExpandedId(expanded ? null : row.id);
          return (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={toggle}
              aria-expanded={expanded}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (e.key === " ") e.preventDefault();
                  toggle();
                }
              }}
            >
              <TableCell className="align-top">{row.createdAtLabel}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell className="max-w-md">
                {expanded && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {row.submitterName ?? <span>Anónima</span>}
                  </p>
                )}
                <p className={expanded ? "whitespace-pre-wrap" : "truncate"}>{row.message}</p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
