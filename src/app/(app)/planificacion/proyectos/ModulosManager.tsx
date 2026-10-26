"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createModulo, deleteModulo, type ModuloRow } from "./actions";

export function ModulosManager({ proyectoId, modulos }: { proyectoId: string; modulos: ModuloRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createModulo(proyectoId, name, "");
      setName("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteModulo(id, proyectoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Módulos</p>
      {modulos.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
          <span>{m.name}</span>
          <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(m.id)}>
            <Trash2 className="size-3.5 text-red-600" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="Nombre del módulo" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
          <Plus className="size-3.5" />
          Agregar
        </Button>
      </div>
    </div>
  );
}
