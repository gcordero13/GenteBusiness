"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ClipboardCheck, ListOrdered, PartyPopper, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstPendingLeccionId, nextLeccionId, progressPercent } from "@/lib/aprendizaje/mapCurso";
import { notaCurso, type EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import { CATEGORY_LABELS, type CursoDetail } from "@/lib/aprendizaje/types";
import { marcarLeccionVista } from "../actions";
import { CuestionarioPanel } from "./CuestionarioPanel";
import { hasVideo, LeccionContent, LeccionVideo } from "./LeccionContent";
import { NotaCursoCard } from "./NotaCursoCard";

/**
 * Course player laid out like a video-course platform: the lesson's video
 * first and fully visible, the class list on the side, and a bottom bar with
 * the current class and the next step ("Siguiente clase" / "Ir al cuestionario").
 */
export function CursoViewer({
  curso,
  cuestionarios = {},
  initialLeccionId,
}: {
  curso: CursoDetail;
  /** The person's attempts on each lesson quiz, keyed by lesson id. */
  cuestionarios?: Record<string, EvaluacionEstado>;
  /** e.g. coming back from a quiz: reopen that lesson. */
  initialLeccionId?: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(() =>
    initialLeccionId && curso.lecciones.some((l) => l.id === initialLeccionId)
      ? initialLeccionId
      : firstPendingLeccionId(curso.lecciones),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = curso.lecciones.find((l) => l.id === selectedId) ?? curso.lecciones[0] ?? null;
  const selectedIndex = selected ? curso.lecciones.findIndex((l) => l.id === selected.id) : -1;
  const siguienteId = selected ? nextLeccionId(curso.lecciones, selected.id) : null;
  const done = curso.lecciones.filter((l) => l.completed).length;
  const percent = progressPercent(done, curso.lecciones.length);
  const isPreview = curso.status !== "publicado";
  const quizLessons = curso.lecciones.filter((l) => l.quiz !== null);
  const nota = notaCurso(
    curso.lecciones,
    new Map(
      Object.entries(cuestionarios).flatMap(([id, e]) => (e.bestScore !== null ? [[id, e.bestScore] as const] : [])),
    ),
  );

  function select(id: string) {
    setError(null);
    setSelectedId(id);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
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
      if (next) select(next);
      router.refresh();
    });
  }

  // "Siguiente clase" also records a plain lesson as seen, like moving on in
  // a video course; a quiz lesson is only completed by its quiz.
  function goNext() {
    if (!selected || !siguienteId) return;
    if (!selected.quiz && !selected.completed && !isPreview) markSeen();
    else select(siguienteId);
  }

  const quizPendiente = selected?.quiz && !selected.completed && !isPreview;

  return (
    <div className="flex min-h-full flex-col">
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-5">
          {selected && hasVideo(selected) && <LeccionVideo leccion={selected} />}

          {selected ? (
            <section aria-labelledby="leccion-title" className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
                  Clase {selectedIndex + 1} de {curso.lecciones.length}
                </p>
                <h2 id="leccion-title" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {selected.title}
                </h2>
              </div>
              {isPreview && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  Vista previa: este curso no está publicado, así que no se registra avance.
                </p>
              )}
              <LeccionContent leccion={selected} />
              {selected.quiz ? (
                <div id="cuestionario" className="scroll-mt-6 space-y-3 border-t pt-4">
                  {selected.completed && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      Lección completada
                    </span>
                  )}
                  <CuestionarioPanel
                    key={selected.id}
                    cursoId={curso.id}
                    leccionId={selected.id}
                    quiz={selected.quiz}
                    settings={curso.evaluacion}
                    estado={cuestionarios[selected.id]}
                    cursoCompletado={curso.completedAt !== null}
                    isPreview={isPreview}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                  {selected.completed ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      Lección vista
                    </span>
                  ) : (
                    !isPreview && (
                      <Button variant="outline" onClick={markSeen} disabled={isPending}>
                        Marcar como vista
                      </Button>
                    )
                  )}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              )}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Este curso todavía no tiene lecciones.</p>
          )}
        </div>

        <aside
          id="clases"
          aria-label="Clases del curso"
          className="scroll-mt-6 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
        >
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <Link href="/aprendizaje" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              Volver al catálogo
            </Link>
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-[#04B1AF] uppercase">{CATEGORY_LABELS[curso.category]}</p>
              <h1 className="text-lg leading-snug font-bold text-foreground">{curso.title}</h1>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {done} de {curso.lecciones.length} lecciones vistas
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
              </div>
            </div>
            {curso.completedAt && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                <PartyPopper className="size-4" />
                ¡Completaste este curso!
              </p>
            )}
          </div>

          {quizLessons.length > 0 && !isPreview && (
            <NotaCursoCard
              nota={nota}
              passingScore={curso.evaluacion.passingScore}
              completado={curso.completedAt !== null}
              pendientes={quizLessons.filter((l) => !l.completed).length}
            />
          )}

          <nav aria-label="Clases" className="rounded-xl border bg-card p-2 shadow-sm">
            <p className="px-2 pt-1 pb-2 text-sm font-semibold">Clases</p>
            <ol className="space-y-0.5">
              {curso.lecciones.map((l, i) => {
                const current = l.id === selected?.id;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => select(l.id)}
                      aria-current={current ? "true" : undefined}
                      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                        current ? "bg-[#04B1AF]/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {l.completed ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : current ? (
                        <PlayCircle className="mt-0.5 size-4 shrink-0 text-[#04B1AF]" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block">
                          {i + 1}. {l.title}
                        </span>
                        {l.quiz && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <ClipboardCheck className="size-3.5" />
                            Cuestionario · {l.quiz.weight}%
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      </div>

      {selected && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-8 -mb-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 lg:-mx-8 lg:-mb-8 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{selected.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                Clase {selectedIndex + 1} de {curso.lecciones.length} · {curso.title}
              </p>
            </div>
            <a
              href="#clases"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted lg:hidden"
            >
              <ListOrdered className="size-4" />
              Clases
            </a>
            {quizPendiente ? (
              <a
                href="#cuestionario"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#036E6C] px-4 text-sm font-semibold text-white hover:bg-[#024E4D]"
              >
                <ClipboardCheck className="size-4" />
                Ir al cuestionario
              </a>
            ) : (
              siguienteId && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={isPending}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#036E6C] px-4 text-sm font-semibold text-white hover:bg-[#024E4D] disabled:opacity-60"
                >
                  Siguiente clase
                  <ArrowRight className="size-4" />
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
