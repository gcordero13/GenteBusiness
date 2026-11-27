"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateUserFullName } from "./actions";
import { useOpenState } from "./useOpenState";

export function EditUserDialog({
  userId,
  fullName,
  open: openProp,
  onOpenChange,
}: {
  userId: string;
  fullName: string | null;
  /** Controlled from outside (e.g. an actions menu): then it shows no button of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen, controlled] = useOpenState(openProp, onOpenChange);
  const [name, setName] = useState(fullName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateUserFullName({ userId, fullName: name.trim() });
      setError(result.error ?? null);
      if (!result.error) {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setName(fullName ?? "");
        }
      }}
    >
      {!controlled && <DialogTrigger render={<Button variant="outline" size="sm">Editar</Button>} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nombre del usuario</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Se usa si la persona no está en la Agenda; si está, se muestra el nombre de la Agenda.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={submit} disabled={isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
