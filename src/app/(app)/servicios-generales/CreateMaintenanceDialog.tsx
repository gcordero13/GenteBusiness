"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAINTENANCE_CATEGORIES, type MaintenanceCategoryKey } from "./categories";
import { createMaintenanceRecord } from "./actions";

type FrequencyUnit = "dias" | "semanas" | "meses";

const FREQUENCY_LABELS: Record<FrequencyUnit, string> = { dias: "Días", semanas: "Semanas", meses: "Meses" };

export function CreateMaintenanceDialog({ departments }: { departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MaintenanceCategoryKey>(MAINTENANCE_CATEGORIES[0].key);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState<FrequencyUnit>("meses");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setCategory(MAINTENANCE_CATEGORIES[0].key);
    setDepartmentId(departments[0]?.id ?? "");
    setDescription("");
    setScheduledDate("");
    setIsRecurring(false);
    setInterval(1);
    setUnit("meses");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createMaintenanceRecord({
        category,
        departmentId,
        description,
        scheduledDate,
        recurring: isRecurring ? { interval, unit } : undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Crear mantenimiento
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo mantenimiento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Tipo de mantenimiento</label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as MaintenanceCategoryKey)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => MAINTENANCE_CATEGORIES.find((c) => c.key === category)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Departamento / Área</label>
            <Select value={departmentId} onValueChange={(v) => v && setDepartmentId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => departments.find((d) => d.id === departmentId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Fecha programada</label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
              placeholder="Describe el mantenimiento o la solicitud..."
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            ¿Se repite?
          </label>
          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Cada</label>
                <Input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Frecuencia</label>
                <Select value={unit} onValueChange={(v) => v && setUnit(v as FrequencyUnit)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{() => FREQUENCY_LABELS[unit]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dias">Días</SelectItem>
                    <SelectItem value="semanas">Semanas</SelectItem>
                    <SelectItem value="meses">Meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
