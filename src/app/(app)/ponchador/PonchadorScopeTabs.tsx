"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PonchadorScope = "self" | "team" | "all";

const SCOPE_LABELS: Record<PonchadorScope, string> = {
  self: "Mi Ponchador",
  team: "Mi Equipo",
  all: "Todos",
};

export function PonchadorScopeTabs({
  scope,
  hasTeam,
  canViewAll,
}: {
  scope: PonchadorScope;
  hasTeam: boolean;
  canViewAll: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const availableScopes: PonchadorScope[] = [
    "self",
    ...(hasTeam ? (["team"] as const) : []),
    ...(canViewAll ? (["all"] as const) : []),
  ];

  function selectScope(next: PonchadorScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    params.delete("contactId");
    router.push(`/ponchador?${params.toString()}`);
  }

  if (availableScopes.length < 2) return null;

  return (
    <div className="inline-flex rounded-lg border p-1">
      {availableScopes.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => selectScope(s)}
          className={`rounded-md px-3 py-1.5 text-sm ${
            scope === s ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {SCOPE_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
