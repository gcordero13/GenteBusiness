"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { createPosition, type PositionObjectiveInput } from "./actions";

const EMPTY_OBJECTIVE: PositionObjectiveInput = { title: "", kpiMetric: "", suggestedTarget: null, unit: "" };

export function PositionFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objectives, setObjectives] = useState<PositionObjectiveInput[]>([{ ...EMPTY_OBJECTIVE }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setObjectives([{ ...EMPTY_OBJECTIVE }]);
    setError(null);
  }

  function updateObjective(index: number, patch: Partial<PositionObjectiveInput>) {
    setObjectives((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function submit() {
    setError(null);
    const cleanObjectives = objectives.filter((o) => o.title.trim() && o.kpiMetric.trim());
    startTransition(async () => {
      const result = await createPosition(name, cleanObjectives);
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
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Nuevo puesto
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo puesto</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Nombre del puesto</label>
            <Input placeholder="Ej. Contador" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Objetivos/KPIs del puesto</p>
            {objectives.map((o, i) => (
              <div key={i} className="space-y-2 rounded-xl border p-3">
                <Input
                  placeholder="Título del objetivo"
                  value={o.title}
                  onChange={(e) => updateObjective(i, { title: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Métrica (ej. Ventas)"
                    value={o.kpiMetric}
                    onChange={(e) => updateObjective(i, { kpiMetric: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Meta sugerida"
                    value={o.suggestedTarget ?? ""}
                    onChange={(e) =>
                      updateObjective(i, { suggestedTarget: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                  <Input
                    placeholder="Unidad (%, RD$...)"
                    value={o.unit}
                    onChange={(e) => updateObjective(i, { unit: e.target.value })}
                  />
                </div>
                {objectives.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-red-600"
                    onClick={() => setObjectives((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5" />
                    Quitar
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setObjectives((prev) => [...prev, { ...EMPTY_OBJECTIVE }])}
            >
              <Plus className="size-3.5" />
              Agregar objetivo
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar puesto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
