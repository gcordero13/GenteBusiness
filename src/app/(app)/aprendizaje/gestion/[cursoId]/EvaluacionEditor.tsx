"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PREGUNTA_TYPE_LABELS, validateEvalSettings, type PreguntaGestion } from "@/lib/aprendizaje/evaluacion";
import type { EvalSettings } from "@/lib/aprendizaje/types";
import { deletePregunta, setPreguntaActiva, updateEvalSettings } from "../actions";
import { PreguntaForm } from "./PreguntaForm";

const NEW_QUESTION = "nueva";

export function EvaluacionEditor({
  cursoId,
  settings,
  preguntas,
}: {
  cursoId: string;
  settings: EvalSettings;
  preguntas: PreguntaGestion[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.questionsPerAttempt !== null);
  const [perAttempt, setPerAttempt] = useState(String(settings.questionsPerAttempt ?? 10));
  const [passing, setPassing] = useState(String(settings.passingScore));
  const [maxAttempts, setMaxAttempts] = useState(settings.maxAttempts === null ? "" : String(settings.maxAttempts));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCount = preguntas.filter((p) => p.active).length;

  function run(action: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function saveSettings() {
    const next: EvalSettings = {
      questionsPerAttempt: enabled ? Number(perAttempt) : null,
      passingScore: Number(passing),
      maxAttempts: maxAttempts.trim() ? Number(maxAttempts) : null,
    };
    const invalid = validateEvalSettings(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    run(() => updateEvalSettings(cursoId, next), () => setNotice("Configuración guardada."));
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Evaluación</h2>
        <p className="text-sm text-muted-foreground">
          A cada persona le tocan preguntas al azar del banco, en distinto orden y con las opciones mezcladas. El curso
          se completa al aprobarla.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-[#04B1AF]"
        />
        Este curso tiene evaluación
      </label>

      {enabled && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="eval-per-attempt">Preguntas por persona</Label>
            <Input id="eval-per-attempt" type="number" min={1} value={perAttempt} onChange={(e) => setPerAttempt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval-passing">Nota mínima (%)</Label>
            <Input id="eval-passing" type="number" min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval-max-attempts">Intentos permitidos</Label>
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
      )}
      {enabled && Number(perAttempt) > activeCount && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          El banco tiene {activeCount} {activeCount === 1 ? "pregunta activa" : "preguntas activas"}: a cada persona le
          tocarán {activeCount === 0 ? "ninguna" : `solo ${activeCount}`} hasta que agregues más.
        </p>
      )}
      <Button onClick={saveSettings} disabled={isPending}>
        Guardar configuración
      </Button>

      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            Banco de preguntas ({activeCount} activas de {preguntas.length})
          </h3>
          {editingId !== NEW_QUESTION && (
            <Button size="sm" variant="outline" onClick={() => setEditingId(NEW_QUESTION)}>
              <Plus data-icon="inline-start" />
              Agregar pregunta
            </Button>
          )}
        </div>
        {editingId === NEW_QUESTION && <PreguntaForm cursoId={cursoId} onDone={() => setEditingId(null)} />}
        {preguntas.length === 0 && editingId !== NEW_QUESTION && (
          <p className="text-sm text-muted-foreground">Todavía no hay preguntas.</p>
        )}
        <ol className="space-y-2">
          {preguntas.map((p, i) => (
            <li key={p.id}>
              {editingId === p.id ? (
                <PreguntaForm cursoId={cursoId} initial={p} onDone={() => setEditingId(null)} />
              ) : (
                <div className={`space-y-2 rounded-lg border p-3 ${p.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium">
                      {i + 1}. {p.text}
                    </p>
                    <Badge variant="outline">{PREGUNTA_TYPE_LABELS[p.type]}</Badge>
                    {!p.active && <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <ul className="space-y-0.5 pl-4 text-sm">
                    {p.options.map((o) => (
                      <li
                        key={o.id}
                        className={`flex items-center gap-1.5 ${
                          o.isCorrect ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                        }`}
                      >
                        {o.isCorrect ? <CheckCircle2 className="size-3.5" /> : <span className="inline-block size-3.5" />}
                        {o.text}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setEditingId(p.id)}>
                      <Pencil data-icon="inline-start" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => setPreguntaActiva(p.id, cursoId, !p.active))}
                    >
                      {p.active ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm("¿Eliminar esta pregunta del banco?")) run(() => deletePregunta(p.id, cursoId));
                      }}
                    >
                      <Trash2 data-icon="inline-start" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
