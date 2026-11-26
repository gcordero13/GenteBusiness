"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileText, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PreguntaGestion } from "@/lib/aprendizaje/evaluacion";
import { FIELD_CLASS_NAME, type Leccion } from "@/lib/aprendizaje/types";
import { addLeccionArchivo, deleteLeccion, removeLeccionArchivo, setLeccionVideoFile, updateLeccion } from "../actions";
import { CuestionarioEditor } from "./CuestionarioEditor";
import { SharePointUploadButton } from "./SharePointUploadButton";

export function LeccionEditor({
  cursoId,
  leccion,
  index,
  isFirst,
  isLast,
  onMove,
  preguntas = [],
}: {
  cursoId: string;
  leccion: Leccion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  preguntas?: PreguntaGestion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(leccion.title);
  const [body, setBody] = useState(leccion.body ?? "");
  const [videoUrl, setVideoUrl] = useState(leccion.videoUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function save() {
    run(() => updateLeccion(leccion.id, cursoId, { title, body, videoUrl }), () => setSaved(true));
  }

  function remove() {
    if (!confirm(`¿Eliminar la lección "${leccion.title}"? Se pierde el avance registrado en ella.`)) return;
    run(() => deleteLeccion(leccion.id, cursoId));
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col">
          <Button size="icon-xs" variant="ghost" disabled={isFirst || isPending} onClick={() => onMove(-1)} aria-label="Subir lección">
            <ChevronUp />
          </Button>
          <Button size="icon-xs" variant="ghost" disabled={isLast || isPending} onClick={() => onMove(1)} aria-label="Bajar lección">
            <ChevronDown />
          </Button>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {index + 1}. {leccion.title}
        </button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {[leccion.videoUrl || leccion.videoFile ? "video" : null, leccion.body ? "texto" : null, leccion.archivos.length ? `${leccion.archivos.length} archivo(s)` : null, leccion.quiz ? `cuestionario ${leccion.quiz.weight}%` : null]
            .filter(Boolean)
            .join(" · ") || "vacía"}
        </span>
        <Button size="icon-sm" variant="ghost" onClick={remove} disabled={isPending} aria-label="Eliminar lección">
          <Trash2 />
        </Button>
      </div>

      {open && (
        <div className="space-y-4 border-t p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor={`leccion-title-${leccion.id}`}>Título de la lección</Label>
            <Input id={`leccion-title-${leccion.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`leccion-video-${leccion.id}`}>Video</Label>
            {leccion.videoFile ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Video subido a SharePoint.</span>
                <Button size="sm" variant="ghost" onClick={() => run(() => setLeccionVideoFile(leccion.id, cursoId, null))}>
                  <X data-icon="inline-start" />
                  Quitar video
                </Button>
              </div>
            ) : (
              <Input
                id={`leccion-video-${leccion.id}`}
                placeholder="Enlace de YouTube, Vimeo o Stream (opcional)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            )}
            <SharePointUploadButton
              kind="video"
              label={leccion.videoFile ? "Reemplazar video" : "O subir un video"}
              disabled={isPending}
              onUploaded={async (file) => {
                const result = await setLeccionVideoFile(leccion.id, cursoId, file);
                if (result.error) return result.error;
                setVideoUrl("");
                router.refresh();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`leccion-body-${leccion.id}`}>Contenido</Label>
            <textarea
              id={`leccion-body-${leccion.id}`}
              rows={6}
              className={FIELD_CLASS_NAME}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Texto de la lección (opcional)"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Guías, documentos e imágenes</p>
            <ul className="space-y-1">
              {leccion.archivos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Quitar ${a.filename}`}
                    onClick={() => run(() => removeLeccionArchivo(a.id, cursoId))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <SharePointUploadButton
              kind="archivo"
              label="Agregar archivo"
              disabled={isPending}
              onUploaded={async (file) => {
                const result = await addLeccionArchivo(leccion.id, cursoId, file);
                if (result.error) return result.error;
                router.refresh();
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={isPending || !title.trim()}>
              Guardar lección
            </Button>
            {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Guardado</span>}
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-semibold">Cuestionario de la lección</p>
            <CuestionarioEditor cursoId={cursoId} leccionId={leccion.id} quiz={leccion.quiz} preguntas={preguntas} />
          </div>
        </div>
      )}
    </div>
  );
}
