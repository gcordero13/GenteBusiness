"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SealWithUrl } from "./page";

export function StampPickerDialog({
  seals,
  onPick,
}: {
  seals: SealWithUrl[];
  onPick: (seal: SealWithUrl) => void;
}) {
  const [open, setOpen] = useState(false);

  function pick(seal: SealWithUrl) {
    onPick(seal);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Sello</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Elige un sello</DialogTitle>
        </DialogHeader>
        {seals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay sellos disponibles todavía. Súbelos desde la sección &quot;Sellos de
            empresa&quot; más abajo.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {seals.map((seal) => (
              <button
                key={seal.id}
                type="button"
                className="space-y-1 rounded border p-2 text-center hover:bg-muted"
                onClick={() => pick(seal)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
                <img src={seal.url} alt={seal.name} className="mx-auto h-16 object-contain" />
                <p className="truncate text-xs font-medium">{seal.name}</p>
                <p className="truncate text-xs text-muted-foreground">{seal.companyName}</p>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
