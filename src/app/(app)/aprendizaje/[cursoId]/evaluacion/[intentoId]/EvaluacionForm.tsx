"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntentoDetail } from "@/lib/aprendizaje/evaluacion";
import { enviarIntento } from "../../../actions";

interface Resultado {
  score: number;
  correct: number | null;
  total: number | null;
  notaCurso: number | null;
  cursoCompletado: boolean;
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
    intento.submitted
      ? { score: intento.score ?? 0, correct: null, total: null, notaCurso: null, cursoCompletado: false }
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = intento.preguntas.length;
  const answered = intento.preguntas.filter((p) => answers[p.id]).length;
  const volverHref = intento.leccionId ? `/aprendizaje/${cursoId}?leccion=${intento.leccionId}` : `/aprendizaje/${cursoId}`;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await enviarIntento(intento.id, cursoId, answers);
      if (result.error || !result.resultado) {
        setError(result.error ?? "No se pudo enviar el cuestionario.");
        return;
      }
      setResultado(result.resultado);
      router.refresh();
    });
  }

  if (resultado) {
    return (
      <section className="space-y-3 rounded-xl border bg-card p-6 text-center shadow-sm">
        {resultado.cursoCompletado ? (
          <PartyPopper className="mx-auto size-12 text-emerald-600" />
        ) : (
          <ClipboardCheck className="mx-auto size-12 text-[#036E6C] dark:text-[#5FD6D4]" />
        )}
        <p className="text-sm text-muted-foreground">Tu nota en esta lección</p>
        <p className="text-4xl font-bold tabular-nums">{resultado.score}%</p>
        {resultado.correct !== null && (
          <p className="text-sm text-muted-foreground">
            {resultado.correct} de {resultado.total} respuestas correctas
          </p>
        )}
        {resultado.notaCurso !== null && (
          <p className="text-base">
            Nota del curso: <span className="font-semibold tabular-nums">{resultado.notaCurso}%</span> · mínima{" "}
            {passingScore}%
          </p>
        )}
        {resultado.cursoCompletado && <p className="text-lg font-semibold">¡Completaste el curso!</p>}
        <Link
          href={volverHref}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Volver a la lección
        </Link>
      </section>
    );
  }

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Este cuestionario no tiene preguntas disponibles.</p>;
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
