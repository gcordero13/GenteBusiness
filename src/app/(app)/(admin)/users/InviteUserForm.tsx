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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteUser } from "./actions";

interface Profile {
  id: string;
  name: string;
}

export function InviteUserForm({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleProfileId, setRoleProfileId] = useState(profiles[0]?.id ?? "");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const passwordTooShort = mode === "password" && password.length > 0 && password.length < 6;

  function submit() {
    startTransition(async () => {
      const result = await inviteUser({
        email,
        roleProfileId,
        password: mode === "password" ? password : undefined,
      });
      setError(result.error ?? null);
      if (!result.error) {
        setEmail("");
        setPassword("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Invitar usuario</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="correo@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select value={roleProfileId} onValueChange={(v) => setRoleProfileId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona un perfil">
              {(value: string) => profiles.find((p) => p.id === value)?.name ?? "Selecciona un perfil"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="invite-mode"
              checked={mode === "invite"}
              onChange={() => setMode("invite")}
            />
            Enviar invitación por correo
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="invite-mode"
              checked={mode === "password"}
              onChange={() => setMode("password")}
            />
            Crear con contraseña directa
          </label>
        </div>
        {mode === "password" && (
          <div className="space-y-1">
            <Input
              type="password"
              placeholder="Contraseña temporal (mínimo 6 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {passwordTooShort && (
              <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={
              isPending ||
              !email ||
              !roleProfileId ||
              (mode === "password" && password.length < 6)
            }
          >
            {mode === "password" ? "Crear usuario" : "Invitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
