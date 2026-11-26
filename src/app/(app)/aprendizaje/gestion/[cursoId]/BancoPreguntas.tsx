"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PREGUNTA_TYPE_LABELS, type PreguntaGestion } from "@/lib/aprendizaje/evaluacion";
import { deletePregunta, setPreguntaActiva } from "../actions";
import { PreguntaForm } from "./PreguntaForm";

const NEW_QUESTION = "nueva";

/** One lesson's question bank: list with the correct answers, add, edit, (de)activate, delete. */
export function BancoPreguntas({
  cursoId,
  leccionId,
  preguntas,
}: {
  cursoId: string;
  leccionId: string;
  preguntas: PreguntaGestion[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeCount = preguntas.filter((p) => p.active).length;

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Banco de preguntas ({activeCount} activas de {preguntas.length})
        </p>
        {editingId !== NEW_QUESTION && (
          <Button size="sm" variant="outline" onClick={() => setEditingId(NEW_QUESTION)}>
            <Plus data-icon="inline-start" />
            Agregar pregunta
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {editingId === NEW_QUESTION && (
        <PreguntaForm cursoId={cursoId} leccionId={leccionId} onDone={() => setEditingId(null)} />
      )}
      {preguntas.length === 0 && editingId !== NEW_QUESTION && (
        <p className="text-sm text-muted-foreground">Todavía no hay preguntas.</p>
      )}
      <ol className="space-y-2">
        {preguntas.map((p, i) => (
          <li key={p.id}>
            {editingId === p.id ? (
              <PreguntaForm cursoId={cursoId} leccionId={leccionId} initial={p} onDone={() => setEditingId(null)} />
            ) : (
              <div className={`space-y-2 rounded-lg border p-3 ${p.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium">
                    {i + 1}. {p.text}
                  </p>
                  <Badge variant="outline">{PREGUNTA_TYPE_LABELS[p.type]}</Badge>
                  {p.seconds !== null && (
                    <Badge variant="outline">
                      <Timer data-icon="inline-start" />
                      {p.seconds} s
                    </Badge>
                  )}
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
  );
}
