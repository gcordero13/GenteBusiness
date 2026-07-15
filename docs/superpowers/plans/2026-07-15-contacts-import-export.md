# Agenda Telefónica — Plan 3: Importar/Exportar Contactos (CSV) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users export the currently filtered/visible contact list to a CSV file, and import a CSV to bulk-create/update contacts (matched by email), completing the last item from the original agenda spec (`docs/superpowers/specs/2026-07-13-agenda-telefonica-design.md`, "Importación y exportación" section).

**Architecture:** No new npm dependency — CSV parsing/serialization is a small, hand-written, unit-tested pure module (`src/lib/csv.ts`), following the same TDD pattern already used for `src/lib/contacts.ts` in this codebase. Export is a Server Action that runs the same RLS-respecting query pattern already used in `contacts/page.tsx` (filtered by the same `q`/`company`/`department`/`showInactive` params) and returns a CSV string, which a client component turns into a downloaded file via a Blob URL. Import is a Server Action that parses uploaded CSV text, resolves company/department names to IDs, and inserts/updates via the normal RLS-enforced `createClient()` — no admin/service-role client, so every row is subject to the exact same `can_add`/`can_edit`/RLS rules as the manual contact form, row-by-row, collecting per-row errors instead of failing the whole batch.

**Tech Stack:** Next.js (App Router), Supabase, Vitest for the new pure-function tests. No new packages.

**Related spec:** `docs/superpowers/specs/2026-07-13-agenda-telefonica-design.md`, "Importación y exportación" section. Format decision (made inline, 2026-07-15): CSV only, no `.xlsx` support — opens fine in Excel/Sheets, avoids adding a spreadsheet-parsing dependency.

---

### Task 1: `src/lib/csv.ts` — pure CSV parse/serialize helpers (TDD)

**Files:**
- Create: `src/lib/csv.ts`
- Create: `src/lib/csv.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/csv.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("joins simple rows with commas and CRLF between rows", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("quotes a field containing a comma", () => {
    expect(toCsv([["Doe, Jane", "x"]])).toBe('"Doe, Jane",x');
  });

  it("quotes and escapes a field containing a double quote", () => {
    expect(toCsv([['Say "hi"', "x"]])).toBe('"Say ""hi""",x');
  });

  it("quotes a field containing a newline", () => {
    expect(toCsv([["line1\nline2", "x"]])).toBe('"line1\nline2",x');
  });

  it("renders null/undefined as an empty field", () => {
    expect(toCsv([[null, undefined, "x"]])).toBe(",,x");
  });

  it("renders booleans and numbers as their string form", () => {
    expect(toCsv([[true, false, 42]])).toBe("true,false,42");
  });
});

describe("parseCsv", () => {
  it("parses a simple multi-row, multi-column CSV", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("un-escapes a quoted field containing a comma", () => {
    expect(parseCsv('"Doe, Jane",x')).toEqual([["Doe, Jane", "x"]]);
  });

  it("un-escapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('"Say ""hi""",x')).toEqual([['Say "hi"', "x"]]);
  });

  it("handles a trailing newline without producing an extra empty row", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("round-trips through toCsv for values containing commas, quotes, and newlines", () => {
    const original = [
      ["name", "note"],
      ["Doe, Jane", 'She said "hi"\nagain'],
    ];
    expect(parseCsv(toCsv(original))).toEqual(original);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`.

- [ ] **Step 3: Implement**

`src/lib/csv.ts`:
```typescript
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

function csvField(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat: add CSV parse/serialize helpers"
```

---

### Task 2: Export contacts to CSV

**Files:**
- Modify: `src/app/(app)/contacts/actions.ts`
- Create: `src/app/(app)/contacts/ExportContactsButton.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Add the export Server Action**

Append to `src/app/(app)/contacts/actions.ts` (keep the existing `saveContact`/`setContactStatus`/`deleteContact` untouched):
```typescript
import { escapeIlikePattern } from "@/lib/contacts";
import { toCsv } from "@/lib/csv";

export interface ExportContactsFilters {
  q?: string;
  company?: string;
  department?: string;
  showInactive?: string;
}

const CSV_HEADER = [
  "first_name", "last_name", "email", "extension", "fleet_phone", "has_whatsapp",
  "position", "company", "department", "birth_date", "status", "photo_url",
];

export async function exportContactsCsv(filters: ExportContactsFilters) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    return { error: "No autorizado" };
  }

  let query = supabase
    .from("contacts")
    .select(
      "first_name, last_name, email, extension, fleet_phone, has_whatsapp, position, birth_date, status, photo_url, companies(name), departments(name)",
    )
    .order("first_name");

  if (!filters.showInactive || !(flags.can_deactivate || flags.can_delete)) {
    query = query.eq("status", "active");
  }
  if (filters.q) {
    const pattern = escapeIlikePattern(filters.q);
    query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }
  if (filters.company) {
    query = query.eq("company_id", filters.company);
  }
  if (filters.department) {
    query = query.eq("department_id", filters.department);
  }

  const { data: contacts, error } = await query;
  if (error) return { error: error.message };

  const rows: (string | number | boolean | null)[][] = [CSV_HEADER];
  for (const c of contacts ?? []) {
    const company = (c.companies as unknown as { name: string } | null)?.name ?? "";
    const department = (c.departments as unknown as { name: string } | null)?.name ?? "";
    rows.push([
      c.first_name,
      c.last_name,
      c.email ?? "",
      c.extension ?? "",
      c.fleet_phone ?? "",
      c.has_whatsapp,
      c.position ?? "",
      company,
      department,
      c.birth_date ?? "",
      c.status,
      c.photo_url ?? "",
    ]);
  }

  return { csv: toCsv(rows) };
}
```
Add the two new imports (`escapeIlikePattern` from `@/lib/contacts`, `toCsv` from `@/lib/csv`) to the top of the file alongside the existing ones.

- [ ] **Step 2: Client button that triggers the download**

`src/app/(app)/contacts/ExportContactsButton.tsx`:
```tsx
"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportContactsCsv } from "./actions";

export function ExportContactsButton() {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportContactsCsv({
        q: searchParams.get("q") ?? undefined,
        company: searchParams.get("company") ?? undefined,
        department: searchParams.get("department") ?? undefined,
        showInactive: searchParams.get("showInactive") ?? undefined,
      });
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contactos.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={isPending}>
      <Download className="size-4" />
      Exportar CSV
    </Button>
  );
}
```

- [ ] **Step 3: Wire the button into `page.tsx`, next to "Nuevo contacto", visible whenever the page itself is (the user already passed the `can_view` gate to reach this page at all)**

In `src/app/(app)/contacts/page.tsx`, import `ExportContactsButton` and add it inside the top `<div className="flex items-center justify-between">` row, e.g.:
```tsx
<div className="flex items-center gap-2">
  <ExportContactsButton />
  {flags.can_add && (
    <a href="/contacts/new" className="text-sm underline">
      Nuevo contacto
    </a>
  )}
</div>
```
(replacing the existing bare `{flags.can_add && (...)}` block with this wrapping `<div>` so both sit side by side).

- [ ] **Step 4: Manual verification (adapted, see override below)**

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/contacts/actions.ts src/app/(app)/contacts/ExportContactsButton.tsx src/app/(app)/contacts/page.tsx
git commit -m "feat: add CSV export for the contacts list"
```

#### Override for Step 4

Cannot browser-test interactively (downloading and inspecting a file requires a real browser). Run `npx tsc --noEmit` (clean) and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contacts` (expect a redirect, not a crash). Note the actual download/file-content check is deferred to the human's later pass.

---

### Task 3: Import contacts from CSV

**Files:**
- Modify: `src/app/(app)/contacts/actions.ts`
- Create: `src/app/(app)/contacts/ImportContactsDialog.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Add the import Server Action**

Append to `src/app/(app)/contacts/actions.ts`:
```typescript
import { parseCsv } from "@/lib/csv";

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  successCount: number;
  errors: ImportRowError[];
}

export async function importContactsCsv(
  csvText: string,
): Promise<ImportResult | { error: string }> {
  const supabase = await createClient();

  const rows = parseCsv(csvText).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) {
    return { error: "El archivo está vacío" };
  }

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const { data: companies } = await supabase.from("companies").select("id, name");
  const { data: departments } = await supabase.from("departments").select("id, name, company_id");

  const companyByName = new Map((companies ?? []).map((c) => [c.name.trim().toLowerCase(), c]));
  const departmentByName = new Map(
    (departments ?? []).map((d) => [`${d.company_id}:${d.name.trim().toLowerCase()}`, d]),
  );

  const errors: ImportRowError[] = [];
  let successCount = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowNumber = i + 2;
    const cells = dataRows[i];
    const get = (key: string) => {
      const idx = header.indexOf(key);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    const firstName = get("first_name");
    const lastName = get("last_name");
    if (!firstName || !lastName) {
      errors.push({ row: rowNumber, message: "Falta nombre o apellido" });
      continue;
    }

    const companyName = get("company");
    const company = companyName ? companyByName.get(companyName.toLowerCase()) : undefined;
    if (companyName && !company) {
      errors.push({ row: rowNumber, message: `Empresa "${companyName}" no encontrada` });
      continue;
    }

    const departmentName = get("department");
    let departmentId: string | null = null;
    if (departmentName) {
      const dept = company
        ? departmentByName.get(`${company.id}:${departmentName.toLowerCase()}`)
        : undefined;
      if (!dept) {
        errors.push({ row: rowNumber, message: `Departamento "${departmentName}" no encontrado` });
        continue;
      }
      departmentId = dept.id;
    }

    const email = get("email");
    const payload = {
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      extension: get("extension") || null,
      fleet_phone: get("fleet_phone") || null,
      has_whatsapp: ["true", "1", "si", "sí"].includes(get("has_whatsapp").toLowerCase()),
      position: get("position") || null,
      company_id: company?.id ?? null,
      department_id: departmentId,
      birth_date: get("birth_date") || null,
      status: get("status") === "deactivated" ? "deactivated" : "active",
    };

    let existingId: string | null = null;
    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    const { error } = existingId
      ? await supabase.from("contacts").update(payload).eq("id", existingId)
      : await supabase.from("contacts").insert(payload);

    if (error) {
      errors.push({ row: rowNumber, message: error.message });
      continue;
    }

    successCount += 1;
  }

  revalidatePath("/contacts");
  return { successCount, errors };
}
```
Add `parseCsv` to the existing `@/lib/csv` import line from Task 2 (don't add a second import statement for the same module).

- [ ] **Step 2: Client dialog — file picker, submit, per-row result summary**

`src/app/(app)/contacts/ImportContactsDialog.tsx`:
```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { importContactsCsv, type ImportResult } from "./actions";

export function ImportContactsDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | { error: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!file) return;
    startTransition(async () => {
      const text = await file.text();
      const outcome = await importContactsCsv(text);
      setResult(outcome);
    });
  }

  function reset() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Upload className="size-4" />
            Importar CSV
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar contactos desde CSV</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Columnas esperadas: first_name, last_name, email, extension, fleet_phone,
          has_whatsapp, position, company, department, birth_date, status. Los contactos
          se actualizan por coincidencia de correo; sin correo, siempre se crean como
          nuevos.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {result && "error" in result && <p className="text-sm text-red-600">{result.error}</p>}
        {result && "successCount" in result && (
          <div className="text-sm">
            <p>{result.successCount} contacto(s) importado(s) correctamente.</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-red-600">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !file}>
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire the dialog into `page.tsx`, gated by `can_add` (bulk creation requires the same permission as the manual "Nuevo contacto" flow) — placed in the same header row as `ExportContactsButton`/"Nuevo contacto"**

```tsx
<div className="flex items-center gap-2">
  <ExportContactsButton />
  {flags.can_add && <ImportContactsDialog />}
  {flags.can_add && (
    <a href="/contacts/new" className="text-sm underline">
      Nuevo contacto
    </a>
  )}
</div>
```

- [ ] **Step 4: Manual verification (adapted, see override below)**

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/contacts/actions.ts src/app/(app)/contacts/ImportContactsDialog.tsx src/app/(app)/contacts/page.tsx
git commit -m "feat: add CSV import for bulk contact creation/update"
```

#### Override for Step 4

Cannot browser-test interactively (file upload requires a real browser). Run `npx tsc --noEmit` (clean) and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contacts` (expect a redirect, not a crash). Note the actual upload/import flow (picking a file, seeing the per-row summary, confirming a real row was created/updated) is deferred to the human's later pass — recommend they first try exporting the current list (Task 2) and re-importing that same file unmodified, as a quick round-trip smoke test.

---

### Task 4: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** `npm test` — expect all tests passing, including the new `src/lib/csv.test.ts`.
- [ ] **Step 2:** `npx tsc --noEmit` — expect clean.
- [ ] **Step 3:** Smoke-curl `/contacts` — expect a redirect, not a crash.
