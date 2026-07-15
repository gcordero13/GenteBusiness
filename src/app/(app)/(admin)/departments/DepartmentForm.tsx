"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDepartment } from "./actions";

interface Company {
  id: string;
  name: string;
}

export function DepartmentForm({ companies }: { companies: Company[] }) {
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createDepartment(name, companyId);
      setError(result.error ?? null);
      if (!result.error) setName("");
    });
  }

  return (
    <div className="flex gap-2">
      <Input placeholder="Nombre del departamento" value={name} onChange={(e) => setName(e.target.value)} />
      <select
        className="rounded border p-2 text-sm"
        value={companyId}
        onChange={(e) => setCompanyId(e.target.value)}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button onClick={submit} disabled={isPending || !name || !companyId}>
        Agregar
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
