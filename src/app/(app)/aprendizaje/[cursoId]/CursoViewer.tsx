"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ClipboardCheck, Flag, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstPendingLeccionId, nextLeccionId, prevLeccionId, progressPercent } from "@/lib/aprendizaje/mapCurso";
import { quizDisponibilidad, summarizeIntentos, type EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import type { CursoDetail } from "@/lib/aprendizaje/types";
import { iniciarCuestionario, marcarLeccionVista } from "../actions";
import { CuestionarioPanel } from "./CuestionarioPanel";
import { hasVideo, LeccionContent, LeccionVideo } from "./LeccionContent";

const PRIMARY_BUTTON =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[#036E6C] px-4 text-sm font-semibold text-white hover:bg-[#024E4D] disabled:opacity-60 sm:px-5";
const SECONDARY_BUTTON =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:px-4";

/**
 * Course player: the class video at the very top, its content below, the
 * class list on the side, and a bottom bar with Anterior / Siguiente (or
 * "Responder cuestionario" when the class has a pending quiz). The course
 * grade lives on the course's starting view (CursoPortada), not here.
 */
export function CursoViewer({
  curso,
  cuestionarios = {},
  initialLeccionId,
}: {
  curso: CursoDetail;
  /** The person's attempts on each lesson quiz, keyed by lesson id. */
  cuestionarios?: Record<string, EvaluacionEstado>;
  /** The class to open (from ?leccion=). */
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

  const total = curso.lecciones.length;
  const selected = curso.lecciones.find((l) => l.id === selectedId) ?? curso.lecciones[0] ?? null;
  const selectedIndex = selected ? curso.lecciones.findIndex((l) => l.id === selected.id) : -1;
  const siguienteId = selected ? nextLeccionId(curso.lecciones, selected.id) : null;
  const anteriorId = selected ? prevLeccionId(curso.lecciones, selected.id) : null;
  const done = curso.lecciones.filter((l) => l.completed).length;
  const percent = progressPercent(done, total);
  const isPreview = curso.status !== "publicado";
  const portadaHref = `/aprendizaje/${curso.id}`;

  const estadoQuiz = selected ? (cuestionarios[selected.id] ?? summarizeIntentos([])) : null;
  const quizPendiente =
    selected?.quiz &&
    !selected.completed &&
    !isPreview &&
    estadoQuiz !== null &&
    quizDisponibilidad(curso.evaluacion, estadoQuiz).canStart;

  function select(id: string) {
    setError(null);
    setSelectedId(id);
    window.history.replaceState?.(null, "", `${portadaHref}?leccion=${id}`);
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

  // "Siguiente" also records a plain class as seen, like moving on in a
  // video course; a quiz class is only completed by its quiz.
  function goNext() {
    if (!selected || !siguienteId) return;
    if (!selected.quiz && !selected.completed && !isPreview) markSeen();
    else select(siguienteId);
  }

  // Last class: record it as seen (if it's a plain one) and go back to the course view.
  function finish() {
    if (!selected) return;
    if (selected.quiz || selected.completed || isPreview) {
      router.push(portadaHref);
      return;
    }
    const current = selected.id;
    setError(null);
    startTransition(async () => {
      const result = await marcarLeccionVista(current, curso.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(portadaHref);
      router.refresh();
    });
  }

  function startQuiz() {
    if (!selected) return;
    const leccionId = selected.id;
    setError(null);
    startTransition(async () => {
      const result = await iniciarCuestionario(leccionId, curso.id);
      if (result.error || !result.intentoId) {
        setError(result.error ?? "No se pudo iniciar el cuestionario.");
        return;
      }
      router.push(`/aprendizaje/${curso.id}/evaluacion/${result.intentoId}`);
    });
  }

  if (!selected) {
    return <p className="text-sm text-muted-foreground">Este curso todavía no tiene clases.</p>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {hasVideo(selected) && <LeccionVideo leccion={selected} />}

          <section aria-labelledby="leccion-title" className="mx-auto w-full max-w-4xl space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
                Clase {selectedIndex + 1} de {total}
              </p>
              <h1 id="leccion-title" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {selected.title}
              </h1>
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
                    Clase completada
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
                    Clase vista
                  </span>
                ) : (
                  !isPreview && (
                    <Button variant="outline" onClick={markSeen} disabled={isPending}>
                      Marcar como vista
                    </Button>
                  )
                )}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </section>
        </div>

        <aside
          id="clases"
          aria-label="Clases del curso"
          className="space-y-3 rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
        >
          <div className="space-y-2 px-1 pt-1">
            <Link href={portadaHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              Vista del curso
            </Link>
            <p className="leading-snug font-semibold text-foreground">{curso.title}</p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {done} de {total} clases vistas
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
          <nav aria-label="Clases">
            <ol className="space-y-0.5">
              {curso.lecciones.map((l, i) => {
                const current = l.id === selected.id;
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

      <nav
        aria-label="Anterior y siguiente"
        className="sticky bottom-0 z-10 -mx-4 mt-8 -mb-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 lg:-mx-8 lg:-mb-8 lg:px-8"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => anteriorId && select(anteriorId)}
            disabled={!anteriorId || isPending}
            aria-label="Anterior"
            className={SECONDARY_BUTTON}
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold text-foreground">{selected.title}</p>
            <div className="mx-auto mt-1 flex max-w-xs items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#04B1AF]"
                  style={{ width: `${((selectedIndex + 1) / total) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                Clase {selectedIndex + 1} de {total}
              </span>
            </div>
          </div>

          {quizPendiente ? (
            <button
              type="button"
              onClick={startQuiz}
              disabled={isPending}
              aria-label="Responder cuestionario de esta clase"
              className={PRIMARY_BUTTON}
            >
              <ClipboardCheck className="size-4" />
              <span className="hidden sm:inline">Responder cuestionario</span>
              <span className="sm:hidden">Cuestionario</span>
            </button>
          ) : siguienteId ? (
            <button type="button" onClick={goNext} disabled={isPending} className={PRIMARY_BUTTON}>
              Siguiente
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button type="button" onClick={finish} disabled={isPending} className={PRIMARY_BUTTON}>
              <Flag className="size-4" />
              Terminar
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
