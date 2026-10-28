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
import { createTarea, type EstadoOption, type PlanificacionRow } from "./actions";
import { AssigneePicker } from "./AssigneePicker";
import { ESTADO_COLORS } from "./EstadosEditor";

export interface AssigneeOption {
  id: string;
  name: string;
}

export function TareaCreateDialog({
  proyectoId,
  parentTaskId,
  estados,
  assignees,
  planificaciones = [],
  fixedPlanificacionId,
  triggerLabel,
}: {
  proyectoId: string;
  parentTaskId: string | null;
  estados: EstadoOption[];
  assignees: AssigneeOption[];
  // Only meaningful for root tasks (parentTaskId null) - a sub-task doesn't
  // pick its own planificación, it inherits its place from its parent.
  planificaciones?: PlanificacionRow[];
  // Set when this dialog is opened from inside a specific planificación's
  // own page - every task created there belongs to it, so the picker is
  // skipped entirely instead of making the user re-select what's implied.
  fixedPlanificacionId?: string;
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estadoId, setEstadoId] = useState(estados[0]?.id ?? "");
  const [priority, setPriority] = useState<"alta" | "media" | "baja" | "">("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [planificacionId, setPlanificacionId] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("");
    setStartDate("");
    setDueDate("");
    setAssigneeId("");
    setPlanificacionId("");
    setColor(null);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTarea({
        proyectoId,
        parentTaskId,
        title,
        description,
        estadoId: estadoId || null,
        priority: priority || null,
        labels: [],
        startDate: startDate || null,
        dueDate: dueDate || null,
        assigneeId: assigneeId || null,
        cicloId: null,
        planificacionId: parentTaskId ? null : (fixedPlanificacionId ?? (planificacionId || null)),
        color,
        moduloIds: [],
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
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-3.5" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Estado</label>
              <Select value={estadoId} onValueChange={(v) => v && setEstadoId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => estados.find((e) => e.id === estadoId)?.name ?? "Selecciona"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {estados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Prioridad</label>
              <Select value={priority} onValueChange={(v) => setPriority((v as typeof priority) || "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => priority || "Ninguna"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Fecha de inicio</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Fecha límite</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {!parentTaskId && fixedPlanificacionId === undefined && planificaciones.length > 0 && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Planificación</label>
              <Select value={planificacionId} onValueChange={(v) => setPlanificacionId(v || "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {() => planificaciones.find((p) => p.id === planificacionId)?.name ?? "Sin planificación"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {planificaciones.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Responsable</label>
            <AssigneePicker assignees={assignees} value={assigneeId} onChange={setAssigneeId} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Color de la tarea</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`flex size-6 items-center justify-center rounded-full border-2 text-muted-foreground ${color === null ? "border-foreground" : "border-dashed border-muted-foreground/40"}`}
                title="Sin color"
              >
                <span className="text-[10px]">×</span>
              </button>
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
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !title.trim()} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
