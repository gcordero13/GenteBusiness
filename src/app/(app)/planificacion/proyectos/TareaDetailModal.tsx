"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Paperclip, Pencil, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addAdjunto,
  addComentario,
  deleteTarea,
  listAdjuntos,
  listComentarios,
  removeAdjunto,
  updateTarea,
  updateTareaPercent,
  type ComentarioRow,
  type EstadoOption,
  type TareaAdjuntoRow,
  type TareaListRow,
} from "./actions";
import { CompartirDialog } from "./CompartirDialog";
import { ESTADO_COLORS } from "./EstadosEditor";
import type { AssigneeOption } from "./TareaCreateDialog";

export function TareaDetailModal({
  tarea,
  onClose,
  estados = [],
  assignees = [],
}: {
  tarea: TareaListRow | null;
  onClose: () => void;
  estados?: EstadoOption[];
  assignees?: AssigneeOption[];
}) {
  const router = useRouter();
  const [adjuntos, setAdjuntos] = useState<TareaAdjuntoRow[]>([]);
  const [comentarios, setComentarios] = useState<ComentarioRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja" | "">("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [percentDraft, setPercentDraft] = useState(0);
  const [lastTareaId, setLastTareaId] = useState<string | null>(null);

  // Reset edit/error/percent state when switching to a different task (or
  // closing the modal) - done during render, not in the effect below, since
  // synchronously calling setState inside an effect body is a cascading-
  // render anti-pattern; this is React's documented "adjust state while
  // rendering" alternative, guarded by lastTareaId so it only fires once
  // per task change.
  if ((tarea?.id ?? null) !== lastTareaId) {
    setLastTareaId(tarea?.id ?? null);
    setIsEditing(false);
    setError(null);
    setPercentDraft(tarea?.percentComplete ?? 0);
  }

  useEffect(() => {
    if (tarea) listAdjuntos(tarea.id).then(setAdjuntos);
  }, [tarea]);

  useEffect(() => {
    if (tarea) listComentarios(tarea.id).then(setComentarios);
  }, [tarea]);

  if (!tarea) return null;

  function startEdit() {
    if (!tarea) return;
    setTitle(tarea.title);
    setDescription(tarea.description ?? "");
    setEstadoId(tarea.estadoId ?? "");
    setPriority(tarea.priority ?? "");
    setStartDate(tarea.startDate ?? "");
    setDueDate(tarea.dueDate ?? "");
    setAssigneeId(tarea.assigneeId ?? "");
    setColor(tarea.color);
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function saveEdit() {
    if (!tarea) return;
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateTarea({
        id: tarea.id,
        proyectoId: tarea.proyectoId,
        title,
        description,
        estadoId: estados.length > 0 ? estadoId || null : tarea.estadoId,
        priority: priority || null,
        labels: tarea.labels,
        startDate: startDate || null,
        dueDate: dueDate || null,
        assigneeId: assignees.length > 0 ? assigneeId || null : tarea.assigneeId,
        cicloId: tarea.cicloId,
        color,
        moduloIds: tarea.moduloIds,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      onClose();
      router.refresh();
    });
  }

  function commitPercent(value: number) {
    if (!tarea) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTareaPercent(tarea.id, value, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        setPercentDraft(tarea.percentComplete);
        return;
      }
      router.refresh();
    });
  }

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

  function submitComment() {
    if (!tarea || !newComment.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addComentario(tarea.id, tarea.proyectoId, newComment);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewComment("");
      setComentarios(await listComentarios(tarea.id));
    });
  }

  function remove_task() {
    if (!tarea) return;
    if (!confirm(`¿Eliminar la tarea "${tarea.title}"? Esta acción no se puede deshacer.`)) return;
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
          {isEditing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold"
              placeholder="Título"
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {tarea.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tarea.color }} />}
              <h2 className="truncate text-lg font-semibold text-foreground">{tarea.title}</h2>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!isEditing && (
              <Button size="icon-sm" variant="ghost" onClick={startEdit} title="Editar">
                <Pencil className="size-4" />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <div className="mb-4 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">Progreso</span>
            <span className="font-semibold text-foreground">{tarea.hasChildren ? tarea.percentComplete : percentDraft}%</span>
          </div>
          {tarea.hasChildren ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[#04B1AF]" style={{ width: `${tarea.percentComplete}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">Calculado a partir de las subtareas</p>
            </>
          ) : (
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={percentDraft}
              disabled={isPending}
              onChange={(e) => setPercentDraft(Number(e.target.value))}
              onMouseUp={(e) => commitPercent(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={() => commitPercent(percentDraft)}
              onKeyUp={() => commitPercent(percentDraft)}
              className="w-full accent-[#04B1AF]"
            />
          )}
        </div>

        {isEditing ? (
          <div className="mb-4 space-y-3">
            <textarea
              placeholder="Descripción (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Estado</label>
                {estados.length > 0 ? (
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
                ) : (
                  <p className="flex h-8 items-center text-xs text-muted-foreground">{tarea.estadoName ?? "—"}</p>
                )}
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Fecha de inicio</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Fecha límite</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Responsable</label>
              {assignees.length > 0 ? (
                <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v || "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{() => assignees.find((a) => a.id === assigneeId)?.name ?? "Sin asignar"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex h-8 items-center text-xs text-muted-foreground">Sin asignar</p>
              )}
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
            <div className="flex gap-2">
              <Button
                onClick={saveEdit}
                disabled={isPending || !title.trim()}
                className="flex-1 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
              >
                Guardar
              </Button>
              <Button variant="outline" disabled={isPending} onClick={cancelEdit} className="flex-1">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}

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

        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <MessageSquare className="size-3.5" />
            Comentarios
          </p>
          <div className="space-y-2">
            {comentarios.map((c) => (
              <div key={c.id} className="rounded-lg border p-2 text-xs">
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="font-semibold text-foreground">{c.createdByName}</span>
                  <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>
              </div>
            ))}
            {comentarios.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">Todavía no hay comentarios.</p>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              placeholder="Escribe un comentario..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
            />
            <Button
              size="sm"
              disabled={isPending || !newComment.trim()}
              onClick={submitComment}
              className="shrink-0 self-end bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
            >
              Comentar
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <CompartirDialog tareaId={tarea.id} parentProyectoId={tarea.proyectoId} />
          <Button
            variant="outline"
            disabled={isPending}
            onClick={remove_task}
            className="flex-1 gap-1.5 text-red-600"
          >
            <Trash2 className="size-3.5" />
            Eliminar tarea
          </Button>
        </div>
      </div>
    </div>
  );
}
