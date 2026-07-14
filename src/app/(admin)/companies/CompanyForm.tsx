"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCompany } from "./actions";

export function CompanyForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createCompany(name);
      setError(result.error ?? null);
      if (!result.error) setName("");
    });
  }

  return (
    <div className="flex gap-2">
      <Input placeholder="Nombre de la empresa" value={name} onChange={(e) => setName(e.target.value)} />
      <Button onClick={submit} disabled={isPending || !name}>
        Agregar
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
