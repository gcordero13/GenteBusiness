"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { listMyComplaints, type MyComplaintRow } from "./actions";

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
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const anonymousIds = getStoredAnonymousComplaintIds();
    listMyComplaints(anonymousIds).then(setRows);
  }, [refreshKey]);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  function toggle(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-8 space-y-2">
      <p className="text-sm font-semibold">Mis quejas</p>
      <ul className="space-y-2">
        {rows.map((row) => {
          const revealed = !row.isAnonymous || revealedIds.has(row.id);
          return (
            <li key={row.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>#{row.complaintNumber}</span>
                <span>{row.createdAtLabel}</span>
                <Badge variant="outline">{row.categoryLabel}</Badge>
                <Badge variant="outline">{row.statusLabel}</Badge>
              </div>
              {revealed ? (
                <p className="mt-1 whitespace-pre-wrap">{row.message}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="mt-1 text-sm text-muted-foreground underline underline-offset-2"
                >
                  Anónima — clic para ver solicitud
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
