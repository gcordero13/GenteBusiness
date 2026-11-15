"use client";

import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { saveChristmasMode } from "./actions";

export function ChristmasModeForm({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(next: boolean) {
    setEnabled(next);
    setSuccess(false);
    setError(null);
    startTransition(async () => {
      const result = await saveChristmasMode(next);
      if (result.error) {
        setError(result.error);
        setEnabled(!next);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Modo Navidad</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Guardado.</p>}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="christmas-mode"
          checked={enabled}
          disabled={isPending}
          onChange={(e) => submit(e.target.checked)}
          className="size-4 rounded border-zinc-300 accent-[#04B1AF]"
        />
        <Label htmlFor="christmas-mode">Activar nieve y luces navideñas en todo el portal</Label>
      </div>
    </div>
  );
}
