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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await inviteUser({ email, roleProfileId });
      setError(result.error ?? null);
      if (!result.error) {
        setEmail("");
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
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !email || !roleProfileId}>
            Invitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
