"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMaintenanceRecord } from "./actions";

interface ContactOption {
  id: string;
  name: string;
  email: string;
  company: string;
}

export function NewMaintenanceDialog({
  contacts,
  type,
}: {
  contacts: ContactOption[];
  type: "preventivo" | "correctivo";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = contacts.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q)
    );
  });

  function pick(contactId: string) {
    setPendingId(contactId);
    setError(null);
    startTransition(async () => {
      const result = await createMaintenanceRecord(contactId, type);
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setQuery("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button>Nuevo mantenimiento</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo mantenimiento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Busca el contacto que recibirá el mantenimiento. Se generará un enlace para
          completar el formulario y firmar.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Buscar por nombre, correo o empresa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron contactos.
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pendingId === c.id}
                onClick={() => pick(c.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.company} · {c.email}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
