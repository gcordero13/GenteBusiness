"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateGoservicesRequestStatus, STATUS_LABELS } from "../actions";

type Status = "recibido" | "en_proceso" | "completado" | "cancelado";

export function AssignedRequestStatusSelect({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: Status) {
    startTransition(async () => {
      await updateGoservicesRequestStatus(requestId, next);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={(v) => v && onChange(v as Status)} disabled={isPending}>
      <SelectTrigger className="w-40"><SelectValue>{(v: string) => STATUS_LABELS[v] ?? v}</SelectValue></SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
