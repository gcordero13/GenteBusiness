"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitSurveyResponse, type SurveyResponseInput } from "./actions";

const RATING_QUESTIONS: { key: keyof Omit<SurveyResponseInput, "nps_score" | "comments">; label: string }[] = [
  { key: "quality_score", label: "¿Cómo calificaría la calidad del trabajo realizado?" },
  { key: "punctuality_score", label: "¿Cómo calificaría la puntualidad del técnico?" },
  { key: "professionalism_score", label: "¿Cómo calificaría la amabilidad y profesionalismo del técnico?" },
  { key: "clarity_score", label: "¿Qué tan clara fue la explicación del trabajo realizado?" },
];

export function SurveyForm({ token }: { token: string }) {
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number | null>>({
    quality_score: null,
    punctuality_score: null,
    professionalism_score: null,
    clarity_score: null,
  });
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (npsScore === null || Object.values(ratings).some((v) => v === null)) {
      setError("Responde todas las preguntas antes de enviar");
      return;
    }
    startTransition(async () => {
      const result = await submitSurveyResponse(token, {
        nps_score: npsScore,
        quality_score: ratings.quality_score!,
        punctuality_score: ratings.punctuality_score!,
        professionalism_score: ratings.professionalism_score!,
        clarity_score: ratings.clarity_score!,
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
      <div className="space-y-2">
        <p className="text-sm font-medium">
          ¿Qué tan probable es que recomiende nuestro servicio técnico a un colega? (0 = nada probable, 10 = muy probable)
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNpsScore(n)}
              className={`size-8 rounded border text-sm ${npsScore === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {RATING_QUESTIONS.map((q) => (
        <div key={q.key} className="space-y-2">
          <p className="text-sm font-medium">{q.label}</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatings((prev) => ({ ...prev, [q.key]: n }))}
                className={`size-8 rounded border text-sm ${ratings[q.key] === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {n}
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
