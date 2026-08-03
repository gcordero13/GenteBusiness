"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SignatureDialog } from "@/app/(app)/(admin)/document-stamps/SignatureDialog";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import { respondAsRrhh, respondAsSupervisor } from "./actions";

interface Props {
  requestId: string;
  role: "supervisor" | "rrhh";
  signatures: SignatureWithUrl[];
}

export function VacationRequestActions({ requestId, role, signatures }: Props) {
  const [comment, setComment] = useState("");
  const [periodConfirmed, setPeriodConfirmed] = useState("");
  const [hasCurrentVacation, setHasCurrentVacation] = useState(false);
  const [isAdvance, setIsAdvance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve(signatureDataUrl: string) {
    startTransition(async () => {
      const result =
        role === "supervisor"
          ? await respondAsSupervisor(requestId, "aprobado", signatureDataUrl, comment)
          : await respondAsRrhh(requestId, "aprobado", signatureDataUrl, comment, {
              periodConfirmed,
              hasCurrentVacation,
              isAdvance,
            });
      if (result.error) setError(result.error);
    });
  }

  function reject() {
    startTransition(async () => {
      const result =
        role === "supervisor"
          ? await respondAsSupervisor(requestId, "rechazado", "", comment)
          : await respondAsRrhh(requestId, "rechazado", "", comment, {
              periodConfirmed,
              hasCurrentVacation,
              isAdvance,
            });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {role === "rrhh" && (
        <div className="space-y-2 text-sm">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período al que responde</label>
            <input
              className="w-full rounded-md border p-2 text-sm"
              value={periodConfirmed}
              onChange={(e) => setPeriodConfirmed(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hasCurrentVacation} onChange={(e) => setHasCurrentVacation(e.target.checked)} />
            Tiene vacaciones vigente
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
            Tomará vacaciones por adelantada
          </label>
        </div>
      )}
      <textarea
        className="w-full rounded-md border p-2 text-sm"
        rows={2}
        placeholder="Comentario (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex gap-2">
        {/* SignatureDialog (shared with Sellos y Firmas) has no `disabled` prop on its
            trigger. Rather than modify that shared component, disable clicks on its
            trigger from the outside while a submission is in flight. */}
        <div style={isPending ? { pointerEvents: "none", opacity: 0.5 } : undefined}>
          <SignatureDialog signatures={signatures} onPick={approve} />
        </div>
        <Button type="button" variant="outline" onClick={reject} disabled={isPending}>
          Rechazar
        </Button>
      </div>
    </div>
  );
}
