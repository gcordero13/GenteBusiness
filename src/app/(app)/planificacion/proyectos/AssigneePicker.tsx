"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { AssigneeOption } from "./TareaCreateDialog";

// Shared by every place that shows a person's avatar fallback (Jerarquía,
// Lista, the detail modal) - first letter of the first two words of their
// name.
// Kept as a re-export for the client components that import it from here;
// server components must import it from ./visual (see the note there).
export { initials } from "./visual";

// Free-text search over the assignable-users list, with suggestions shown
// as the user types (confirmed with the user: a plain dropdown with every
// name was hard to use once the list got long). `value` is the selected
// id, or "" for "sin asignar" - same sentinel convention the previous
// <Select>-based picker used, so callers didn't need to change.
export function AssigneePicker({
  assignees,
  value,
  onChange,
  placeholder = "Buscar persona...",
}: {
  assignees: AssigneeOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = assignees.find((a) => a.id === value) ?? null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? assignees.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()))
    : assignees;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={open ? query : (selected?.name ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Quitar"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-card shadow-lg">
          {filtered.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">Sin resultados</p>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                {a.name}
                {a.id === value && <Check className="size-3.5 text-[#04B1AF]" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
