"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_VALUE = "__all__";

const TYPE_LABELS: Record<string, string> = {
  mantenimiento: "Mantenimiento",
  mensajeria: "Mensajería",
};

// The status dimension is now handled by GoservicesTicketExplorer's own
// status tabs, so this bar only needs to filter by request type (a
// dimension the explorer doesn't know about) — a status dropdown here would
// just duplicate, and could conflict with, the explorer's tabs.
export function GoservicesFilterBar({ type }: { type: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: "type", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_VALUE) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/goservices?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={type ?? ALL_VALUE} onValueChange={(value) => value && updateParam("type", value)}>
        <SelectTrigger className="w-56">
          <SelectValue>
            {(value: string) => (value === ALL_VALUE ? "Todos los tipos" : (TYPE_LABELS[value] ?? value))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos los tipos</SelectItem>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
