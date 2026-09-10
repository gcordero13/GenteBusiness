"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listMyComplaints, type MyComplaintRow } from "./actions";
import { MyComplaintDetailDialog } from "./MyComplaintDetailDialog";

const STORAGE_KEY = "quejas.myAnonymousComplaintIds";

export function getStoredAnonymousComplaintIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberAnonymousComplaintId(id: string) {
  try {
    const ids = getStoredAnonymousComplaintIds();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, id]));
  } catch {
    // localStorage unavailable (private browsing, etc.) - the submission
    // itself already succeeded server-side, this only affects whether the
    // submitter can find it again in "Mis quejas" later on this device.
  }
}

export function MyComplaintsList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<MyComplaintRow[] | null>(null);
  const [selected, setSelected] = useState<MyComplaintRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const anonymousIds = getStoredAnonymousComplaintIds();
    listMyComplaints(anonymousIds)
      .then(setRows)
      .catch(() => setRows([]));
  }, [refreshKey]);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <div className="mt-8 space-y-2">
      <p className="text-sm font-semibold">Mis reportes</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>
              <span className="sr-only">Anónima</span>
            </TableHead>
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
              <TableCell className="text-muted-foreground">#{row.complaintNumber}</TableCell>
              <TableCell>{row.createdAtLabel}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{row.statusLabel}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {row.isAnonymous && <Badge variant="outline">Anónima</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MyComplaintDetailDialog
        key={selected?.id ?? "none"}
        complaint={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
