"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_CATEGORIES_VALUE = "__all__";

const CATEGORY_OPTIONS = [
  { value: "acoso", label: "Acoso" },
  { value: "seguridad", label: "Seguridad" },
  { value: "etica", label: "Ética" },
  { value: "recursos_humanos", label: "Recursos Humanos" },
  { value: "otro", label: "Otro" },
];

export function ComplaintsFilterBar({
  category,
  search,
}: {
  category: string | null;
  search: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL_CATEGORIES_VALUE) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/quejas?${params.toString()}`);
  }

  function submitSearch() {
    updateParam("search", searchValue);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={category ?? ALL_CATEGORIES_VALUE}
        onValueChange={(value) => value && updateParam("category", value)}
      >
        <SelectTrigger className="w-56">
          <SelectValue>
            {(value: string) =>
              value === ALL_CATEGORIES_VALUE
                ? "Todas las categorías"
                : (CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CATEGORIES_VALUE}>Todas las categorías</SelectItem>
          {CATEGORY_OPTIONS.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        onBlur={submitSearch}
        onKeyDown={(e) => e.key === "Enter" && submitSearch()}
        placeholder="Buscar en el mensaje..."
        className="w-64"
      />
    </div>
  );
}
