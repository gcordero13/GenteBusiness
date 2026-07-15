"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteUser } from "./actions";

interface Profile {
  id: string;
  name: string;
}

export function InviteUserForm({ profiles }: { profiles: Profile[] }) {
  const [email, setEmail] = useState("");
  const [roleProfileId, setRoleProfileId] = useState(profiles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await inviteUser({ email, roleProfileId });
      setError(result.error ?? null);
      if (!result.error) setEmail("");
    });
  }

  return (
    <div className="space-y-2 rounded border p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Input
        placeholder="correo@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select
        className="w-full rounded border p-2 text-sm"
        value={roleProfileId}
        onChange={(e) => setRoleProfileId(e.target.value)}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button onClick={submit} disabled={isPending || !email || !roleProfileId}>
        Invitar
      </Button>
    </div>
  );
}
