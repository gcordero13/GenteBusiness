"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setContactGoservicesEjecutorType } from "./actions";

const BOTH_VALUE = "__ambos__";

const LABELS: Record<string, string> = {
  [BOTH_VALUE]: "Ambos",
  mantenimiento: "Mantenimiento",
  mensajeria: "Mensajería",
};

// Only rendered for a contact whose platform account is GoServices
// ejecutor-eligible (can_manage) — lets an admin keep "el mensajero" and
// "el de mantenimiento" separate so neither shows up as an assignment
// candidate for the other's tickets. Unset ("Ambos") keeps the prior,
// unrestricted behavior.
export function GoservicesEjecutorTypeSelect({
  appUserId,
  currentType,
}: {
  appUserId: string;
  currentType: "mantenimiento" | "mensajeria" | null;
}) {
  const [value, setValue] = useState(currentType ?? BOTH_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setContactGoservicesEjecutorType(
        appUserId,
        next === BOTH_VALUE ? null : (next as "mantenimiento" | "mensajeria"),
      );
      if (result.error) {
        setError(result.error);
        setValue(previous);
      }
    });
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Tipo de ticket GoServices (ejecutor)</p>
      <Select value={value} onValueChange={(v) => v && v !== value && change(v)} disabled={isPending}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue>{(val: string) => LABELS[val] ?? val}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BOTH_VALUE}>Ambos</SelectItem>
          <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
          <SelectItem value="mensajeria">Mensajería</SelectItem>
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
