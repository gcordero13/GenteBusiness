"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { inviteContactAsUser } from "./actions";

interface ContactOption {
  id: string;
  name: string;
  email: string;
}

export function InviteFromContactDialog({ contacts }: { contacts: ContactOption[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = contacts.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  function grant(contactId: string) {
    setPendingId(contactId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[contactId];
      return next;
    });
    startTransition(async () => {
      const result = await inviteContactAsUser(contactId);
      if (result.error) {
        setErrors((prev) => ({ ...prev, [contactId]: result.error! }));
      } else {
        setGranted((prev) => new Set(prev).add(contactId));
      }
      setPendingId(null);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setErrors({});
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline">Dar acceso a un contacto</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar acceso a un contacto de la agenda</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Busca un contacto y márcalo para darle acceso a la plataforma con el perfil Viewer.
        </p>
        <Input
          placeholder="Buscar por nombre o correo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {contacts.length === 0
                ? "Todos los contactos con correo ya tienen acceso."
                : "No se encontraron contactos."}
            </p>
          ) : (
            filtered.map((c) => (
              <label
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  {errors[c.id] && <p className="text-xs text-red-600">{errors[c.id]}</p>}
                </div>
                <input
                  type="checkbox"
                  checked={granted.has(c.id)}
                  disabled={granted.has(c.id) || pendingId === c.id}
                  onChange={() => grant(c.id)}
                />
              </label>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
