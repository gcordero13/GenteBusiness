import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardCheck, PartyPopper, PlayCircle } from "lucide-react";
import { firstPendingLeccionId, progressPercent, resumenLeccion } from "@/lib/aprendizaje/mapCurso";
import { notaCurso, type EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import { archivoUrl, CATEGORY_LABELS, type CursoDetail } from "@/lib/aprendizaje/types";
import { CertificadoPreviewDialog } from "../CertificadoPreviewDialog";
import { hasVideo } from "./LeccionContent";
import { NotaCursoCard } from "./NotaCursoCard";

/**
 * The course's starting view, before any video: what it's about, the
 * course grade, and every class with a short summary. Opening a class (or
 * "Comenzar"/"Continuar") goes to the player at ?leccion=<id>.
 */
export function CursoPortada({
  curso,
  cuestionarios = {},
}: {
  curso: CursoDetail;
  cuestionarios?: Record<string, EvaluacionEstado>;
}) {
  const total = curso.lecciones.length;
  const done = curso.lecciones.filter((l) => l.completed).length;
  const percent = progressPercent(done, total);
  const isPreview = curso.status !== "publicado";
  const quizLessons = curso.lecciones.filter((l) => l.quiz !== null);
  const pendingId = firstPendingLeccionId(curso.lecciones);
  const pendingIndex = curso.lecciones.findIndex((l) => l.id === pendingId);
  const claseHref = (id: string) => `/aprendizaje/${curso.id}?leccion=${id}`;
  const nota = notaCurso(
    curso.lecciones,
    new Map(
      Object.entries(cuestionarios).flatMap(([id, e]) => (e.bestScore !== null ? [[id, e.bestScore] as const] : [])),
    ),
  );
  const ctaLabel = curso.completedAt
    ? "Repasar el curso"
    : done === 0
      ? "Comenzar curso"
      : `Continuar: Clase ${pendingIndex + 1}`;

  return (
    <div className="w-full space-y-6">
      <Link href="/aprendizaje" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Volver al catálogo
      </Link>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid lg:grid-cols-2">
        {/* The whole cover, never cropped: it keeps its own proportions and
            the cell's background fills any leftover space. */}
        <div className="flex items-center justify-center bg-gradient-to-br from-[#0B2545] to-[#036E6C]">
          {curso.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
            <img src={archivoUrl(curso.cover)} alt={`Portada de ${curso.title}`} className="block h-auto w-full" />
          ) : (
            <div className="aspect-video w-full" />
          )}
        </div>
        <div className="flex flex-col justify-center space-y-4 p-5 sm:p-8">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-[#04B1AF] uppercase">{CATEGORY_LABELS[curso.category]}</p>
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">{curso.title}</h1>
            {curso.description && <p className="text-sm leading-relaxed text-muted-foreground">{curso.description}</p>}
          </div>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "clase" : "clases"}
            {quizLessons.length > 0 &&
              ` · ${quizLessons.length} ${quizLessons.length === 1 ? "cuestionario" : "cuestionarios"}`}
          </p>
          {!isPreview && total > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {done} de {total} clases vistas · {percent}%
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
          {isPreview && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              Vista previa: este curso no está publicado, así que no se registra avance.
            </p>
          )}
          {curso.completedAt && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="flex items-center gap-2">
                <PartyPopper className="size-4" />
                ¡Completaste este curso!
              </span>
              {!isPreview && (
                <CertificadoPreviewDialog
                  cursoId={curso.id}
                  cursoTitle={curso.title}
                  triggerClassName="inline-flex items-center gap-1.5 font-semibold text-[#036E6C] underline underline-offset-2 hover:text-[#024E4D] dark:text-[#5FD6D4]"
                />
              )}
            </div>
          )}
          {pendingId && (
            <Link
              href={claseHref(pendingId)}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#036E6C] px-5 text-sm font-semibold text-white hover:bg-[#024E4D]"
            >
              <PlayCircle className="size-5" />
              {ctaLabel}
            </Link>
          )}
        </div>
      </section>

      {quizLessons.length > 0 && !isPreview && (
        <NotaCursoCard
          nota={nota}
          passingScore={curso.evaluacion.passingScore}
          completado={curso.completedAt !== null}
          pendientes={quizLessons.filter((l) => !l.completed).length}
        />
      )}

      <section aria-labelledby="contenido-title" className="space-y-3">
        <h2 id="contenido-title" className="text-lg font-semibold">
          Contenido del curso
        </h2>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Este curso todavía no tiene clases.</p>
        ) : (
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {curso.lecciones.map((l, i) => {
              const resumen = resumenLeccion(l.body);
              const score = cuestionarios[l.id]?.bestScore ?? null;
              return (
                <li key={l.id}>
                  <Link href={claseHref(l.id)} className="flex items-start gap-4 p-4 hover:bg-muted/50">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        l.completed
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-[#04B1AF]/10 text-[#036E6C] dark:text-[#5FD6D4]"
                      }`}
                    >
                      {l.completed ? <CheckCircle2 className="size-5" aria-label="Vista" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-semibold text-foreground">{l.title}</span>
                      {resumen && <span className="block text-sm text-muted-foreground">{resumen}</span>}
                      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {hasVideo(l) && (
                          <span className="inline-flex items-center gap-1">
                            <PlayCircle className="size-3.5" />
                            Video
                          </span>
                        )}
                        {l.quiz && (
                          <span className="inline-flex items-center gap-1">
                            <ClipboardCheck className="size-3.5" />
                            Cuestionario · {l.quiz.weight}%{score !== null && ` · tu nota ${score}%`}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
