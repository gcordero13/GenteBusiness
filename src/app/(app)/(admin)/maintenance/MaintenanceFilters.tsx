"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};

export function MaintenanceFilters({ years }: { years: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") === "correctivo" ? "correctivo" : "preventivo";
  const year = searchParams.get("year") ?? String(years[0]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/maintenance?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border p-1">
        {(["preventivo", "correctivo"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => updateParam("type", t)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              type === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <Select value={year} onValueChange={(value) => updateParam("year", value ?? year)}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
