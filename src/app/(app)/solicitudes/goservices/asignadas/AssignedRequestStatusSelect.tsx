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
import { updateGoservicesRequestStatus } from "../actions";
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
      const result = await updateGoservicesRequestStatus(requestId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
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
    );
  }

  // Ejecutor path: explicit one-click action buttons instead of a dropdown —
  // only the forward transitions this request type actually allows, and only
  // while the ejecutor still has something to do.
  const isTerminal = EJECUTOR_TERMINAL[requestType].includes(status);
  const showEnProceso = status !== "en_proceso";

  return (
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
  );
}
