"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { evaluacionDisponibilidad, type EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import type { EvalSettings } from "@/lib/aprendizaje/types";
import { iniciarIntento } from "../actions";

export function EvaluacionCard({
  cursoId,
  settings,
  estado,
  lessonsDone,
  isPreview,
}: {
  cursoId: string;
  settings: EvalSettings;
  estado: EvaluacionEstado;
  lessonsDone: boolean;
  isPreview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const disponibilidad = evaluacionDisponibilidad(settings, estado, lessonsDone);
  const attempts =
    settings.maxAttempts === null
      ? "intentos ilimitados"
      : `${estado.attemptsUsed} de ${settings.maxAttempts} intentos usados`;

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await iniciarIntento(cursoId);
      if (result.error || !result.intentoId) {
        setError(result.error ?? "No se pudo iniciar la evaluación.");
        return;
      }
      router.push(`/aprendizaje/${cursoId}/evaluacion/${result.intentoId}`);
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5 text-[#04B1AF]" />
        <h2 className="text-lg font-semibold">Evaluación final</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {settings.questionsPerAttempt} preguntas al azar · nota mínima {settings.passingScore}% · {attempts}
      </p>
      {estado.bestScore !== null && (
        <p className="text-sm">
          Tu mejor nota: <span className="font-semibold tabular-nums">{estado.bestScore}%</span>
        </p>
      )}
      {estado.passed ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          Aprobaste la evaluación.
        </p>
      ) : isPreview ? (
        <p className="text-sm text-muted-foreground">La evaluación se habilita cuando el curso esté publicado.</p>
      ) : disponibilidad.canStart ? (
        <Button onClick={start} disabled={isPending}>
          {disponibilidad.label}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{disponibilidad.reason}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
