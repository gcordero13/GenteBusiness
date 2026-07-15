"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  id: string;
  name: string;
}

export function SearchFilters({
  companies,
  departments,
  canSeeInactiveToggle,
}: {
  companies: Option[];
  departments: Option[];
  canSeeInactiveToggle: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/contacts?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="Buscar por nombre"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => updateParam("q", e.target.value)}
        className="max-w-xs"
      />
      <Select
        value={searchParams.get("company") ?? ""}
        onValueChange={(value) => updateParam("company", value)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Todas las empresas">
            {(value: string) => companies.find((c) => c.id === value)?.name ?? "Todas las empresas"}
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
      <Select
        value={searchParams.get("department") ?? ""}
        onValueChange={(value) => updateParam("department", value)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Todos los departamentos">
            {(value: string) =>
              departments.find((d) => d.id === value)?.name ?? "Todos los departamentos"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canSeeInactiveToggle && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={searchParams.get("showInactive") === "true"}
            onChange={(e) => updateParam("showInactive", e.target.checked ? "true" : "")}
          />
          Mostrar anulados
        </label>
      )}
    </div>
  );
}
