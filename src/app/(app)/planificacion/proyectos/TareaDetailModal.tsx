"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addAdjunto,
  deleteTarea,
  listAdjuntos,
  removeAdjunto,
  type TareaAdjuntoRow,
  type TareaListRow,
} from "./actions";

export function TareaDetailModal({
  tarea,
  onClose,
}: {
  tarea: TareaListRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [adjuntos, setAdjuntos] = useState<TareaAdjuntoRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tarea) listAdjuntos(tarea.id).then(setAdjuntos);
  }, [tarea]);

  if (!tarea) return null;

  function uploadFile(file: File) {
    if (!tarea) return;
    setError(null);
    startTransition(async () => {
      const result = await addAdjunto(tarea.id, tarea.proyectoId, file);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdjuntos(await listAdjuntos(tarea.id));
      router.refresh();
    });
  }

  function remove(adjuntoId: string) {
    if (!tarea) return;
    startTransition(async () => {
      await removeAdjunto(adjuntoId, tarea.proyectoId);
      setAdjuntos(await listAdjuntos(tarea.id));
      router.refresh();
    });
  }

  function remove_task() {
    if (!tarea) return;
    startTransition(async () => {
      await deleteTarea(tarea.id, tarea.proyectoId);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{tarea.title}</h2>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {tarea.description && <p className="mb-3 text-sm text-muted-foreground">{tarea.description}</p>}
        <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Estado</dt>
            <dd className="font-medium text-foreground">{tarea.estadoName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prioridad</dt>
            <dd className="font-medium text-foreground">{tarea.priority ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fecha límite</dt>
            <dd className="font-medium text-foreground">{tarea.dueDate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Proyecto</dt>
            <dd className="font-medium text-foreground">{tarea.proyectoName}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Paperclip className="size-3.5" />
            Adjuntos
          </p>
          {adjuntos.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
              <a
                href={`/api/planificacion/adjunto/${a.driveId}/${a.itemId}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[#04B1AF] hover:underline"
              >
                {a.fileName}
              </a>
              <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(a.id)}>
                <Trash2 className="size-3.5 text-red-600" />
              </Button>
            </div>
          ))}
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed p-2 text-xs text-muted-foreground hover:bg-muted">
            <Upload className="size-3.5" />
            Subir archivo
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <Button
          variant="outline"
          disabled={isPending}
          onClick={remove_task}
          className="mt-4 w-full gap-1.5 text-red-600"
        >
          <Trash2 className="size-3.5" />
          Eliminar tarea
        </Button>
      </div>
    </div>
  );
}
