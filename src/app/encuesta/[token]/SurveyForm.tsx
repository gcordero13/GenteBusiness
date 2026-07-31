"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitSurveyResponse, type SurveyResponseInput } from "./actions";

const RATING_SCALE = [
  { value: 1, emoji: "😞" },
  { value: 2, emoji: "😕" },
  { value: 3, emoji: "😐" },
  { value: 4, emoji: "🙂" },
  { value: 5, emoji: "🤩" },
];

const RATING_QUESTIONS: { key: keyof Omit<SurveyResponseInput, "comments">; label: string }[] = [
  { key: "quality_score", label: "¿Cómo calificaría la calidad del mantenimiento realizado en su equipo?" },
  { key: "professionalism_score", label: "¿Cómo calificaría la atención y el profesionalismo del técnico durante el servicio?" },
  { key: "clarity_score", label: "¿Qué tan clara fue la explicación del trabajo realizado y del estado final de su equipo?" },
  { key: "satisfaction_score", label: "¿Qué tan satisfecho(a) quedó con el servicio de mantenimiento recibido?" },
];

export function SurveyForm({ token }: { token: string }) {
  const [ratings, setRatings] = useState<Record<string, number | null>>({
    quality_score: null,
    professionalism_score: null,
    clarity_score: null,
    satisfaction_score: null,
  });
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (Object.values(ratings).some((v) => v === null)) {
      setError("Responde todas las preguntas antes de enviar");
      return;
    }
    startTransition(async () => {
      const result = await submitSurveyResponse(token, {
        quality_score: ratings.quality_score!,
        professionalism_score: ratings.professionalism_score!,
        clarity_score: ratings.clarity_score!,
        satisfaction_score: ratings.satisfaction_score!,
        comments,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return <p className="text-sm text-green-700">¡Gracias por tu respuesta!</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {RATING_QUESTIONS.map((q) => (
        <div key={q.key} className="space-y-2">
          <p className="text-sm font-medium">{q.label}</p>
          <div className="flex gap-2">
            {RATING_SCALE.map(({ value, emoji }) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} de 5`}
                onClick={() => setRatings((prev) => ({ ...prev, [q.key]: value }))}
                className={`flex size-11 items-center justify-center rounded-full border text-xl transition-transform hover:scale-110 ${
                  ratings[q.key] === value ? "border-primary bg-primary/10 scale-110" : "border-transparent hover:bg-muted"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-sm font-medium">Comentarios (opcional)</p>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </div>
      <Button type="button" onClick={submit} disabled={isPending}>
        Enviar
      </Button>
    </div>
  );
}
