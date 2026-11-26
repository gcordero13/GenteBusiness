import { Award } from "lucide-react";

/** The weighted course grade against the minimum needed to complete the course. */
export function NotaCursoCard({
  nota,
  passingScore,
  completado,
  pendientes,
}: {
  nota: number;
  passingScore: number;
  completado: boolean;
  /** Quizzes not answered yet. */
  pendientes: number;
}) {
  const mensaje = completado
    ? "Alcanzaste la nota mínima y completaste el curso."
    : pendientes > 0
      ? `Te ${pendientes === 1 ? "falta 1 cuestionario" : `faltan ${pendientes} cuestionarios`} por responder.`
      : nota < passingScore
        ? "No alcanzas la nota mínima todavía: repite algún cuestionario para mejorarla."
        : null;

  return (
    <section aria-label="Nota del curso" className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <Award className="size-6" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm text-muted-foreground">
          Nota del curso · mínima para aprobar {passingScore}%
        </p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold tabular-nums">{nota}%</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${nota >= passingScore ? "bg-emerald-600" : "bg-[#04B1AF]"}`}
              style={{ width: `${Math.min(nota, 100)}%` }}
            />
            <div aria-hidden="true" className="absolute top-0 h-full w-0.5 bg-foreground/60" style={{ left: `${passingScore}%` }} />
          </div>
        </div>
        {mensaje && <p className="text-sm">{mensaje}</p>}
      </div>
    </section>
  );
}
