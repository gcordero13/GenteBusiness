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
          <TableHead>Quién envía</TableHead>
          <TableHead>Mensaje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => setExpandedId(expanded ? null : row.id)}
            >
              <TableCell className="align-top">{row.createdAtLabel}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell className="align-top">
                {row.submitterName ?? <span className="text-muted-foreground">Anónima</span>}
              </TableCell>
              <TableCell className="max-w-md">
                <p className={expanded ? "whitespace-pre-wrap" : "truncate"}>{row.message}</p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
