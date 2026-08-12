"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { saveScheduleTemplate, type ScheduleDayInput } from "./actions";

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface ScheduleTemplateInitial {
  id: string;
  name: string;
  tolerance_minutes: number;
  is_default: boolean;
  days: ScheduleDayInput[];
}

interface DayRowState {
  day_of_week: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
}

function buildInitialDayRows(days: ScheduleDayInput[]): DayRowState[] {
  return Array.from({ length: 7 }, (_, day_of_week) => {
    const existing = days.find((d) => d.day_of_week === day_of_week);
    return {
      day_of_week,
      enabled: Boolean(existing),
      start_time: existing?.start_time.slice(0, 5) ?? "08:00",
      end_time: existing?.end_time.slice(0, 5) ?? "17:00",
    };
  });
}

export function ScheduleForm({ initial }: { initial?: ScheduleTemplateInitial }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [toleranceMinutes, setToleranceMinutes] = useState(String(initial?.tolerance_minutes ?? 0));
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [days, setDays] = useState<DayRowState[]>(buildInitialDayRows(initial?.days ?? []));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateDay(day_of_week: number, patch: Partial<DayRowState>) {
    setDays((prev) => prev.map((d) => (d.day_of_week === day_of_week ? { ...d, ...patch } : d)));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveScheduleTemplate({
        id: initial?.id,
        name,
        tolerance_minutes: Number(toleranceMinutes) || 0,
        is_default: isDefault,
        days: days
          .filter((d) => d.enabled)
          .map((d) => ({ day_of_week: d.day_of_week, start_time: d.start_time, end_time: d.end_time })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!initial) {
        setName("");
        setToleranceMinutes("0");
        setIsDefault(false);
        setDays(buildInitialDayRows([]));
      }
      setError(null);
      setOpen(false);
    });
  }

  const canSubmit = name.trim() !== "" && days.some((d) => d.enabled);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nuevo horario</Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar horario" : "Nuevo horario"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input placeholder="Ej. Ventas" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Minutos de tolerancia</Label>
          <Input
            type="number"
            min={0}
            value={toleranceMinutes}
            onChange={(e) => setToleranceMinutes(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Usar como horario por defecto
        </label>
        <div className="space-y-2">
          <Label>Días laborables</Label>
          {days.map((day) => (
            <div key={day.day_of_week} className="flex items-center gap-2">
              <label className="flex w-28 shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(e) => updateDay(day.day_of_week, { enabled: e.target.checked })}
                />
                {DAY_LABELS[day.day_of_week]}
              </label>
              <Input
                type="time"
                disabled={!day.enabled}
                value={day.start_time}
                onChange={(e) => updateDay(day.day_of_week, { start_time: e.target.value })}
              />
              <Input
                type="time"
                disabled={!day.enabled}
                value={day.end_time}
                onChange={(e) => updateDay(day.day_of_week, { end_time: e.target.value })}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !canSubmit}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
