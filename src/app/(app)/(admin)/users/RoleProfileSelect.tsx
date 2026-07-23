"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserRoleProfile } from "./actions";

interface Profile {
  id: string;
  name: string;
}

export function RoleProfileSelect({
  userId,
  currentProfileId,
  profiles,
}: {
  userId: string;
  currentProfileId: string;
  profiles: Profile[];
}) {
  const [value, setValue] = useState(currentProfileId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updateUserRoleProfile({ userId, roleProfileId: next });
      if (result.error) {
        setError(result.error);
        setValue(previous);
      }
    });
  }

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={(v) => v && v !== value && change(v)} disabled={isPending}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Selecciona un perfil">
            {(val: string) => profiles.find((p) => p.id === val)?.name ?? "Selecciona un perfil"}
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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
