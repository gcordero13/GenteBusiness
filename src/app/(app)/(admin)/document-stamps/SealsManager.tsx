"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteSeal, uploadSeal } from "./actions";
import type { SealWithUrl } from "./page";

interface Company {
  id: string;
  name: string;
}

export function SealsManager({
  companies,
  seals,
}: {
  companies: Company[];
  seals: SealWithUrl[];
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo PNG");
      return;
    }

    const formData = new FormData();
    formData.set("companyId", companyId);
    formData.set("name", name.trim());
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadSeal(formData);
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  function remove(id: string, storagePath: string) {
    startTransition(async () => {
      const result = await deleteSeal(id, storagePath);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Sellos de empresa</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Empresa">
              {(value: string) => companies.find((c) => c.id === value)?.name ?? "Empresa"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Nombre del sello" value={name} onChange={(e) => setName(e.target.value)} />
        <Input ref={fileInputRef} type="file" accept="image/png" />
        <Button onClick={submit} disabled={isPending || !companyId || !name.trim()}>
          Subir
        </Button>
      </div>
      {seals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay sellos todavía.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {seals.map((seal) => (
            <div key={seal.id} className="space-y-1 rounded border p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not a static asset */}
              <img src={seal.url} alt={seal.name} className="mx-auto h-16 object-contain" />
              <p className="truncate text-xs font-medium">{seal.name}</p>
              <p className="truncate text-xs text-muted-foreground">{seal.companyName}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => remove(seal.id, seal.storagePath)}
                disabled={isPending}
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
