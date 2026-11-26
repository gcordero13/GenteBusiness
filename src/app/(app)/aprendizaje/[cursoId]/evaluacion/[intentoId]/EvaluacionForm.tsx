"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ClipboardCheck, PartyPopper, Sparkles, Timer, Trophy } from "lucide-react";
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

const LETRAS = "ABCDEFGH";
const AUTO_AVANCE_SEGUNDOS = 8;

function formatSeconds(total: number): string {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** One segment per question: done, current, upcoming. */
function PasosBar({ total, actual }: { total: number; actual: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-full transition-colors duration-500 ${
            i < actual ? "bg-[#04B1AF]" : i === actual ? "bg-[#04B1AF]/40" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * One question on screen. Keyed by question in the parent, so its countdown
 * starts fresh for each one. Picking an option highlights it briefly before
 * moving on; when time runs out it reports "no answer" once.
 */
function PreguntaPaso({
  pregunta,
  numero,
  total,
  seconds,
  advanceDelayMs,
  onAnswer,
}: {
  pregunta: PreguntaIntento;
  numero: number;
  total: number;
  seconds: number | null;
  advanceDelayMs: number;
  onAnswer: (optionId: string | null) => void;
}) {
  const [left, setLeft] = useState(seconds ?? 0);
  const [chosen, setChosen] = useState<string | null>(null);
  const answered = useRef(false);

  function choose(optionId: string) {
    if (answered.current) return;
    answered.current = true;
    setChosen(optionId);
    setTimeout(() => onAnswer(optionId), advanceDelayMs);
  }

  useEffect(() => {
    if (!seconds || chosen) return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [seconds, chosen]);

  useEffect(() => {
    if (seconds && left <= 0 && !answered.current) {
      answered.current = true;
      onAnswer(null);
    }
  }, [left, seconds, onAnswer]);

  const urgent = seconds !== null && left <= 5;

  return (
    <section className="space-y-6 rounded-3xl border bg-card p-5 shadow-md sm:p-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#036E6C] dark:text-[#5FD6D4]">
            Pregunta {numero} de {total}
          </span>
          {seconds !== null && (
            <span
              role="timer"
              aria-label="Tiempo restante"
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-base font-bold tabular-nums transition-colors ${
                urgent
                  ? "animate-pulse bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "bg-[#04B1AF]/10 text-[#036E6C] dark:text-[#5FD6D4]"
              }`}
            >
              <Timer className="size-5" />
              {formatSeconds(left)}
            </span>
          )}
        </div>
        <PasosBar total={total} actual={numero - 1} />
      </div>

      <div key={pregunta.id} className="animate-in space-y-6 duration-300 fade-in-0 slide-in-from-right-6">
        <h2 className="text-2xl leading-snug font-bold text-foreground sm:text-3xl">{pregunta.text}</h2>

        <div className="grid gap-3">
          {pregunta.options.map((o, i) => {
            const isChosen = chosen === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                disabled={chosen !== null}
                className={`group flex min-h-16 w-full items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left text-lg font-medium transition-all duration-200 sm:px-5 ${
                  isChosen
                    ? "scale-[1.02] border-[#04B1AF] bg-[#04B1AF]/10 shadow-md"
                    : chosen
                      ? "opacity-40"
                      : "hover:-translate-y-0.5 hover:border-[#04B1AF] hover:bg-[#04B1AF]/5 hover:shadow-md active:scale-[0.99]"
                } focus-visible:border-[#04B1AF] focus-visible:outline-none`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-colors ${
                    isChosen
                      ? "bg-[#04B1AF] text-white"
                      : "bg-muted text-muted-foreground group-hover:bg-[#04B1AF]/15 group-hover:text-[#036E6C]"
                  }`}
                >
                  {isChosen ? <Check className="size-5" /> : LETRAS[i]}
                </span>
                <span className="min-w-0 flex-1">{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** "Pasando a la siguiente clase en 8 s…" with a way to stay on the result. */
function AutoAvance({ href, seconds }: { href: string; seconds: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const pushed = useRef(false);

  // One interval for the whole countdown, so re-renders don't restart it.
  useEffect(() => {
    if (cancelled) return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [cancelled]);

  useEffect(() => {
    if (cancelled || left > 0 || pushed.current) return;
    pushed.current = true;
    router.push(href);
  }, [left, cancelled, href, router]);

  if (cancelled) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Pasando a la siguiente clase en <span className="font-semibold tabular-nums">{left}</span> s ·{" "}
      <button
        type="button"
        onClick={() => setCancelled(true)}
        className="font-medium text-[#036E6C] underline dark:text-[#5FD6D4]"
      >
        Quedarme aquí
      </button>
    </p>
  );
}

export function EvaluacionForm({
  cursoId,
  intento,
  passingScore,
  siguienteLeccionId,
  advanceDelayMs = 550,
  autoAvanceSegundos = AUTO_AVANCE_SEGUNDOS,
}: {
  cursoId: string;
  intento: IntentoDetail;
  passingScore: number;
  /** Lesson to offer after the result, if there is one. */
  siguienteLeccionId: string | null;
  /** Pause after picking an option so the choice is seen (tests pass 0). */
  advanceDelayMs?: number;
  /** Countdown before moving to the next class after submitting. */
  autoAvanceSegundos?: number;
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
  const [recienEnviado, setRecienEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const total = intento.preguntas.length;
  const tiempos = intento.preguntas.flatMap((p) => (p.seconds ? [p.seconds] : []));
  const volverHref = intento.leccionId ? `/aprendizaje/${cursoId}?leccion=${intento.leccionId}` : `/aprendizaje/${cursoId}`;
  const siguienteHref = siguienteLeccionId ? `/aprendizaje/${cursoId}?leccion=${siguienteLeccionId}` : null;

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
      setRecienEnviado(true);
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
      <section className="space-y-6 rounded-3xl border bg-card p-6 text-center shadow-md sm:p-10">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#04B1AF]/10">
          <ClipboardCheck className="size-9 text-[#036E6C] dark:text-[#5FD6D4]" />
        </span>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold sm:text-3xl">¿Listo para el cuestionario?</h2>
          <ul className="mx-auto max-w-md space-y-1.5 text-base text-muted-foreground">
            <li className="font-semibold text-foreground">{`${total} ${total === 1 ? "pregunta" : "preguntas"}, una a la vez.`}</li>
            <li>
              {tiempos.length === 0
                ? "Sin límite de tiempo."
                : `${tiempos.length === total && new Set(tiempos).size === 1 ? `${tiempos[0]} segundos por pregunta` : "Algunas preguntas tienen tiempo límite"}: si se acaba el tiempo, cuenta como no respondida y pasa a la siguiente.`}
            </li>
            <li>No podrás volver a una pregunta anterior.</li>
          </ul>
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Este cuestionario no tiene preguntas disponibles.</p>
        ) : (
          <Button size="lg" className="h-12 px-8 text-base" onClick={() => setFase("pregunta")}>
            Comenzar
            <ArrowRight data-icon="inline-end" />
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
        advanceDelayMs={advanceDelayMs}
        onAnswer={handleAnswer}
      />
    );
  }

  if (fase === "enviando") {
    return (
      <section className="space-y-4 rounded-3xl border bg-card p-10 text-center shadow-md">
        <PasosBar total={total} actual={total} />
        <p className="text-lg text-muted-foreground">Calificando tus respuestas…</p>
      </section>
    );
  }

  if (!resultado) {
    return (
      <section className="space-y-3 rounded-3xl border bg-card p-6 text-center shadow-md">
        <p className="text-sm text-destructive">{error}</p>
        <Link href={volverHref} className="text-sm text-[#036E6C] underline">
          Volver a la clase
        </Link>
      </section>
    );
  }

  const aprobado = resultado.score >= passingScore;
  const titulo = resultado.cursoCompletado
    ? "¡Felicidades, completaste el curso!"
    : aprobado
      ? "¡Excelente trabajo!"
      : "¡Terminaste el cuestionario!";

  return (
    <section className="animate-in space-y-5 rounded-3xl border bg-card p-6 text-center shadow-md duration-500 fade-in-0 zoom-in-95 sm:p-10">
      <span
        className={`mx-auto flex size-20 items-center justify-center rounded-full ${
          aprobado || resultado.cursoCompletado
            ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
            : "bg-[#04B1AF]/10 text-[#036E6C] dark:text-[#5FD6D4]"
        }`}
      >
        {resultado.cursoCompletado ? (
          <PartyPopper className="size-10" />
        ) : aprobado ? (
          <Trophy className="size-10" />
        ) : (
          <Sparkles className="size-10" />
        )}
      </span>
      <div className="space-y-1">
        <h2 className="text-2xl font-bold sm:text-3xl">{titulo}</h2>
        {!aprobado && !resultado.cursoCompletado && (
          <p className="text-muted-foreground">Repasa la clase y vuelve a intentarlo para mejorar tu nota.</p>
        )}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Tu nota en esta clase</p>
        <p className="text-6xl font-extrabold text-[#036E6C] tabular-nums dark:text-[#5FD6D4]">{resultado.score}%</p>
        {resultado.correct !== null && (
          <p className="text-sm text-muted-foreground">
            {resultado.correct} de {resultado.total} respuestas correctas
          </p>
        )}
      </div>
      {resultado.notaCurso !== null && (
        <p className="text-base">
          Nota del curso: <span className="font-semibold tabular-nums">{resultado.notaCurso}%</span> · mínima {passingScore}%
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse items-center justify-center gap-2 pt-2 sm:flex-row">
        <Link href={volverHref} className="inline-flex h-11 items-center rounded-lg border px-5 text-sm font-medium hover:bg-muted">
          Volver a la clase
        </Link>
        <Link
          href={siguienteHref ?? `/aprendizaje/${cursoId}`}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#036E6C] px-6 text-base font-semibold text-white hover:bg-[#024E4D]"
        >
          {siguienteHref ? "Siguiente clase" : "Ver el curso"}
          <ArrowRight className="size-5" />
        </Link>
      </div>
      {siguienteHref && recienEnviado && <AutoAvance href={siguienteHref} seconds={autoAvanceSegundos} />}
    </section>
  );
}
