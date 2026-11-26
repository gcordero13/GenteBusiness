"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quizDisponibilidad, summarizeIntentos, type EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import type { EvalSettings, LeccionQuiz } from "@/lib/aprendizaje/types";
import { iniciarCuestionario } from "../actions";

/** The quiz at the end of a lesson: answering it is what completes the lesson. */
export function CuestionarioPanel({
  cursoId,
  leccionId,
  quiz,
  settings,
  estado = summarizeIntentos([]),
  cursoCompletado,
  isPreview,
}: {
  cursoId: string;
  leccionId: string;
  quiz: LeccionQuiz;
  settings: EvalSettings;
  estado?: EvaluacionEstado;
  cursoCompletado: boolean;
  isPreview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const disponibilidad = quizDisponibilidad(settings, estado);

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await iniciarCuestionario(leccionId, cursoId);
      if (result.error || !result.intentoId) {
        setError(result.error ?? "No se pudo iniciar el cuestionario.");
        return;
      }
      router.push(`/aprendizaje/${cursoId}/evaluacion/${result.intentoId}`);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#04B1AF]/30 bg-[#04B1AF]/5 p-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5 text-[#036E6C] dark:text-[#5FD6D4]" />
        <h3 className="font-semibold">Cuestionario de la lección</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {quiz.questionsPerAttempt} {quiz.questionsPerAttempt === 1 ? "pregunta" : "preguntas"} · vale {quiz.weight}% de la
        nota del curso
        {settings.maxAttempts !== null && ` · ${estado.attemptsUsed} de ${settings.maxAttempts} intentos usados`}
      </p>
      {estado.bestScore !== null && (
        <p className="text-sm">
          Tu nota en esta lección: <span className="font-semibold tabular-nums">{estado.bestScore}%</span>
        </p>
      )}
      {cursoCompletado && !isPreview && estado.bestScore === null && (
        <p className="text-sm text-muted-foreground">
          Ya completaste este curso. Responde el cuestionario para registrar tu nota.
        </p>
      )}
      {isPreview ? (
        <p className="text-sm text-muted-foreground">El cuestionario se habilita cuando el curso esté publicado.</p>
      ) : disponibilidad.canStart ? (
        <Button onClick={start} disabled={isPending}>
          {disponibilidad.label}
        </Button>
      ) : (
        disponibilidad.reason && <p className="text-sm text-muted-foreground">{disponibilidad.reason}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
