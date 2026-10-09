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
import { updateGoservicesRequestStatus } from "../actions";
import { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";

const ALLOWED_OPTIONS: Record<"mantenimiento" | "mensajeria", GoservicesStatus[]> = {
  mantenimiento: ["en_proceso", "finalizado_ejecutor"],
  mensajeria: ["en_proceso", "completado"],
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

  function onChange(next: GoservicesStatus) {
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

  // A gestor (can_view) may set any status. Otherwise, only the statuses the
  // assigned ejecutor is allowed to move to for this request's type — plus
  // the current status itself, so it always has a valid, renderable value
  // even before the ejecutor has made their own forward choice.
  const options: string[] = allStatuses
    ? Object.keys(STATUS_LABELS)
    : Array.from(new Set([status, ...ALLOWED_OPTIONS[requestType]]));

  return (
    <div className="space-y-1">
      <Select value={status} onValueChange={(v) => v && onChange(v as GoservicesStatus)} disabled={isPending}>
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
