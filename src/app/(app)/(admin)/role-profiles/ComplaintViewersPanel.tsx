"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addComplaintViewer, removeComplaintViewer } from "./actions";

export interface ComplaintViewerAppUserOption {
  id: string;
  email: string;
  fullName: string | null;
}

export interface ComplaintViewerRow {
  id: string;
  appUserId: string;
  label: string;
}

export function ComplaintViewersPanel({
  users,
  viewers,
}: {
  users: ComplaintViewerAppUserOption[];
  viewers: ComplaintViewerRow[];
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const viewerUserIds = new Set(viewers.map((v) => v.appUserId));
  const availableUsers = users.filter((u) => !viewerUserIds.has(u.id));

  function add() {
    if (!selectedUserId) return;
    setError(null);
    startTransition(async () => {
      const result = await addComplaintViewer(selectedUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedUserId(null);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeComplaintViewer(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-1 text-sm font-semibold">Acceso a Quejas</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Estas personas pueden ver las quejas enviadas, sin importar su perfil de rol.
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="mb-3 space-y-2">
        {viewers.map((v) => (
          <li key={v.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>{v.label}</span>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => remove(v.id)}>
              Quitar
            </Button>
          </li>
        ))}
        {viewers.length === 0 && <li className="text-sm text-muted-foreground">Nadie tiene acceso todavía.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedUserId ?? undefined} onValueChange={(v) => v && setSelectedUserId(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecciona una persona">
              {(val: string) => {
                const u = availableUsers.find((x) => x.id === val);
                return u ? (u.fullName ?? u.email) : "Selecciona una persona";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName ?? u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={isPending || !selectedUserId}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
