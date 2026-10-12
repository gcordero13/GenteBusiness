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
import { assignGoservicesRequest } from "../solicitudes/goservices/actions";

const UNASSIGNED_VALUE = "__unassigned__";

export function AssignRequestSelect({
  requestId,
  assignedAppUserId,
  users,
}: {
  requestId: string;
  assignedAppUserId: string | null;
  users: { id: string; email: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(value: string) {
    if (value === UNASSIGNED_VALUE) return;
    setError(null);
    startTransition(async () => {
      const result = await assignGoservicesRequest(requestId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-1">
      <Select
        value={assignedAppUserId ?? UNASSIGNED_VALUE}
        onValueChange={(value) => value && onChange(value)}
        disabled={isPending}
      >
        <SelectTrigger className="w-56">
          <SelectValue>
            {(value: string) => (value === UNASSIGNED_VALUE ? "Sin asignar" : (nameById.get(value) ?? value))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED_VALUE}>Sin asignar</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
