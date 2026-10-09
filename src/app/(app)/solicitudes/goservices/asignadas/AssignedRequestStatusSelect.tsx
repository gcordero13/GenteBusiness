"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { addGoservicesStatusNote, updateGoservicesRequestStatus } from "../actions";
import { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";
import { GoservicesStatusBadge } from "../GoservicesStatusBadge";

const ALLOWED_OPTIONS: Record<"mantenimiento" | "mensajeria", GoservicesStatus[]> = {
  mantenimiento: ["en_proceso", "finalizado_ejecutor"],
  mensajeria: ["en_proceso", "completado"],
};

// Statuses past which the assigned ejecutor has nothing further to do for
// this request type — show the read-only badge instead of action buttons.
const EJECUTOR_TERMINAL: Record<"mantenimiento" | "mensajeria", string[]> = {
  mantenimiento: ["finalizado_ejecutor", "completado", "cancelado"],
  mensajeria: ["completado", "cancelado"],
};

export function AssignedRequestStatusSelect({
  requestId,
  status,
  requestType,
  statusNote,
  allStatuses,
}: {
  requestId: string;
  status: string;
  requestType: "mantenimiento" | "mensajeria";
  statusNote?: string | null;
  allStatuses?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState(statusNote ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [isNotePending, startNoteTransition] = useTransition();

  function onSelectChange(next: GoservicesStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateGoservicesRequestStatus(requestId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onEjecutorAction(next: GoservicesStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateGoservicesRequestStatus(requestId, next, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onSaveNote() {
    setNoteError(null);
    setNoteSaved(false);
    startNoteTransition(async () => {
      const result = await addGoservicesStatusNote(requestId, note);
      if (result.error) {
        setNoteError(result.error);
        return;
      }
      setNoteSaved(true);
      router.refresh();
    });
  }

  const noteSection = (
    <div className="space-y-1.5">
      <textarea
        className="w-full min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        rows={2}
        placeholder="Dejar una nota (opcional)..."
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setNoteSaved(false);
        }}
        disabled={isNotePending}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isNotePending || !note.trim()}
          onClick={onSaveNote}
        >
          Guardar nota
        </Button>
        {noteSaved && !noteError && <span className="text-xs text-emerald-600">Nota guardada</span>}
        {noteError && <span className="text-xs text-red-600">{noteError}</span>}
      </div>
    </div>
  );

  // A gestor (can_view) may set any status, but "Finalizado por ejecutor" is
  // a mantenimiento-only concept (the DB trigger itself rejects it for
  // mensajería) — exclude it from the gestor's own dropdown for a mensajería
  // request too, so the UI never offers a state with no defined meaning for
  // that type.
  if (allStatuses) {
    const options = Object.keys(STATUS_LABELS).filter(
      (s) => s !== "finalizado_ejecutor" || requestType === "mantenimiento",
    );
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <Select value={status} onValueChange={(v) => v && onSelectChange(v as GoservicesStatus)} disabled={isPending}>
            <SelectTrigger className="w-40"><SelectValue>{(v: string) => STATUS_LABELS[v] ?? v}</SelectValue></SelectTrigger>
            <SelectContent>
              {options.map((value) => (
                <SelectItem key={value} value={value}>{STATUS_LABELS[value] ?? value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        {noteSection}
      </div>
    );
  }

  // Ejecutor path: explicit one-click action buttons instead of a dropdown —
  // only the forward transitions this request type actually allows, and only
  // while the ejecutor still has something to do.
  const isTerminal = EJECUTOR_TERMINAL[requestType].includes(status);
  const showEnProceso = status !== "en_proceso";

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {isTerminal ? (
          <GoservicesStatusBadge status={status} label={STATUS_LABELS[status] ?? status} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {showEnProceso && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => onEjecutorAction(ALLOWED_OPTIONS[requestType][0])}
              >
                En proceso
              </Button>
            )}
            {requestType === "mantenimiento" ? (
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
                onClick={() => onEjecutorAction("finalizado_ejecutor")}
              >
                Marcar como finalizado
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => onEjecutorAction("completado")}
              >
                ✓ Completar
              </Button>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      {noteSection}
    </div>
  );
}
