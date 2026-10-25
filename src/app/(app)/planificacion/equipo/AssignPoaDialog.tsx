"use client";

import { useEffect, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignPoa,
  getPositionTemplate,
  listActivePositionOptions,
  type ListPositionsOption,
  type SupervisedContactRow,
} from "./actions";

interface ObjectiveDraft {
  title: string;
  kpiMetric: string;
  targetValue: number;
  unit: string;
}

export function AssignPoaDialog({ contact, periodYear }: { contact: SupervisedContactRow; periodYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [positions, setPositions] = useState<ListPositionsOption[]>([]);
  const [positionId, setPositionId] = useState(contact.positionId ?? "");
  const [objectives, setObjectives] = useState<ObjectiveDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) listActivePositionOptions().then(setPositions);
  }, [open]);

  async function loadTemplate(id: string) {
    setPositionId(id);
    if (!id) return;
    const template = await getPositionTemplate(id);
    setObjectives(template);
  }

  function updateObjective(index: number, patch: Partial<ObjectiveDraft>) {
    setObjectives((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function submit() {
    setError(null);
    const clean = objectives.filter((o) => o.title.trim() && o.kpiMetric.trim());
    startTransition(async () => {
      const result = await assignPoa({
        contactId: contact.contactId,
        departmentId: contact.departmentId,
        positionId: positionId || null,
        periodYear,
        objectives: clean,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !contact.hasPoaForYear && setOpen(next)}>
      <DialogTrigger
        render={<Button size="sm" disabled={contact.hasPoaForYear} className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}
      >
        {contact.hasPoaForYear ? "Ya asignado" : "Asignar POA"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>POA {periodYear} — {contact.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Puesto (plantilla)</label>
            <Select value={positionId} onValueChange={(v) => v && loadTemplate(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => positions.find((p) => p.id === positionId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Objetivos para este año</p>
            {objectives.map((o, i) => (
              <div key={i} className="space-y-2 rounded-xl border p-3">
                <Input
                  placeholder="Título del objetivo"
                  value={o.title}
                  onChange={(e) => updateObjective(i, { title: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Métrica"
                    value={o.kpiMetric}
                    onChange={(e) => updateObjective(i, { kpiMetric: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Meta"
                    value={o.targetValue}
                    onChange={(e) => updateObjective(i, { targetValue: Number(e.target.value) })}
                  />
                  <Input
                    placeholder="Unidad"
                    value={o.unit}
                    onChange={(e) => updateObjective(i, { unit: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600"
                  onClick={() => setObjectives((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-3.5" />
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setObjectives((prev) => [...prev, { title: "", kpiMetric: "", targetValue: 0, unit: "" }])}
            >
              <Plus className="size-3.5" />
              Agregar objetivo
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar POA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
