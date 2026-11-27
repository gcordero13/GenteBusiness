"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  ListTodo,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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
  createTarea,
  deleteTarea,
  getTarea,
  listAdjuntos,
  listComentarios,
  listEstados,
  listSubtareas,
  removeAdjunto,
  updateTarea,
  updateTareaPercent,
  type ComentarioRow,
  type EstadoOption,
  type PlanificacionRow,
  type TareaAdjuntoRow,
  type TareaListRow,
} from "./actions";
import { AssigneePicker } from "./AssigneePicker";
import { EstadoPill, FechaLimiteText, PersonaAvatar, PrioridadBadge } from "./Distintivos";
import { esCerrada, fechaCorta, hoyISO } from "./visual";
import { CompartirDialog } from "./CompartirDialog";
import { ESTADO_COLORS } from "./EstadosEditor";
import { progressOpacity } from "./progress";
import { celebrateCompletion } from "./celebrate";
import type { AssigneeOption } from "./TareaCreateDialog";

export function TareaDetailModal({
  tarea,
  onClose,
  onSelectTarea,
  estados = [],
  assignees = [],
  planificaciones = [],
}: {
  tarea: TareaListRow | null;
  onClose: () => void;
  // Lets clicking a sub-task in the checklist below jump straight into ITS
  // own detail view, re-using this same modal instance.
  onSelectTarea?: (t: TareaListRow) => void;
  estados?: EstadoOption[];
  assignees?: AssigneeOption[];
  // Only shown/editable for root tasks - a sub-task inherits its place in
  // the hierarchy from its parent instead of picking its own.
  planificaciones?: PlanificacionRow[];
}) {
  const router = useRouter();
  const [adjuntos, setAdjuntos] = useState<TareaAdjuntoRow[]>([]);
  const [comentarios, setComentarios] = useState<ComentarioRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [subtareas, setSubtareas] = useState<TareaListRow[]>([]);
  const [subtareasExpanded, setSubtareasExpanded] = useState(true);
  const [viewingAdjunto, setViewingAdjunto] = useState<TareaAdjuntoRow | null>(null);
  const [newSubtarea, setNewSubtarea] = useState("");
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
  const [planificacionId, setPlanificacionId] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [percentDraft, setPercentDraft] = useState(0);
  const [lastTareaId, setLastTareaId] = useState<string | null>(null);

  // Reset edit/error/percent state - and, critically, clear the previous
  // task's fetched adjuntos/comentarios/subtareas - the instant the task
  // switches. Done during render (not in the effects below that actually
  // fetch the new task's data) so the old task's data is gone in the SAME
  // render as the id change, before anything paints. Without this, the
  // previous task's sub-tasks stayed on screen - rendered under the NEW
  // task's title - for the one render/network round trip before the fresh
  // (possibly empty) list arrived: a real information leak across tasks,
  // not just a cosmetic flash, since two tasks can have entirely different
  // viewers. Guarded by lastTareaId so it only fires once per task change.
  if ((tarea?.id ?? null) !== lastTareaId) {
    setLastTareaId(tarea?.id ?? null);
    setIsEditing(false);
    setError(null);
    setPercentDraft(tarea?.percentComplete ?? 0);
    setAdjuntos([]);
    setComentarios([]);
    setSubtareas([]);
  }

  // Keyed on the id (not the whole `tarea` object) so refreshTarea()
  // handing back a new object for the SAME task - after toggling one of
  // its own sub-tasks - doesn't re-fetch these. The `cancelled` guard fixes
  // a real bug: clicking from task A to task B fast enough that A's
  // listAdjuntos/listComentarios/listSubtareas call resolves AFTER B's
  // (out-of-order network timing) used to let A's stale data briefly
  // overwrite B's correct one, flashing a wrong sub-task/comment/adjunto
  // before the next re-render fixed it.
  const tareaId = tarea?.id ?? null;
  const tareaProyectoId = tarea?.proyectoId ?? null;

  // `estados` is [] on pages that mix tasks from unrelated projects (e.g.
  // "Mis tareas" - no single catalog applies there, same restriction
  // Tablero/Lista already have). But this modal is always scoped to exactly
  // ONE task's ONE project, so instead of going read-only it fetches that
  // project's own catalog - re-fetched per task since different rows here
  // can belong to different projects.
  const [fetchedEstados, setFetchedEstados] = useState<EstadoOption[]>([]);
  const effectiveEstados = estados.length > 0 ? estados : fetchedEstados;

  useEffect(() => {
    // Stale fetchedEstados from a previous task is harmless when estados.length
    // > 0 here - effectiveEstados ignores it in that case, so there's nothing
    // to reset.
    if (!tareaProyectoId || estados.length > 0) return;
    let cancelled = false;
    listEstados(tareaProyectoId).then((data) => {
      if (!cancelled) setFetchedEstados(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tareaProyectoId, estados.length]);

  useEffect(() => {
    if (!tareaId) return;
    let cancelled = false;
    listAdjuntos(tareaId).then((data) => {
      if (!cancelled) setAdjuntos(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tareaId]);

  useEffect(() => {
    if (!tareaId) return;
    let cancelled = false;
    listComentarios(tareaId).then((data) => {
      if (!cancelled) setComentarios(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tareaId]);

  // Chat-like: always land on the latest comment instead of making the
  // user scroll down to it, both on first load and after posting a new one.
  const comentariosScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = comentariosScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comentarios]);

  useEffect(() => {
    if (!tareaId) return;
    let cancelled = false;
    listSubtareas(tareaId).then((data) => {
      if (!cancelled) setSubtareas(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tareaId]);

  // Esc closes the side panel (the attachment viewer on top closes first).
  useEffect(() => {
    if (!tarea) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewingAdjunto) setViewingAdjunto(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tarea, viewingAdjunto, onClose]);

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
    setPlanificacionId(tarea.planificacionId ?? "");
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
        estadoId: effectiveEstados.length > 0 ? estadoId || null : tarea.estadoId,
        priority: priority || null,
        labels: tarea.labels,
        startDate: startDate || null,
        dueDate: dueDate || null,
        assigneeId: assignees.length > 0 ? assigneeId || null : tarea.assigneeId,
        cicloId: tarea.cicloId,
        planificacionId: tarea.parentTaskId
          ? null
          : planificaciones.length > 0
            ? planificacionId || null
            : tarea.planificacionId,
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

  function commitPercent(value: number, anchorEl: HTMLElement | null) {
    if (!tarea) return;
    setError(null);
    const wasComplete = tarea.percentComplete === 100;
    startTransition(async () => {
      const result = await updateTareaPercent(tarea.id, value, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        setPercentDraft(tarea.percentComplete);
        return;
      }
      if (value === 100 && !wasComplete) celebrateCompletion(anchorEl);
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

  // Quick To-Do-style add: just a title, everything else defaults (no
  // estado/assignee/dates) - confirmed with the user, who wanted a simple
  // checklist rather than the full task-create form for this.
  // A sub-task change can move THIS task's own rollup-computed
  // percent/estado server-side (via plan_recompute_ancestor_percent) -
  // re-fetch it and hand the fresh copy back up through onSelectTarea so
  // the already-open modal actually shows the new numbers instead of the
  // stale object it was opened with.
  async function refreshTarea() {
    if (!tarea) return;
    const fresh = await getTarea(tarea.id);
    if (fresh) onSelectTarea?.(fresh);
  }

  function addSubtarea() {
    if (!tarea || !newSubtarea.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createTarea({
        proyectoId: tarea.proyectoId,
        parentTaskId: tarea.id,
        title: newSubtarea,
        description: "",
        estadoId: null,
        priority: null,
        labels: [],
        startDate: null,
        dueDate: null,
        assigneeId: null,
        cicloId: null,
        planificacionId: null,
        color: null,
        moduloIds: [],
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewSubtarea("");
      setSubtareas(await listSubtareas(tarea.id));
      await refreshTarea();
      router.refresh();
    });
  }

  // Checking a box marks that sub-task fully done (100%) or back to not
  // started (0%) - a sub-task that turns out to have its own children is
  // still rejected server-side by updateTareaPercent regardless of what
  // this checklist's (batch-local) hasChildren thinks.
  function toggleSubtarea(sub: TareaListRow, anchorEl: HTMLElement | null) {
    if (!tarea) return;
    setError(null);
    const willComplete = sub.percentComplete !== 100;
    startTransition(async () => {
      const result = await updateTareaPercent(sub.id, sub.percentComplete === 100 ? 0 : 100, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (willComplete) celebrateCompletion(anchorEl);
      setSubtareas(await listSubtareas(tarea.id));
      await refreshTarea();
      router.refresh();
    });
  }

  // Clicking a sub-task swaps this same modal over to it (onSelectTarea), so
  // without this there was no way back up except closing everything.
  // getTarea goes through RLS: if the viewer can't see the parent task (e.g.
  // they were only assigned this sub-task), fall back to closing the modal,
  // which leaves them on the project.
  function goToParentTarea() {
    if (!tarea?.parentTaskId) return;
    const parentTaskId = tarea.parentTaskId;
    setError(null);
    startTransition(async () => {
      const parent = await getTarea(parentTaskId);
      if (parent && onSelectTarea) onSelectTarea(parent);
      else onClose();
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
    // A panel that slides in from the right (approved redesign 2026-11-27);
    // full screen on a phone. Clicking the dimmed page behind closes it.
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={tarea.title}
        className="flex h-dvh w-full max-w-2xl flex-col overflow-hidden border-l bg-card shadow-2xl duration-200 animate-in slide-in-from-right-8 fade-in-0 sm:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-3 border-b px-5 pt-4 pb-4 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            {tarea.parentTaskId ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={goToParentTarea}
                disabled={isPending}
                className="-ml-2 text-muted-foreground"
              >
                <ArrowLeft data-icon="inline-start" />
                Volver a la tarea principal
              </Button>
            ) : (
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                {tarea.proyectoName}
                {tarea.planificacionName && <> <span aria-hidden="true">›</span> {tarea.planificacionName}</>}
              </p>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {!isEditing && (
                <Button size="icon-sm" variant="outline" onClick={startEdit} title="Editar" aria-label="Editar tarea">
                  <Pencil className="size-4" />
                </Button>
              )}
              <Button size="icon-sm" variant="outline" onClick={onClose} aria-label="Cerrar">
                <X className="size-4" />
              </Button>
            </div>
          </div>
          {isEditing ? (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-semibold" placeholder="Título" />
          ) : (
            <>
              <div className="flex items-start gap-2.5">
                {tarea.color && <span className="mt-2.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tarea.color }} />}
                <h2 className="text-xl leading-snug font-bold tracking-tight text-[#0B2545] dark:text-foreground">{tarea.title}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <EstadoPill name={tarea.estadoName} color={tarea.estadoColor} />
                <PrioridadBadge priority={tarea.priority} />
                {tarea.dueDate && (
                  <FechaLimiteText
                    dueDate={tarea.dueDate}
                    hoy={hoyISO()}
                    cerrada={esCerrada(tarea.estadoKind) || tarea.percentComplete === 100}
                  />
                )}
              </div>
            </>
          )}
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-7">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
        <div className="mb-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">Avance</span>
            <span className="font-semibold text-foreground tabular-nums">{tarea.hasChildren ? tarea.percentComplete : percentDraft}%</span>
          </div>
          {tarea.hasChildren ? (
            <>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#04B1AF]"
                  style={{ width: `${tarea.percentComplete}%`, opacity: progressOpacity(tarea.percentComplete) }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Calculado a partir de las subtareas</p>
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
              onMouseUp={(e) => commitPercent(Number((e.target as HTMLInputElement).value), e.currentTarget)}
              onTouchEnd={(e) => commitPercent(percentDraft, e.currentTarget)}
              onKeyUp={(e) => commitPercent(percentDraft, e.currentTarget)}
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Estado</label>
                {effectiveEstados.length > 0 ? (
                  <Select value={estadoId} onValueChange={(v) => v && setEstadoId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{() => effectiveEstados.find((e) => e.id === estadoId)?.name ?? "Selecciona"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {effectiveEstados.map((e) => (
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
            {!tarea.parentTaskId && planificaciones.length > 0 && (
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
              {assignees.length > 0 ? (
                <AssigneePicker assignees={assignees} value={assigneeId} onChange={setAssigneeId} />
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
                className="flex-1 bg-[#036E6C] text-white hover:bg-[#024E4D]"
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
            <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Responsable</dt>
                <dd className="mt-1.5 flex items-center gap-2 text-sm text-foreground">
                  <PersonaAvatar name={tarea.assigneeName} photoUrl={tarea.assigneePhotoUrl} />
                  {tarea.assigneeName ?? "Sin asignar"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Fechas</dt>
                <dd className="mt-1.5 text-sm text-foreground">
                  {tarea.startDate || tarea.dueDate
                    ? `${tarea.startDate ? fechaCorta(tarea.startDate) : "—"} → ${tarea.dueDate ? fechaCorta(tarea.dueDate) : "—"}`
                    : "Sin fechas"}
                </dd>
              </div>
              {!tarea.parentTaskId && (
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Planificación</dt>
                  <dd className="mt-1.5 text-sm text-foreground">{tarea.planificacionName ?? "—"}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Creada por</dt>
                <dd className="mt-1.5 flex items-center gap-2 text-sm text-foreground">
                  <PersonaAvatar name={tarea.creatorName} photoUrl={tarea.creatorPhotoUrl} />
                  {tarea.creatorName}
                </dd>
              </div>
            </dl>
            {tarea.description && (
              <section className="mb-1 space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">Descripción</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{tarea.description}</p>
              </section>
            )}
          </>
        )}
        </div>

        <div className="space-y-7">
        <section className="space-y-2.5">
          <button
            type="button"
            onClick={() => setSubtareasExpanded((e) => !e)}
            aria-expanded={subtareasExpanded}
            className="flex w-full items-center gap-2 text-left text-sm font-semibold text-foreground"
          >
            {subtareasExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <ListTodo className="size-4 text-muted-foreground" />
            Subtareas
            {subtareas.length > 0 && (
              <span className="font-normal text-muted-foreground">
                {subtareas.filter((s) => s.percentComplete === 100).length} de {subtareas.length}
              </span>
            )}
          </button>
          {subtareasExpanded && (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-64 overflow-y-auto">
                {subtareas.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-3 border-b px-3.5 py-2.5 text-sm last:border-b-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(e) => toggleSubtarea(sub, e.currentTarget)}
                      aria-label={sub.percentComplete === 100 ? `"${sub.title}" completada` : `Completar "${sub.title}"`}
                      className="shrink-0 text-muted-foreground"
                    >
                      {sub.percentComplete === 100 ? (
                        <CheckSquare className="size-[18px] text-[#04B1AF]" />
                      ) : (
                        <Square className="size-[18px]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTarea?.(sub)}
                      className={`min-w-0 flex-1 truncate text-left hover:underline ${sub.percentComplete === 100 ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {sub.title}
                    </button>
                    {sub.percentComplete > 0 && sub.percentComplete < 100 && (
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{sub.percentComplete}%</span>
                    )}
                    {sub.assigneeName && <PersonaAvatar name={sub.assigneeName} photoUrl={sub.assigneePhotoUrl} />}
                  </div>
                ))}
                {subtareas.length === 0 && <p className="px-3.5 py-3 text-sm text-muted-foreground">Todavía no hay subtareas.</p>}
              </div>
              <div className="flex items-center gap-2 border-t bg-muted/30 px-2 py-1.5">
                <Plus className="ml-1.5 size-4 shrink-0 text-muted-foreground" />
                <Input
                  placeholder="Agregar subtarea"
                  aria-label="Agregar subtarea"
                  value={newSubtarea}
                  onChange={(e) => setNewSubtarea(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSubtarea()}
                  className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                />
                <Button size="sm" disabled={isPending || !newSubtarea.trim()} onClick={addSubtarea} className="h-8 px-3">
                  Agregar
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Paperclip className="size-4 text-muted-foreground" />
            Adjuntos
          </h3>
          {adjuntos.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {adjuntos.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 rounded-xl border p-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#04B1AF]/10 text-[10px] font-bold text-[#036E6C] uppercase dark:text-[#5FD6D4]">
                    {a.fileName.includes(".") ? a.fileName.split(".").pop()!.slice(0, 4) : "ARCH"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewingAdjunto(a)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-foreground hover:underline">{a.fileName}</span>
                    <span className="text-xs text-muted-foreground">Ver</span>
                  </button>
                  <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(a.id)} aria-label={`Quitar ${a.fileName}`}>
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted">
            <Upload className="size-4" />
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
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4 text-muted-foreground" />
            Comentarios
          </h3>
          <div ref={comentariosScrollRef} className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {comentarios.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <PersonaAvatar name={c.createdByName} photoUrl={null} className="mt-0.5" />
                <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-foreground">{c.createdByName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground/90">{c.body}</p>
                </div>
              </div>
            ))}
            {comentarios.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>}
          </div>
          <div className="flex items-end gap-2 rounded-xl border p-2 focus-within:ring-3 focus-within:ring-ring/50">
            <textarea
              placeholder="Escribe un comentario…"
              aria-label="Escribe un comentario"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="w-full resize-none bg-transparent px-1 text-sm outline-none"
            />
            <Button
              size="sm"
              disabled={isPending || !newComment.trim()}
              onClick={submitComment}
              className="shrink-0 bg-[#036E6C] text-white hover:bg-[#024E4D]"
            >
              Comentar
            </Button>
          </div>
        </section>
        </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-card px-5 py-3 sm:px-7">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={remove_task}
            className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Trash2 className="size-4" />
            Eliminar tarea
          </Button>
          <CompartirDialog tareaId={tarea.id} parentProyectoId={tarea.proyectoId} />
        </footer>
      </aside>

      {viewingAdjunto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewingAdjunto(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-2 rounded-2xl bg-card p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">{viewingAdjunto.fileName}</p>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/planificacion/adjunto/${viewingAdjunto.driveId}/${viewingAdjunto.itemId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Descargar"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <Download className="size-4" />
                </a>
                <Button size="icon-sm" variant="ghost" onClick={() => setViewingAdjunto(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto rounded-lg bg-muted/40">
              {viewingAdjunto.contentType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic authenticated SharePoint redirect, not a static/known-domain asset
                <img
                  src={`/api/planificacion/adjunto/${viewingAdjunto.driveId}/${viewingAdjunto.itemId}`}
                  alt={viewingAdjunto.fileName}
                  className="max-h-[75vh] max-w-full object-contain"
                />
              ) : viewingAdjunto.contentType === "application/pdf" ? (
                <iframe
                  src={`/api/planificacion/adjunto/${viewingAdjunto.driveId}/${viewingAdjunto.itemId}`}
                  title={viewingAdjunto.fileName}
                  className="h-[75vh] w-full rounded-lg"
                />
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Este tipo de archivo no se puede previsualizar aquí. Usa el botón de descarga.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
