"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pesoTotal, validateEvalSettings } from "@/lib/aprendizaje/evaluacion";
import type { EvalSettings, Leccion } from "@/lib/aprendizaje/types";
import { updateEvalSettings } from "../actions";

/**
 * Course-wide evaluation rules (minimum grade, attempts per quiz) and the
 * weights of each lesson quiz, which must add up to 100% to publish.
 */
export function EvaluacionEditor({
  cursoId,
  settings,
  lecciones,
}: {
  cursoId: string;
  settings: EvalSettings;
  lecciones: Leccion[];
}) {
  const router = useRouter();
  const [passing, setPassing] = useState(String(settings.passingScore));
  const [maxAttempts, setMaxAttempts] = useState(settings.maxAttempts === null ? "" : String(settings.maxAttempts));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const conQuiz = lecciones.filter((l) => l.quiz !== null);
  const total = pesoTotal(conQuiz);

  function save() {
    const next: EvalSettings = {
      passingScore: Number(passing),
      maxAttempts: maxAttempts.trim() ? Number(maxAttempts) : null,
    };
    const invalid = validateEvalSettings(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateEvalSettings(cursoId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Configuración guardada.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Evaluación del curso</h2>
        <p className="text-sm text-muted-foreground">
          Cada lección puede tener su cuestionario (se configura dentro de la lección). La nota del curso es la suma de
          cada cuestionario por su peso, y el curso se completa al alcanzar la nota mínima.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="eval-passing">Nota mínima para aprobar el curso (%)</Label>
          <Input id="eval-passing" type="number" min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eval-max-attempts">Intentos por cuestionario</Label>
          <Input
            id="eval-max-attempts"
            type="number"
            min={1}
            placeholder="Ilimitados"
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e.target.value)}
          />
        </div>
      </div>
      <Button onClick={save} disabled={isPending}>
        Guardar configuración
      </Button>

      <div className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">Pesos de los cuestionarios</h3>
        {conQuiz.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna lección tiene cuestionario todavía: el curso se completa viendo todas las lecciones.
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {conQuiz.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 border-b border-dashed py-1">
                  <span className="min-w-0 truncate">{l.title}</span>
                  <span className="font-semibold tabular-nums">{l.quiz?.weight}%</span>
                </li>
              ))}
            </ul>
            <p
              className={`flex justify-between text-sm font-semibold ${
                total === 100 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"
              }`}
            >
              <span>Total</span>
              <span className="tabular-nums">{total}% de 100%</span>
            </p>
            {total !== 100 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Los pesos deben sumar exactamente 100% para poder publicar el curso.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
