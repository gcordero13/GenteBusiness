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
import { setUserPassword } from "./actions";

export function SetPasswordDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await setUserPassword({ userId, password });
      setError(result.error ?? null);
      setSuccess(!result.error);
      if (!result.error) {
        setPassword("");
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
          setSuccess(false);
          setPassword("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm">Contraseña</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Establecer contraseña para {email}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Contraseña actualizada.</p>}
        <Input
          type="password"
          placeholder="Nueva contraseña (mínimo 6 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || password.length < 6}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
