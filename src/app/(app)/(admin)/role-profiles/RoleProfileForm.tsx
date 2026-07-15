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
import { saveRoleProfile } from "./actions";

const FLAG_KEYS = [
  "can_view",
  "can_add",
  "can_edit",
  "can_delete",
  "can_deactivate",
  "can_manage_platform",
] as const;

const FLAG_LABELS: Record<(typeof FLAG_KEYS)[number], string> = {
  can_view: "Ver",
  can_add: "Agregar",
  can_edit: "Editar",
  can_delete: "Eliminar",
  can_deactivate: "Anular",
  can_manage_platform: "Gestionar plataforma",
};

export function RoleProfileForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [flags, setFlags] = useState<Record<(typeof FLAG_KEYS)[number], boolean>>({
    can_view: false,
    can_add: false,
    can_edit: false,
    can_delete: false,
    can_deactivate: false,
    can_manage_platform: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveRoleProfile({ name, ...flags });
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Nuevo perfil</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo perfil de rol</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre del perfil"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 text-sm">
          {FLAG_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              {FLAG_LABELS[key]}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            Crear perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
