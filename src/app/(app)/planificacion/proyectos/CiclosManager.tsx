"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCiclo, deleteCiclo, type CicloRow } from "./actions";

export function CiclosManager({ proyectoId, ciclos }: { proyectoId: string; ciclos: CicloRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createCiclo(proyectoId, name, startDate, endDate);
      setName("");
      setStartDate("");
      setEndDate("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteCiclo(id, proyectoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Ciclos</p>
      {ciclos.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
          <span>
            {c.name} {c.startDate ? `· ${c.startDate} → ${c.endDate ?? "?"}` : ""}
          </span>
          <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(c.id)}>
            <Trash2 className="size-3.5 text-red-600" />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Nombre del ciclo" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-xs" />
      </div>
      <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
        <Plus className="size-3.5" />
        Agregar ciclo
      </Button>
    </div>
  );
}
