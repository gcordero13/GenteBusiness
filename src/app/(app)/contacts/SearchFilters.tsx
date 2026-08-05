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

interface DepartmentOption extends Option {
  company_id: string | null;
}

export function SearchFilters({
  companies,
  departments,
  canSeeInactiveToggle,
}: {
  companies: Option[];
  departments: DepartmentOption[];
  canSeeInactiveToggle: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCompany = searchParams.get("company") ?? "";
  const visibleDepartments = selectedCompany
    ? departments.filter((d) => d.company_id === selectedCompany)
    : departments;

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/contacts?${params.toString()}`);
  }

  function updateCompany(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("company", value);
    } else {
      params.delete("company");
    }
    const currentDepartment = params.get("department");
    const stillValid =
      currentDepartment &&
      departments.some((d) => d.id === currentDepartment && (!value || d.company_id === value));
    if (!stillValid) {
      params.delete("department");
    }
    router.push(`/contacts?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Input
        placeholder="Buscar por nombre"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => updateParam("q", e.target.value)}
        className="w-full sm:max-w-xs"
      />
      <Select
        value={searchParams.get("company") ?? ""}
        onValueChange={(value) => updateCompany(value)}
      >
        <SelectTrigger className="w-full sm:w-48">
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
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Todos los departamentos">
            {(value: string) =>
              departments.find((d) => d.id === value)?.name ?? "Todos los departamentos"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {visibleDepartments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canSeeInactiveToggle && (
        <label className="flex items-center gap-2 py-1 text-sm sm:py-0">
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
