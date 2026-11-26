"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PREGUNTA_TYPE_LABELS,
  TRUE_FALSE_TEXTS,
  validatePregunta,
  type OpcionInput,
  type PreguntaGestion,
  type PreguntaType,
} from "@/lib/aprendizaje/evaluacion";
import { FIELD_CLASS_NAME } from "@/lib/aprendizaje/types";
import { savePregunta } from "../actions";

const MAX_OPTIONS = 6;

const blankOptions = (): OpcionInput[] => [
  { text: "", isCorrect: false },
  { text: "", isCorrect: false },
];
const trueFalseOptions = (): OpcionInput[] => TRUE_FALSE_TEXTS.map((text) => ({ text, isCorrect: false }));

export function PreguntaForm({
  cursoId,
  leccionId,
  initial,
  onDone,
}: {
  cursoId: string;
  leccionId: string;
  initial?: PreguntaGestion;
  onDone: () => void;
}) {
  const router = useRouter();
  const formId = initial?.id ?? `nueva-${leccionId}`;
  const [text, setText] = useState(initial?.text ?? "");
  const [type, setType] = useState<PreguntaType>(initial?.type ?? "opcion_unica");
  const [options, setOptions] = useState<OpcionInput[]>(
    initial ? initial.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })) : blankOptions(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeType(next: PreguntaType) {
    setType(next);
    setOptions(next === "verdadero_falso" ? trueFalseOptions() : blankOptions());
  }

  function markCorrect(index: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === index })));
  }

  function updateText(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, text: value } : o)));
  }

  function save() {
    const input = { id: initial?.id, text, type, options };
    const invalid = validatePregunta(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await savePregunta(cursoId, leccionId, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-1.5">
        <Label htmlFor={`pregunta-text-${formId}`}>Pregunta</Label>
        <textarea
          id={`pregunta-text-${formId}`}
          rows={2}
          className={FIELD_CLASS_NAME}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pregunta-type-${formId}`}>Tipo</Label>
        <select
          id={`pregunta-type-${formId}`}
          className={FIELD_CLASS_NAME}
          value={type}
          onChange={(e) => changeType(e.target.value as PreguntaType)}
        >
          {(Object.keys(PREGUNTA_TYPE_LABELS) as PreguntaType[]).map((t) => (
            <option key={t} value={t}>
              {PREGUNTA_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {type === "verdadero_falso" ? "Respuesta correcta" : "Opciones (marca la correcta)"}
        </legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correcta-${formId}`}
              checked={o.isCorrect}
              onChange={() => markCorrect(i)}
              aria-label={`Marcar opción ${i + 1} como correcta`}
              className="accent-[#04B1AF]"
            />
            {type === "verdadero_falso" ? (
              <span className="text-sm">{o.text}</span>
            ) : (
              <>
                <Input
                  value={o.text}
                  onChange={(e) => updateText(i, e.target.value)}
                  placeholder={`Opción ${i + 1}`}
                  aria-label={`Texto de la opción ${i + 1}`}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={options.length <= 2}
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Quitar opción ${i + 1}`}
                >
                  <X />
                </Button>
              </>
            )}
          </div>
        ))}
        {type === "opcion_unica" && options.length < MAX_OPTIONS && (
          <Button size="sm" variant="ghost" onClick={() => setOptions((prev) => [...prev, { text: "", isCorrect: false }])}>
            <Plus data-icon="inline-start" />
            Agregar opción
          </Button>
        )}
      </fieldset>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={isPending}>
          Guardar pregunta
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
