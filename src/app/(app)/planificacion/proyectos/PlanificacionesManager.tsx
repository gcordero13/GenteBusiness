"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPlanificacion, deletePlanificacion, type PlanificacionRow } from "./actions";

// The hierarchy layer between the project and its tasks (Proyecto ->
// Planificación -> Tarea -> Subtarea) - confirmed with the user: it's
// structurally like a mini-project, so this manager intentionally mirrors
// EstadosEditor/ModulosManager's shape rather than inventing a new pattern.
export function PlanificacionesManager({ proyectoId, planificaciones }: { proyectoId: string; planificaciones: PlanificacionRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createPlanificacion(proyectoId, name, "");
      setName("");
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("¿Eliminar esta planificación? Las tareas que tenía quedan sin planificación asignada.")) return;
    startTransition(async () => {
      await deletePlanificacion(id, proyectoId);
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
        Planificaciones de este proyecto ({planificaciones.length})
      </button>
      {expanded && (
        <>
          <div className="space-y-1">
            {planificaciones.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                <Link
                  href={`/planificacion/proyectos/${proyectoId}/${p.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-[#04B1AF] hover:underline"
                >
                  {p.name}
                </Link>
                <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(p.id)}>
                  <Trash2 className="size-3.5 text-red-600" />
                </Button>
              </div>
            ))}
            {planificaciones.length === 0 && (
              <p className="py-1 text-xs text-muted-foreground">Todavía no hay planificaciones.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre de la planificación"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="h-8 text-xs"
            />
            <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
              <Plus className="size-3.5" />
              Agregar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
