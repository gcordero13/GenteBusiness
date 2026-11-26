"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntentoDetail } from "@/lib/aprendizaje/evaluacion";
import { enviarIntento } from "../../../actions";

interface Resultado {
  score: number;
  passed: boolean;
  correct: number | null;
  total: number | null;
}

export function EvaluacionForm({
  cursoId,
  intento,
  passingScore,
}: {
  cursoId: string;
  intento: IntentoDetail;
  passingScore: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(
    intento.submitted ? { score: intento.score ?? 0, passed: Boolean(intento.passed), correct: null, total: null } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = intento.preguntas.length;
  const answered = intento.preguntas.filter((p) => answers[p.id]).length;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await enviarIntento(intento.id, cursoId, answers);
      if (result.error || !result.resultado) {
        setError(result.error ?? "No se pudo enviar la evaluación.");
        return;
      }
      setResultado(result.resultado);
      router.refresh();
    });
  }

  if (resultado) {
    return (
      <section className="space-y-3 rounded-xl border bg-card p-6 text-center shadow-sm">
        {resultado.passed ? (
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        ) : (
          <XCircle className="mx-auto size-12 text-destructive" />
        )}
        <p className="text-4xl font-bold tabular-nums">{resultado.score}%</p>
        <p className="text-lg font-semibold">{resultado.passed ? "¡Aprobaste!" : "No alcanzaste la nota mínima"}</p>
        <p className="text-sm text-muted-foreground">
          {resultado.correct !== null && `${resultado.correct} de ${resultado.total} respuestas correctas · `}
          nota mínima {passingScore}%
        </p>
        <Link
          href={`/aprendizaje/${cursoId}`}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Volver al curso
        </Link>
      </section>
    );
  }

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Esta evaluación no tiene preguntas disponibles.</p>;
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {intento.preguntas.map((p, i) => (
          <li key={p.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <p className="font-medium">
              {i + 1}. {p.text}
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Pregunta {i + 1}</legend>
              {p.options.map((o) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    answers[p.id] === o.id ? "border-[#04B1AF] bg-[#04B1AF]/5" : "hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name={`pregunta-${p.id}`}
                    value={o.id}
                    checked={answers[p.id] === o.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [p.id]: o.id }))}
                    className="accent-[#04B1AF]"
                  />
                  {o.text}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending || answered < total}>
          Enviar respuestas
        </Button>
        <span className="text-sm text-muted-foreground">
          {answered} de {total} respondidas
        </span>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
