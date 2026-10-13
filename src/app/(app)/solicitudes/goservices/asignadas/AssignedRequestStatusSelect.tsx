"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import party from "party-js";
import { Pause } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { updateGoservicesRequestStatus, addGoservicesComment } from "../actions";
import { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";
import { GoservicesStatusBadge } from "../GoservicesStatusBadge";

const ALLOWED_OPTIONS: Record<"mantenimiento" | "mensajeria", GoservicesStatus[]> = {
  mantenimiento: ["en_proceso", "en_espera", "finalizado_ejecutor"],
  mensajeria: ["en_proceso", "en_espera", "completado"],
};

// A little celebration when a ticket reaches a "done" state - confirmed
// with the user. Covers both request types' version of "done".
const CELEBRATION_STATUSES: GoservicesStatus[] = ["completado", "finalizado_ejecutor"];

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
  allStatuses,
}: {
  requestId: string;
  status: string;
  requestType: "mantenimiento" | "mensajeria";
  allStatuses?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // "En espera" requires a reason (confirmed with the user) — posted as a
  // regular comment before the status change, so the supervisor always sees
  // why a ticket got paused.
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  function celebrateIfDone(next: GoservicesStatus) {
    if (CELEBRATION_STATUSES.includes(next) && containerRef.current) {
      party.confetti(containerRef.current, { count: party.variation.range(30, 40) });
    }
  }

  function onHoldConfirm() {
    if (!holdReason.trim()) return;
    setError(null);
    startTransition(async () => {
      const commentResult = await addGoservicesComment(requestId, holdReason);
      if (commentResult.error) {
        setError(commentResult.error);
        return;
      }
      const result = await updateGoservicesRequestStatus(requestId, "en_espera");
      if (result.error) {
        setError(result.error);
        return;
      }
      setHoldOpen(false);
      setHoldReason("");
      router.refresh();
    });
  }

  function onSelectChange(next: GoservicesStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateGoservicesRequestStatus(requestId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      celebrateIfDone(next);
      router.refresh();
    });
  }

  function onEjecutorAction(next: GoservicesStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateGoservicesRequestStatus(requestId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      celebrateIfDone(next);
      router.refresh();
    });
  }

  // A gestor (can_authorize) may set any status, but "Finalizado por ejecutor" is
  // a mantenimiento-only concept (the DB trigger itself rejects it for
  // mensajería) — exclude it from the gestor's own dropdown for a mensajería
  // request too, so the UI never offers a state with no defined meaning for
  // that type.
  if (allStatuses) {
    const options = Object.keys(STATUS_LABELS).filter(
      (s) => s !== "finalizado_ejecutor" || requestType === "mantenimiento",
    );
    return (
      <div className="space-y-1" ref={containerRef}>
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
    );
  }

  // Ejecutor path: explicit one-click action buttons instead of a dropdown —
  // only the forward transitions this request type actually allows, and only
  // while the ejecutor still has something to do.
  const isTerminal = EJECUTOR_TERMINAL[requestType].includes(status);
  const showEnProceso = status !== "en_proceso";

  return (
    <div className="space-y-1" ref={containerRef}>
      {isTerminal ? (
        <GoservicesStatusBadge status={status} label={STATUS_LABELS[status] ?? status} />
      ) : holdOpen ? (
        <div className="space-y-1.5">
          <textarea
            className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="¿Por qué se pausa? (obligatorio)"
            rows={2}
            disabled={isPending}
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setHoldOpen(false);
                setHoldReason("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending || !holdReason.trim()}
              className="bg-slate-600 text-white hover:bg-slate-700"
              onClick={onHoldConfirm}
            >
              Confirmar pausa
            </Button>
          </div>
        </div>
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
          {status === "en_proceso" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setHoldOpen(true)}
            >
              <Pause className="size-3.5" />
              En espera
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
  );
}
