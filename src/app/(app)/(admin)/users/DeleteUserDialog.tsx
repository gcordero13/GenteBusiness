"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteUser } from "./actions";
import { useOpenState } from "./useOpenState";

export function DeleteUserDialog({
  userId,
  email,
  open: openProp,
  onOpenChange,
}: {
  userId: string;
  email: string;
  /** Controlled from outside (e.g. an actions menu): then it shows no button of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen, controlled] = useOpenState(openProp, onOpenChange);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      {!controlled && <DialogTrigger render={<Button variant="destructive" size="sm">Eliminar</Button>} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar a {email}?</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-muted-foreground">
          Esta acción no se puede deshacer. El usuario perderá acceso a la plataforma de inmediato.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
