"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, PartyPopper, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntentoDetail, PreguntaIntento } from "@/lib/aprendizaje/evaluacion";
import { enviarIntento } from "../../../actions";

interface Resultado {
  score: number;
  correct: number | null;
  total: number | null;
  notaCurso: number | null;
  cursoCompletado: boolean;
}

type Fase = "intro" | "pregunta" | "enviando" | "resultado";

function formatSeconds(total: number): string {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One question on screen. Keyed by question in the parent, so its countdown
 * starts fresh for each one. When time runs out it reports "no answer" once.
 */
function PreguntaPaso({
  pregunta,
  numero,
  total,
  seconds,
  onAnswer,
}: {
  pregunta: PreguntaIntento;
  numero: number;
  total: number;
  seconds: number | null;
  onAnswer: (optionId: string | null) => void;
}) {
  const [left, setLeft] = useState(seconds ?? 0);
  const answered = useRef(false);

  function answer(optionId: string | null) {
    if (answered.current) return;
    answered.current = true;
    onAnswer(optionId);
  }

  useEffect(() => {
    if (!seconds) return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  useEffect(() => {
    if (seconds && left <= 0 && !answered.current) {
      answered.current = true;
      onAnswer(null);
    }
  }, [left, seconds, onAnswer]);

  const urgent = seconds !== null && left <= 5;

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-muted-foreground">
            Pregunta {numero} de {total}
          </span>
          {seconds !== null && (
            <span
              role="timer"
              aria-label="Tiempo restante"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold tabular-nums ${
                urgent ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-muted text-foreground"
              }`}
            >
              <Timer className="size-4" />
              {formatSeconds(left)}
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${((numero - 1) / total) * 100}%` }} />
        </div>
      </div>

      <h2 className="text-xl leading-snug font-semibold sm:text-2xl">{pregunta.text}</h2>

      <div className="grid gap-3">
        {pregunta.options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => answer(o.id)}
            className="flex min-h-12 w-full items-center rounded-xl border-2 px-4 py-3 text-left text-base font-medium transition-colors hover:border-[#04B1AF] hover:bg-[#04B1AF]/5 focus-visible:border-[#04B1AF] focus-visible:outline-none"
          >
            {o.text}
          </button>
        ))}
      </div>
    </section>
  );
}

export function EvaluacionForm({
  cursoId,
  intento,
  passingScore,
  siguienteLeccionId,
}: {
  cursoId: string;
  intento: IntentoDetail;
  passingScore: number;
  /** Lesson to offer after the result, if there is one. */
  siguienteLeccionId: string | null;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>(intento.submitted ? "resultado" : "intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(
    intento.submitted
      ? { score: intento.score ?? 0, correct: null, total: null, notaCurso: null, cursoCompletado: false }
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const total = intento.preguntas.length;
  const tiempos = intento.preguntas.flatMap((p) => (p.seconds ? [p.seconds] : []));
  const volverHref = intento.leccionId ? `/aprendizaje/${cursoId}?leccion=${intento.leccionId}` : `/aprendizaje/${cursoId}`;

  function submit(finalAnswers: Record<string, string>) {
    setFase("enviando");
    setError(null);
    startTransition(async () => {
      const result = await enviarIntento(intento.id, cursoId, finalAnswers);
      if (result.error || !result.resultado) {
        setError(result.error ?? "No se pudo enviar el cuestionario.");
        setFase("resultado");
        return;
      }
      setResultado(result.resultado);
      setFase("resultado");
      router.refresh();
    });
  }

  function handleAnswer(optionId: string | null) {
    const pregunta = intento.preguntas[index];
    const next = optionId ? { ...answers, [pregunta.id]: optionId } : answers;
    setAnswers(next);
    if (index + 1 < total) setIndex(index + 1);
    else submit(next);
  }

  if (fase === "intro") {
    return (
      <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <ClipboardCheck className="size-10 text-[#036E6C] dark:text-[#5FD6D4]" />
        <ul className="space-y-1.5 text-base">
          <li className="font-semibold">{`${total} ${total === 1 ? "pregunta" : "preguntas"}, una a la vez.`}</li>
          <li>
            {tiempos.length === 0
              ? "Sin límite de tiempo."
              : `${tiempos.length === total && new Set(tiempos).size === 1 ? `${tiempos[0]} segundos por pregunta` : "Algunas preguntas tienen tiempo límite"}: si se acaba el tiempo, cuenta como no respondida y pasa a la siguiente.`}
          </li>
          <li>No podrás volver a una pregunta anterior.</li>
        </ul>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Este cuestionario no tiene preguntas disponibles.</p>
        ) : (
          <Button size="lg" onClick={() => setFase("pregunta")}>
            Comenzar
          </Button>
        )}
      </section>
    );
  }

  if (fase === "pregunta") {
    const pregunta = intento.preguntas[index];
    return (
      <PreguntaPaso
        key={pregunta.id}
        pregunta={pregunta}
        numero={index + 1}
        total={total}
        seconds={pregunta.seconds ?? null}
        onAnswer={handleAnswer}
      />
    );
  }

  if (fase === "enviando") {
    return <p className="py-10 text-center text-muted-foreground">Enviando tus respuestas…</p>;
  }

  if (!resultado) {
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <p className="text-sm text-destructive">{error}</p>
        <Link href={volverHref} className="text-sm text-[#036E6C] underline">
          Volver a la lección
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
      {resultado.cursoCompletado ? (
        <PartyPopper className="mx-auto size-12 text-emerald-600" />
      ) : (
        <ClipboardCheck className="mx-auto size-12 text-[#036E6C] dark:text-[#5FD6D4]" />
      )}
      <p className="text-sm text-muted-foreground">Tu nota en esta lección</p>
      <p className="text-5xl font-bold tabular-nums">{resultado.score}%</p>
      {resultado.correct !== null && (
        <p className="text-sm text-muted-foreground">
          {resultado.correct} de {resultado.total} respuestas correctas
        </p>
      )}
      {resultado.notaCurso !== null && (
        <p className="text-base">
          Nota del curso: <span className="font-semibold tabular-nums">{resultado.notaCurso}%</span> · mínima {passingScore}%
        </p>
      )}
      {resultado.cursoCompletado && <p className="text-lg font-semibold">¡Completaste el curso!</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Link
          href={volverHref}
          className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
        >
          Volver a la lección
        </Link>
        {siguienteLeccionId && (
          <Link
            href={`/aprendizaje/${cursoId}?leccion=${siguienteLeccionId}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#036E6C] px-4 text-sm font-semibold text-white hover:bg-[#024E4D]"
          >
            Siguiente clase
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
