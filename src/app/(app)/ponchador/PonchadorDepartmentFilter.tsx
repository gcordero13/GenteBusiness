"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_DEPARTMENTS_VALUE = "__all__";

export function PonchadorDepartmentFilter({
  departments,
  selectedDepartment,
}: {
  departments: string[];
  selectedDepartment: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectDepartment(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_DEPARTMENTS_VALUE) {
      params.delete("department");
    } else {
      params.set("department", value);
    }
    router.push(`/ponchador?${params.toString()}`);
  }

  return (
    <Select
      value={selectedDepartment ?? ALL_DEPARTMENTS_VALUE}
      onValueChange={(value) => value && selectDepartment(value)}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_DEPARTMENTS_VALUE}>Todos los departamentos</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
