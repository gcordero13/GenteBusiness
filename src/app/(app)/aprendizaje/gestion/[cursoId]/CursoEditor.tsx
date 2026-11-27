"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archivoUrl,
  CATEGORY_LABELS,
  FIELD_CLASS_NAME,
  STATUS_LABELS,
  type CursoCategory,
  type CursoDetail,
  type CursoStatus,
} from "@/lib/aprendizaje/types";
import {
  createLeccion,
  deleteCurso,
  reorderLecciones,
  setAnunciarProximamente,
  setCursoCover,
  setCursoStatus,
  updateCurso,
} from "../actions";
import type { PreguntaGestion } from "@/lib/aprendizaje/evaluacion";
import { EvaluacionEditor } from "./EvaluacionEditor";
import { FirmaCertificadoEditor } from "./FirmaCertificadoEditor";
import { LeccionEditor } from "./LeccionEditor";
import { SharePointUploadButton } from "./SharePointUploadButton";

const STATUS_ACTIONS: Record<CursoStatus, { label: string; to: CursoStatus }[]> = {
  borrador: [{ label: "Publicar", to: "publicado" }],
  publicado: [
    { label: "Pasar a borrador", to: "borrador" },
    { label: "Archivar", to: "archivado" },
  ],
  archivado: [{ label: "Publicar de nuevo", to: "publicado" }],
};

export function CursoEditor({ curso, preguntas = [] }: { curso: CursoDetail; preguntas?: PreguntaGestion[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(curso.title);
  const [description, setDescription] = useState(curso.description ?? "");
  const [category, setCategory] = useState<CursoCategory>(curso.category);
  const [newLeccion, setNewLeccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const ids = curso.lecciones.map((l) => l.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderLecciones(curso.id, ids));
  }

  function remove() {
    if (!confirm(`¿Eliminar el curso "${curso.title}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCurso(curso.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/aprendizaje/gestion");
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/aprendizaje/gestion" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Volver a Gestión
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{curso.title}</h1>
        <Badge variant={curso.status === "publicado" ? "default" : curso.status === "borrador" ? "secondary" : "outline"}>
          {STATUS_LABELS[curso.status]}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            href={`/aprendizaje/${curso.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted"
          >
            <Eye className="size-4" />
            Vista previa
          </Link>
          {STATUS_ACTIONS[curso.status].map((a) => (
            <Button
              key={a.to}
              variant={a.to === "publicado" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => run(() => setCursoStatus(curso.id, a.to))}
            >
              {a.label}
            </Button>
          ))}
          {curso.status === "borrador" && (
            <Button variant="destructive" disabled={isPending} onClick={remove}>
              Eliminar curso
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Datos del curso</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="editor-title">Título</Label>
            <Input id="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editor-category">Categoría</Label>
            <select
              id="editor-category"
              className={FIELD_CLASS_NAME}
              value={category}
              onChange={(e) => setCategory(e.target.value as CursoCategory)}
            >
              {(Object.keys(CATEGORY_LABELS) as CursoCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="editor-description">Descripción</Label>
            <textarea
              id="editor-description"
              rows={3}
              className={FIELD_CLASS_NAME}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Button
            disabled={isPending || !title.trim()}
            onClick={() => run(() => updateCurso(curso.id, { title, description, category }), () => setNotice("Datos guardados."))}
          >
            Guardar datos
          </Button>
          <div className="flex items-center gap-3">
            {curso.cover && (
              // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
              <img src={archivoUrl(curso.cover)} alt="Portada" className="h-12 w-20 rounded border object-cover" />
            )}
            <SharePointUploadButton
              kind="portada"
              label={curso.cover ? "Cambiar portada" : "Subir portada"}
              disabled={isPending}
              onUploaded={async (file) => {
                const result = await setCursoCover(curso.id, file);
                if (result.error) return result.error;
                router.refresh();
              }}
            />
          </div>
        </div>
        {curso.status === "borrador" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={curso.anunciarProximamente}
              disabled={isPending}
              onChange={(e) => run(() => setAnunciarProximamente(curso.id, e.target.checked))}
              className="accent-[#04B1AF]"
            />
            Anunciar como “Próximamente” en la portada (se muestran solo el título y la descripción)
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lecciones</h2>
        {curso.lecciones.map((l, i) => (
          <LeccionEditor
            key={l.id}
            cursoId={curso.id}
            leccion={l}
            preguntas={preguntas.filter((p) => p.leccionId === l.id)}
            index={i}
            isFirst={i === 0}
            isLast={i === curso.lecciones.length - 1}
            onMove={(direction) => move(i, direction)}
          />
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="Título de la nueva lección"
            value={newLeccion}
            onChange={(e) => setNewLeccion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLeccion.trim()) run(() => createLeccion(curso.id, newLeccion), () => setNewLeccion(""));
            }}
          />
          <Button
            variant="outline"
            disabled={isPending || !newLeccion.trim()}
            onClick={() => run(() => createLeccion(curso.id, newLeccion), () => setNewLeccion(""))}
          >
            <Plus data-icon="inline-start" />
            Agregar lección
          </Button>
        </div>
      </section>

      <EvaluacionEditor cursoId={curso.id} settings={curso.evaluacion} lecciones={curso.lecciones} />


      <FirmaCertificadoEditor curso={curso} />
    </div>
  );
}
