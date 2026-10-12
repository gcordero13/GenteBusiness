"use client";

import { LayoutGrid, Rows3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./GoservicesTicketExplorer";

const OPTIONS: { key: ViewMode; label: string; icon: typeof Rows3 }[] = [
  { key: "list", label: "Lista", icon: Rows3 },
  { key: "board", label: "Tablero", icon: LayoutGrid },
  { key: "table", label: "Tabla", icon: Table2 },
];

export function GoservicesViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
      {OPTIONS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            value === key
              ? "bg-[#04B1AF] text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
