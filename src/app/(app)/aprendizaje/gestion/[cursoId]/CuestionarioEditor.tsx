"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateQuiz, type PreguntaGestion } from "@/lib/aprendizaje/evaluacion";
import type { LeccionQuiz } from "@/lib/aprendizaje/types";
import { setLeccionQuiz } from "../actions";
import { BancoPreguntas } from "./BancoPreguntas";

/** A lesson's quiz settings (on/off, weight, questions per person) and its question bank. */
export function CuestionarioEditor({
  cursoId,
  leccionId,
  quiz,
  preguntas,
}: {
  cursoId: string;
  leccionId: string;
  quiz: LeccionQuiz | null;
  preguntas: PreguntaGestion[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(quiz !== null);
  const [weight, setWeight] = useState(String(quiz?.weight ?? ""));
  const [perAttempt, setPerAttempt] = useState(String(quiz?.questionsPerAttempt ?? 5));
  const [seconds, setSeconds] = useState(quiz?.secondsPerQuestion ? String(quiz.secondsPerQuestion) : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeCount = preguntas.filter((p) => p.active).length;

  function save() {
    const next: LeccionQuiz | null = enabled
      ? {
          questionsPerAttempt: Number(perAttempt),
          weight: Number(weight),
          secondsPerQuestion: seconds.trim() ? Number(seconds) : null,
        }
      : null;
    const invalid = next ? validateQuiz(next) : null;
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await setLeccionQuiz(leccionId, cursoId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Cuestionario guardado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-[#04B1AF]"
        />
        Esta lección tiene cuestionario
      </label>
      <p className="text-xs text-muted-foreground">
        La lección se completa al responderlo. A cada persona le tocan preguntas al azar del banco, en distinto orden.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {enabled && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`quiz-weight-${leccionId}`}>Peso en la nota del curso (%)</Label>
            <Input
              id={`quiz-weight-${leccionId}`}
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`quiz-per-attempt-${leccionId}`}>Preguntas por persona</Label>
            <Input
              id={`quiz-per-attempt-${leccionId}`}
              type="number"
              min={1}
              value={perAttempt}
              onChange={(e) => setPerAttempt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`quiz-seconds-${leccionId}`}>Segundos por pregunta</Label>
            <Input
              id={`quiz-seconds-${leccionId}`}
              type="number"
              min={5}
              max={600}
              placeholder="Sin límite"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </div>
        </div>
      )}
      {enabled && Number(perAttempt) > activeCount && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          El banco tiene {activeCount} {activeCount === 1 ? "pregunta activa" : "preguntas activas"}: a cada persona le
          tocarán {activeCount === 0 ? "ninguna" : `solo ${activeCount}`} hasta que agregues más.
        </p>
      )}
      <Button size="sm" onClick={save} disabled={isPending}>
        Guardar cuestionario
      </Button>
      {quiz !== null && <BancoPreguntas cursoId={cursoId} leccionId={leccionId} preguntas={preguntas} />}
    </div>
  );
}
