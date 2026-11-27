"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, GripVertical, ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createEstado, deleteEstado, reorderEstados, type EstadoOption } from "./actions";

export const ESTADO_COLORS = ["#94a3b8", "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"];

// A modal, not an inline panel - confirmed with the user: the old
// always-expandable section pushed the task workspace further down the
// page. Same trigger-button-opens-a-Dialog shape as CompartirDialog.
export function EstadosEditor({ proyectoId, estados }: { proyectoId: string; estados: EstadoOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(ESTADO_COLORS[0]);
  const [isPending, startTransition] = useTransition();

  // Local, optimistically-reorderable copy - drag feedback has to be
  // instant, not wait on a round trip, and router.refresh() replaces this
  // with the server's own order once the write lands. Synced from the
  // `estados` prop during render (React's documented alternative to an
  // effect that only mirrors a prop), not in an effect body.
  const [order, setOrder] = useState(estados);
  const [lastEstados, setLastEstados] = useState(estados);
  if (estados !== lastEstados) {
    setLastEstados(estados);
    setOrder(estados);
  }
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  function remove(id: string, name: string) {
    if (!confirm(`¿Eliminar el estado "${name}"? Las tareas que lo tenían quedan sin estado.`)) return;
    startTransition(async () => {
      await deleteEstado(id, proyectoId);
      router.refresh();
    });
  }

  function persistOrder(next: EstadoOption[]) {
    setOrder(next);
    startTransition(async () => {
      await reorderEstados(proyectoId, next.map((e) => e.id));
      router.refresh();
    });
  }

  function dropOn(targetId: string) {
    setDragOverId(null);
    const draggedId = draggingId;
    setDraggingId(null);
    if (!draggedId || draggedId === targetId) return;

    const next = [...order];
    const fromIndex = next.findIndex((e) => e.id === draggedId);
    const toIndex = next.findIndex((e) => e.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persistOrder(next);
  }

  // Touch devices don't support native HTML5 drag-and-drop at all -
  // confirmed with the user: the module needs to work well on phones, so
  // reordering can't depend on drag alone. These buttons give everyone
  // (mouse or touch) a second, always-available way to do the same thing.
  function move(id: string, delta: -1 | 1) {
    const index = order.findIndex((e) => e.id === id);
    const targetIndex = index + delta;
    if (index === -1 || targetIndex < 0 || targetIndex >= order.length) return;
    const next = [...order];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    persistOrder(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <ListChecks className="size-3.5" />
        Estados ({order.length})
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Estados de este proyecto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Arrastra un estado (o usa las flechas) para cambiar su orden en el Tablero.
          </p>
          <div className="flex flex-wrap gap-2">
            {order.map((e, index) => (
              <span
                key={e.id}
                draggable
                onDragStart={() => setDraggingId(e.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  if (dragOverId !== e.id) setDragOverId(e.id);
                }}
                onDragLeave={() => setDragOverId((prev) => (prev === e.id ? null : prev))}
                onDrop={(ev) => {
                  ev.preventDefault();
                  dropOn(e.id);
                }}
                className={`flex cursor-grab items-center gap-1 rounded-full border py-1 pr-2 pl-1 text-xs font-semibold transition-all duration-150 active:cursor-grabbing ${
                  draggingId === e.id
                    ? "scale-95 opacity-40"
                    : dragOverId === e.id
                      ? "scale-105 ring-2 ring-[#04B1AF]"
                      : ""
                }`}
                style={{ borderColor: e.color ?? undefined }}
              >
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    disabled={isPending || index === 0}
                    onClick={() => move(e.id, -1)}
                    className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20"
                    title="Mover antes"
                  >
                    <ChevronLeft className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={isPending || index === order.length - 1}
                    onClick={() => move(e.id, 1)}
                    className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20"
                    title="Mover después"
                  >
                    <ChevronRight className="size-3" />
                  </button>
                </span>
                <GripVertical className="hidden size-3 text-muted-foreground/50 sm:block" />
                <span className="size-1.5 rounded-full" style={{ backgroundColor: e.color ?? "#94a3b8" }} />
                {e.name}
                {!e.isDefault && (
                  <button
                    type="button"
                    onClick={() => remove(e.id, e.name)}
                    disabled={isPending}
                    title="Eliminar"
                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
          </div>

          {/* A visible gap, not just spacing - confirmed with the user:
              deleting an estado and adding one shouldn't feel like the
              same action living right next to each other. */}
          <div className="border-t pt-3">
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
                <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5 bg-[#036E6C] text-white hover:bg-[#024E4D]">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
