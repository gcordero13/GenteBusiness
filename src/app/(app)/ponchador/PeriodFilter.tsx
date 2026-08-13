"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function PeriodFilter({
  year,
  month,
  currentYear,
  currentMonth,
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/ponchador?${params.toString()}`);
  }

  const years = [currentYear - 2, currentYear - 1, currentYear];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={String(year)} onValueChange={(value) => value && updateParam("year", value)}>
        <SelectTrigger className="w-28">
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
      <Select value={String(month)} onValueChange={(value) => value && updateParam("month", value)}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES_ES.map((label, index) => {
            const monthNumber = index + 1;
            const disabled = year === currentYear && monthNumber > currentMonth;
            return (
              <SelectItem key={monthNumber} value={String(monthNumber)} disabled={disabled}>
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <button
        type="button"
        disabled
        title="Próximamente"
        className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground opacity-50"
      >
        Semana
      </button>
    </div>
  );
}
