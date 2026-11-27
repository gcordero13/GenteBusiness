"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, MonitorPlay, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_CLASS_NAME, type ModuloOption, type Tutorial } from "@/lib/aprendizaje/types";
import { tieneVideo } from "@/lib/aprendizaje/tutoriales";
import { deleteTutorial, saveTutorial, setTutorialActivo, type TutorialMedio } from "./actions";
import { SharePointUploadButton } from "./[cursoId]/SharePointUploadButton";

/**
 * Tutorials in Gestión (user, 2026-11-27): they are not courses - just a
 * name, the module they belong to and one video or image. Active as soon as
 * saved: people with that module see them in Aprende and once in a pop-up
 * when the platform opens.
 */
export function TutorialesGestion({ tutoriales, modulos }: { tutoriales: Tutorial[]; modulos: ModuloOption[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Tutorial | "nuevo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section aria-labelledby="tutoriales-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="tutoriales-title" className="text-lg font-semibold">
            Tutoriales
          </h2>
          <p className="text-sm text-muted-foreground">
            Un nombre, el módulo y un video o una imagen. Solo los ve quien tiene permiso en ese módulo: en Aprende y en un
            aviso al abrir la plataforma.
          </p>
        </div>
        <Button onClick={() => setEditando("nuevo")} className="gap-1.5 bg-[#036E6C] text-white hover:bg-[#024E4D]">
          <Plus className="size-4" />
          Nuevo tutorial
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {tutoriales.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay tutoriales. Crea el primero con «Nuevo tutorial».
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {tutoriales.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#04B1AF]/10 text-[#036E6C] dark:text-[#5FD6D4]">
                {tieneVideo(t) ? <MonitorPlay className="size-5" /> : <ImageIcon className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {t.moduleLabel} · {tieneVideo(t) ? "Video" : "Imagen"}
                </span>
              </span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.active}
                  disabled={isPending}
                  onChange={(e) => run(() => setTutorialActivo(t.id, e.target.checked))}
                  className="accent-[#04B1AF]"
                />
                Activo
              </label>
              <Button size="sm" variant="outline" onClick={() => setEditando(t)} className="gap-1.5">
                <Pencil className="size-3.5" />
                Editar
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={isPending}
                aria-label={`Eliminar ${t.title}`}
                onClick={() => {
                  if (confirm(`¿Eliminar el tutorial "${t.title}"?`)) run(() => deleteTutorial(t.id));
                }}
              >
                <Trash2 className="size-4 text-red-600" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <TutorialDialog
          tutorial={editando === "nuevo" ? null : editando}
          modulos={modulos}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function TutorialDialog({
  tutorial,
  modulos,
  onClose,
  onSaved,
}: {
  tutorial: Tutorial | null;
  modulos: ModuloOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(tutorial?.title ?? "");
  const [moduleKey, setModuleKey] = useState(tutorial?.moduleKey ?? "");
  const [fuente, setFuente] = useState<"archivo" | "enlace">(tutorial?.videoUrl ? "enlace" : "archivo");
  const [enlace, setEnlace] = useState(tutorial?.videoUrl ?? "");
  const [subido, setSubido] = useState<{ medio: TutorialMedio; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const actual = tutorial
    ? tutorial.videoUrl
      ? "Enlace de video"
      : tutorial.videoFile
        ? "Video subido"
        : "Imagen subida"
    : null;

  function save() {
    setError(null);
    let medio: TutorialMedio | null = null;
    if (fuente === "enlace" && enlace.trim() && enlace.trim() !== tutorial?.videoUrl) medio = { tipo: "enlace", url: enlace };
    if (fuente === "archivo" && subido) medio = subido.medio;
    startTransition(async () => {
      const result = await saveTutorial({ id: tutorial?.id, title, moduleKey, medio });
      if (result.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tutorial ? "Editar tutorial" : "Nuevo tutorial"}</DialogTitle>
          <DialogDescription>Solo lo verán quienes tengan permiso en el módulo que elijas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="tutorial-nombre">Nombre del tutorial</Label>
            <Input id="tutorial-nombre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cómo crear un proyecto" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tutorial-modulo">Módulo</Label>
            <select id="tutorial-modulo" className={FIELD_CLASS_NAME} value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
              <option value="">Elige el módulo…</option>
              {modulos.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Video o imagen</legend>
            {actual && <p className="text-sm text-muted-foreground">Actual: {actual}. Súbelo de nuevo solo si quieres cambiarlo.</p>}
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="fuente" checked={fuente === "archivo"} onChange={() => setFuente("archivo")} className="accent-[#04B1AF]" />
                Subir archivo
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="fuente" checked={fuente === "enlace"} onChange={() => setFuente("enlace")} className="accent-[#04B1AF]" />
                Enlace de YouTube o Vimeo
              </label>
            </div>
            {fuente === "archivo" ? (
              <div className="flex flex-wrap items-center gap-3">
                <SharePointUploadButton
                  kind="tutorial"
                  label={subido ? "Cambiar archivo" : "Subir video o imagen"}
                  disabled={isPending}
                  onUploaded={(file) => {
                    const ref = { driveId: file.driveId, itemId: file.itemId };
                    setSubido({
                      nombre: file.filename,
                      medio: file.contentType.startsWith("image/") ? { tipo: "imagen", file: ref } : { tipo: "video", file: ref },
                    });
                  }}
                />
                {subido && <span className="min-w-0 truncate text-sm text-emerald-700 dark:text-emerald-400">Listo: {subido.nombre}</span>}
              </div>
            ) : (
              <Input
                aria-label="Enlace del video"
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            )}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={isPending || !title.trim() || !moduleKey} className="bg-[#036E6C] text-white hover:bg-[#024E4D]">
            {tutorial ? "Guardar" : "Crear tutorial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
