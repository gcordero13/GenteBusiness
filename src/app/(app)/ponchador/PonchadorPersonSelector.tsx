"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PonchadorPersonOption {
  id: string;
  name: string;
  departmentName?: string | null;
}

export function PonchadorPersonSelector({
  people,
  contactId,
  groupByDepartment,
}: {
  people: PonchadorPersonOption[];
  contactId: string | null;
  groupByDepartment: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectPerson(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contactId", nextId);
    router.push(`/ponchador?${params.toString()}`);
  }

  if (!groupByDepartment) {
    return (
      <Select
        value={contactId ?? undefined}
        onValueChange={(value) => value && selectPerson(value)}
        disabled={people.length === 0}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Selecciona una persona">
            {(value: string) => people.find((p) => p.id === value)?.name ?? "Selecciona una persona"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const groups = new Map<string, PonchadorPersonOption[]>();
  for (const p of people) {
    const key = p.departmentName ?? "Sin departamento";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return (
    <Select
      value={contactId ?? undefined}
      onValueChange={(value) => value && selectPerson(value)}
      disabled={people.length === 0}
    >
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Selecciona una persona">
          {(value: string) => people.find((p) => p.id === value)?.name ?? "Selecciona una persona"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Array.from(groups.entries()).map(([department, members]) => (
          <SelectGroup key={department}>
            <SelectLabel>{department}</SelectLabel>
            {members.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
