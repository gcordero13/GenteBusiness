"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPlanificacion, deletePlanificacion, type PlanificacionRow } from "./actions";

// The hierarchy layer between the project and its tasks (Proyecto ->
// Planificación -> Tarea -> Subtarea) - confirmed with the user: it's
// structurally like a mini-project, with its own detail page (each row
// here links into it). A modal, not an inline panel - the old
// always-expandable section pushed the task workspace further down the
// page, same complaint fixed for EstadosEditor.
export function PlanificacionesManager({ proyectoId, planificaciones }: { proyectoId: string; planificaciones: PlanificacionRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <FolderKanban className="size-3.5" />
        Planificaciones ({planificaciones.length})
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planificaciones de este proyecto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            {planificaciones.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                <Link
                  href={`/planificacion/proyectos/${proyectoId}/${p.id}`}
                  onClick={() => setOpen(false)}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
