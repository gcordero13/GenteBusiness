"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEstado, deleteEstado, type EstadoOption } from "./actions";

export const ESTADO_COLORS = ["#94a3b8", "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"];

export function EstadosEditor({ proyectoId, estados }: { proyectoId: string; estados: EstadoOption[] }) {
  const router = useRouter();
  // Collapsed by default - confirmed with the user: this panel shouldn't
  // take up space on the project page unless someone actually wants to
  // touch the estados, same "tucked away" idea already applied to the
  // add-custom-estado form below.
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(ESTADO_COLORS[0]);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createEstado(proyectoId, name, color);
      setName("");
      setColor(ESTADO_COLORS[0]);
      setAdding(false);
      router.refresh();
    });
  }

  function cancelAdd() {
    setName("");
    setColor(ESTADO_COLORS[0]);
    setAdding(false);
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteEstado(id, proyectoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-muted-foreground"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Estados de este proyecto ({estados.length})
      </button>
      {expanded && (
        <>
          <div className="flex flex-wrap gap-2">
            {estados.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                style={{ borderColor: e.color ?? undefined }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: e.color ?? "#94a3b8" }} />
                {e.name}
                {!e.isDefault && (
                  <button type="button" onClick={() => remove(e.id)} disabled={isPending}>
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {adding ? (
            <div className="flex gap-2">
              <Input
                placeholder="Nuevo estado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-xs"
                autoFocus
              />
              <div className="flex gap-1">
                {ESTADO_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`size-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
                <Plus className="size-3.5" />
                Agregar
              </Button>
              <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={cancelAdd} title="Cancelar">
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)} className="gap-1.5 text-xs text-muted-foreground">
              <Plus className="size-3.5" />
              Agregar estado personalizado
            </Button>
          )}
        </>
      )}
    </div>
  );
}
