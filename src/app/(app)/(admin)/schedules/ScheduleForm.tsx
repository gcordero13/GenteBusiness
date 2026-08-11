"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCompanySchedule } from "./actions";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export interface ScheduleFormInitial {
  start_time: string;
  end_time: string;
  workdays: number[];
  tolerance_minutes: number;
}

export function ScheduleForm({ initial }: { initial: ScheduleFormInitial }) {
  const [startTime, setStartTime] = useState(initial.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(initial.end_time.slice(0, 5));
  const [workdays, setWorkdays] = useState<number[]>(initial.workdays);
  const [toleranceMinutes, setToleranceMinutes] = useState(String(initial.tolerance_minutes));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleDay(day: number) {
    setWorkdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await saveCompanySchedule({
        start_time: startTime,
        end_time: endTime,
        workdays,
        tolerance_minutes: Number(toleranceMinutes) || 0,
      });
      setError(result.error ?? null);
      setSuccess(!result.error);
    });
  }

  const canSubmit = startTime && endTime && workdays.length > 0;

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Horario guardado.</p>}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Hora de entrada</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hora de salida</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Días laborables</Label>
        <div className="flex gap-3">
          {DAY_LABELS.map((label, day) => (
            <label key={day} className="flex flex-col items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={workdays.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {label}
            </label>
          ))}
        </div>
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
      <Button onClick={submit} disabled={isPending || !canSubmit}>
        Guardar
      </Button>
    </div>
  );
}
