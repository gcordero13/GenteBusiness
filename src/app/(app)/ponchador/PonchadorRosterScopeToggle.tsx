"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PonchadorRosterScope = "team" | "all";

export function PonchadorRosterScopeToggle({ rosterScope }: { rosterScope: PonchadorRosterScope }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectRosterScope(next: PonchadorRosterScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("rosterScope", next);
    params.delete("department");
    router.push(`/ponchador?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-lg border p-1">
      {(["team", "all"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => selectRosterScope(s)}
          className={`rounded-md px-3 py-1.5 text-sm ${
            rosterScope === s ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {s === "team" ? "Mi equipo" : "Toda la empresa"}
        </button>
      ))}
    </div>
  );
}
