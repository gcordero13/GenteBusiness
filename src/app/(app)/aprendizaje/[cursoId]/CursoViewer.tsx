"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstPendingLeccionId, nextLeccionId, progressPercent } from "@/lib/aprendizaje/mapCurso";
import type { EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import { CATEGORY_LABELS, type CursoDetail } from "@/lib/aprendizaje/types";
import { marcarLeccionVista } from "../actions";
import { EvaluacionCard } from "./EvaluacionCard";
import { LeccionContent } from "./LeccionContent";

export function CursoViewer({
  curso,
  evaluacion = null,
}: {
  curso: CursoDetail;
  evaluacion?: EvaluacionEstado | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(() => firstPendingLeccionId(curso.lecciones));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = curso.lecciones.find((l) => l.id === selectedId) ?? curso.lecciones[0] ?? null;
  const done = curso.lecciones.filter((l) => l.completed).length;
  const percent = progressPercent(done, curso.lecciones.length);
  const isPreview = curso.status !== "publicado";

  function select(id: string) {
    setError(null);
    setSelectedId(id);
  }

  function markSeen() {
    if (!selected) return;
    const current = selected.id;
    setError(null);
    startTransition(async () => {
      const result = await marcarLeccionVista(current, curso.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      const next = nextLeccionId(curso.lecciones, current);
      if (next) setSelectedId(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/aprendizaje" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Volver al catálogo
        </Link>
        <p className="text-xs font-medium tracking-wide text-[#04B1AF] uppercase">{CATEGORY_LABELS[curso.category]}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{curso.title}</h1>
        {curso.description && <p className="text-sm text-muted-foreground">{curso.description}</p>}
        <div className="max-w-md space-y-1">
          <p className="text-xs text-muted-foreground">
            {done} de {curso.lecciones.length} lecciones vistas
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {isPreview && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Vista previa: este curso no está publicado, así que no se registra avance.
        </p>
      )}
      {curso.completedAt && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          <PartyPopper className="size-4" />
          ¡Completaste este curso!
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <ol className="space-y-1">
          {curso.lecciones.map((l, i) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => select(l.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  l.id === selected?.id ? "bg-[#04B1AF]/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {l.completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="size-4 shrink-0" />
                )}
                <span className="truncate">
                  {i + 1}. {l.title}
                </span>
              </button>
            </li>
          ))}
        </ol>

        {selected ? (
          <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <LeccionContent leccion={selected} />
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {selected.completed ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  Lección vista
                </span>
              ) : (
                !isPreview && (
                  <Button onClick={markSeen} disabled={isPending}>
                    Marcar como vista
                  </Button>
                )
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Este curso todavía no tiene lecciones.</p>
        )}
      </div>

      {curso.evaluacion.questionsPerAttempt !== null && evaluacion && (
        <EvaluacionCard
          cursoId={curso.id}
          settings={curso.evaluacion}
          estado={evaluacion}
          lessonsDone={curso.lecciones.length > 0 && done === curso.lecciones.length}
          isPreview={isPreview}
        />
      )}
    </div>
  );
}
