# Mantenimiento Correctivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second maintenance type ("Correctivo") to the existing Mantenimientos module, alongside type+year navigation on the records list, reusing the existing token/signature/PDF/email/survey pipeline built for Preventivo.

**Architecture:** Extend the existing flat `maintenance_records` table with a `type` column and 4 nullable Correctivo-only columns (problema reportado, diagnóstico, solución aplicada, repuestos/piezas), the same pattern already used for the Preventivo checklist. Every consumer of this table (list page, detail page, public form, PDF builder, CSV exports) branches on `type` to show/build the right section; nothing about tokens, signatures, completion, or email changes.

**Tech Stack:** Next.js App Router (Server Actions + Server Components), Supabase (Postgres + RLS), pdf-lib, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-01-corrective-maintenance-design.md](../specs/2026-08-01-corrective-maintenance-design.md)

**Base branch:** `feature/preventive-maintenance` (not yet merged to `main`). All work in this plan happens on that branch.

---

## Task 1: Migration — `type` column and Correctivo fields

**Files:**
- Create: `supabase/migrations/20260802090000_maintenance_records_add_type_and_correctivo_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.maintenance_records
  add column type text not null default 'preventivo' check (type in ('preventivo', 'correctivo')),
  add column problema_reportado text,
  add column diagnostico text,
  add column solucion_aplicada text,
  add column repuestos_piezas text;
```

- [ ] **Step 2: Apply the migration to the local Supabase instance**

Run: `supabase migration up`
Expected: the migration applies cleanly and `maintenance_records` now has the 5 new columns (verify with `supabase db diff` showing no pending drift, or by inspecting the table in Supabase Studio).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260802090000_maintenance_records_add_type_and_correctivo_fields.sql
git commit -m "feat: add type and correctivo fields to maintenance_records"
```

---

## Task 2: Correctivo field definitions

**Files:**
- Create: `src/lib/maintenanceCorrectivoFields.ts`
- Test: `src/lib/maintenanceCorrectivoFields.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { MAINTENANCE_CORRECTIVO_FIELDS } from "./maintenanceCorrectivoFields";

describe("MAINTENANCE_CORRECTIVO_FIELDS", () => {
  it("has exactly the 4 fields confirmed for the Correctivo form, in order", () => {
    expect(MAINTENANCE_CORRECTIVO_FIELDS.map((f) => f.key)).toEqual([
      "problema_reportado",
      "diagnostico",
      "solucion_aplicada",
      "repuestos_piezas",
    ]);
  });

  it("has a non-empty Spanish label for every field", () => {
    for (const field of MAINTENANCE_CORRECTIVO_FIELDS) {
      expect(field.label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceCorrectivoFields.test.ts`
Expected: FAIL — cannot find module `./maintenanceCorrectivoFields`

- [ ] **Step 3: Write the implementation**

```typescript
export const MAINTENANCE_CORRECTIVO_FIELDS = [
  { key: "problema_reportado", label: "Problema reportado" },
  { key: "diagnostico", label: "Diagnóstico" },
  { key: "solucion_aplicada", label: "Solución aplicada" },
  { key: "repuestos_piezas", label: "Repuestos/piezas usadas" },
] as const;

export type MaintenanceCorrectivoFieldKey = (typeof MAINTENANCE_CORRECTIVO_FIELDS)[number]["key"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceCorrectivoFields.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceCorrectivoFields.ts src/lib/maintenanceCorrectivoFields.test.ts
git commit -m "feat: define the Correctivo maintenance field set"
```

---

## Task 3: `createMaintenanceRecord` accepts a type

**Files:**
- Modify: `src/app/(app)/(admin)/maintenance/actions.ts`
- Test: `src/app/(app)/(admin)/maintenance/actions.test.ts`

- [ ] **Step 1: Update the failing/changed tests**

In `src/app/(app)/(admin)/maintenance/actions.test.ts`, update the `describe("createMaintenanceRecord", ...)` block to pass a type to every call and assert it's inserted:

```typescript
describe("createMaintenanceRecord", () => {
  it("rejects when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ userId: null }) as never);

    const result = await createMaintenanceRecord("contact-1", "preventivo");

    expect(result.error).toBe("No autorizado");
  });

  it("rejects when the contact is not found", async () => {
    const supabase = mockSupabase({ contact: null, contactError: { message: "not found" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1", "preventivo");

    expect(result.error).toBe("Contacto no encontrado");
  });

  it("creates a snapshot record and returns the generated token", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1", "preventivo");

    expect(result.error).toBeUndefined();
    expect(result.token).toBe("fixed-test-token");
    expect(supabase.from).toHaveBeenCalledWith("maintenance_records");
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "fixed-test-token",
        contact_id: "contact-1",
        created_by: "tech-1",
        type: "preventivo",
        first_name: "Ana",
        last_name: "García",
        position: "Analista",
        email: "ana@example.com",
        company_name: "Sanchez Business Corp",
        department_name: "TI",
      }),
    );
  });

  it("creates a correctivo record when type is correctivo", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1", "correctivo");

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "correctivo" }),
    );
  });

  it("surfaces the insert error", async () => {
    const supabase = mockSupabase({ insertError: { message: "insert failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1", "preventivo");

    expect(result.error).toBe("insert failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/\(app\)/\(admin\)/maintenance/actions.test.ts`
Expected: FAIL — `createMaintenanceRecord` called with 2 args but only accepts 1; `type` missing from the insert call

- [ ] **Step 3: Update the implementation**

In `src/app/(app)/(admin)/maintenance/actions.ts`, change the `createMaintenanceRecord` signature and insert payload:

```typescript
export async function createMaintenanceRecord(
  contactId: string,
  type: "preventivo" | "correctivo",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("first_name, last_name, position, email, companies(name), departments(name)")
    .eq("id", contactId)
    .single();
  if (contactError || !contact) return { error: "Contacto no encontrado" };

  const token = generateMaintenanceToken();

  const { error: insertError } = await supabase.from("maintenance_records").insert({
    token,
    contact_id: contactId,
    created_by: user.id,
    type,
    first_name: contact.first_name,
    last_name: contact.last_name,
    position: contact.position,
    email: contact.email,
    company_name: (contact.companies as unknown as { name: string } | null)?.name ?? null,
    department_name: (contact.departments as unknown as { name: string } | null)?.name ?? null,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/maintenance");
  return { token };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/\(app\)/\(admin\)/maintenance/actions.test.ts`
Expected: PASS (all `createMaintenanceRecord` and `deleteMaintenanceRecord` tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/\(admin\)/maintenance/actions.ts src/app/\(app\)/\(admin\)/maintenance/actions.test.ts
git commit -m "feat: createMaintenanceRecord accepts a maintenance type"
```

---

## Task 4: `NewMaintenanceDialog` inherits the active type

**Files:**
- Modify: `src/app/(app)/(admin)/maintenance/NewMaintenanceDialog.tsx`

No test file exists for this component today (it's exercised only through the Server Action tests in Task 3 and manual testing, consistent with the rest of this module's client dialogs). This task is implementation-only.

- [ ] **Step 1: Add a `type` prop and thread it into `createMaintenanceRecord`**

In `src/app/(app)/(admin)/maintenance/NewMaintenanceDialog.tsx`, change the component signature and the `pick` function:

```typescript
export function NewMaintenanceDialog({
  contacts,
  type,
}: {
  contacts: ContactOption[];
  type: "preventivo" | "correctivo";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = contacts.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q)
    );
  });

  function pick(contactId: string) {
    setPendingId(contactId);
    setError(null);
    startTransition(async () => {
      const result = await createMaintenanceRecord(contactId, type);
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setQuery("");
      router.refresh();
    });
  }
```

The rest of the file (JSX rendering, dialog markup) is unchanged.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/\(admin\)/maintenance/NewMaintenanceDialog.tsx
git commit -m "feat: NewMaintenanceDialog creates a record of the active tab's type"
```

---

## Task 5: List page — type tabs + year filter

**Files:**
- Create: `src/app/(app)/(admin)/maintenance/MaintenanceFilters.tsx`
- Modify: `src/app/(app)/(admin)/maintenance/page.tsx`

No test file exists for `page.tsx` today (it's a Server Component exercised manually, consistent with the rest of this module). This task is implementation-only; verify manually per Task 5 Step 4.

- [ ] **Step 1: Create the filter control**

`MaintenanceFilters.tsx` follows the same client-side "read/write query params via `useSearchParams`+`useRouter`" pattern already used in `src/app/(app)/contacts/SearchFilters.tsx`:

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};

export function MaintenanceFilters({ years }: { years: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") === "correctivo" ? "correctivo" : "preventivo";
  const year = searchParams.get("year") ?? String(years[0]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/maintenance?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border p-1">
        {(["preventivo", "correctivo"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => updateParam("type", t)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              type === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <Select value={year} onValueChange={(value) => updateParam("year", value)}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the list page to filter by type/year and render the filter bar**

Replace the full contents of `src/app/(app)/(admin)/maintenance/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Download, Wrench } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewMaintenanceDialog } from "./NewMaintenanceDialog";
import { DeleteMaintenanceRecordButton } from "./DeleteMaintenanceRecordButton";
import { MaintenanceFilters } from "./MaintenanceFilters";

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

const TYPE_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};

function parseType(value: string | undefined): "preventivo" | "correctivo" {
  return value === "correctivo" ? "correctivo" : "preventivo";
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; year?: string }>;
}) {
  const { type: typeParam, year: yearParam } = await searchParams;
  const type = parseType(typeParam);
  const currentYear = new Date().getFullYear();
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear;

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  const { data: yearRows } = await supabase.from("maintenance_records").select("created_at");
  const years = Array.from(
    new Set([currentYear, ...(yearRows ?? []).map((r) => new Date(r.created_at).getFullYear())]),
  ).sort((a, b) => b - a);

  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd = `${year + 1}-01-01T00:00:00.000Z`;

  const { data: records } = await supabase
    .from("maintenance_records")
    .select("id, first_name, last_name, company_name, status, created_at, app_users(full_name, email)")
    .eq("type", type)
    .gte("created_at", yearStart)
    .lt("created_at", yearEnd)
    .order("created_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, companies(name)")
    .eq("status", "active")
    .order("first_name");

  const contactOptions = (contacts ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`,
    email: c.email ?? "",
    company: (c.companies as unknown as { name: string } | null)?.name ?? "",
  }));

  const reportQuery = `?type=${type}&year=${year}`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mantenimientos</h1>
          <p className="text-sm text-muted-foreground">
            Registros de mantenimiento {TYPE_LABEL[type].toLowerCase()} por contacto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/maintenance/surveys" className="text-sm underline">
            Encuestas
          </Link>
          <a
            href={`/maintenance/export/basic${reportQuery}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Download className="size-4" />
            Reporte básico
          </a>
          <a
            href={`/maintenance/export/detailed${reportQuery}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Download className="size-4" />
            Reporte detallado
          </a>
          {flags.can_add && <NewMaintenanceDialog contacts={contactOptions} type={type} />}
        </div>
      </div>

      <MaintenanceFilters years={years} />

      {(records ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Wrench className="size-8" />
          <p className="text-sm">
            No hay registros de mantenimiento {TYPE_LABEL[type].toLowerCase()} en {year}.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="py-3">Usuario</TableHead>
                <TableHead className="py-3">Empresa</TableHead>
                <TableHead className="py-3">Técnico</TableHead>
                <TableHead className="py-3">Estado</TableHead>
                <TableHead className="py-3">Creado</TableHead>
                <TableHead className="py-3 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(records ?? []).map((r) => {
                const technician = r.app_users as unknown as { full_name: string | null; email: string } | null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="py-3">
                      {r.first_name} {r.last_name}
                    </TableCell>
                    <TableCell className="py-3">{r.company_name ?? "-"}</TableCell>
                    <TableCell className="py-3">{technician?.full_name ?? technician?.email ?? "-"}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant={r.status === "completado" ? "default" : "secondary"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      {new Date(r.created_at).toLocaleDateString("es-MX")}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/maintenance/${r.id}`} className="text-sm underline">
                          Ver
                        </Link>
                        {flags.can_delete && (
                          <DeleteMaintenanceRecordButton recordId={r.id} status={r.status} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run lint`
Expected: no new errors in `src/app/(app)/(admin)/maintenance/`

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, then in a browser visit `/maintenance`. Confirm: the Preventivo tab is selected by default with the current year, existing Preventivo records still show up, switching to the Correctivo tab shows an empty state (no Correctivo records exist yet), the year selector lists at least the current year, and "Nuevo mantenimiento" while on the Correctivo tab creates a record with `type = 'correctivo'` (check in Supabase Studio or via the detail page).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/\(admin\)/maintenance/MaintenanceFilters.tsx src/app/\(app\)/\(admin\)/maintenance/page.tsx
git commit -m "feat: add type/year tabs to the maintenance records list"
```

---

## Task 6: Detail page branches Checklist vs. Diagnóstico y Solución

**Files:**
- Modify: `src/app/(app)/(admin)/maintenance/[id]/page.tsx`

No test file exists for this page today. This task is implementation-only; verify manually per Step 3.

- [ ] **Step 1: Import the Correctivo field list and branch the checklist section**

In `src/app/(app)/(admin)/maintenance/[id]/page.tsx`, add the import:

```typescript
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";
```

Replace the existing `"Checklist"` `<section>` with:

```tsx
      {record.type === "correctivo" ? (
        <section className="space-y-4">
          <h2 className="font-medium">Diagnóstico y Solución</h2>
          {MAINTENANCE_CORRECTIVO_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">{field.label}</h3>
              <p className="whitespace-pre-wrap text-sm">
                {(record[field.key as keyof typeof record] as string | null) ?? "-"}
              </p>
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="font-medium">Checklist</h2>
          <ul className="space-y-1 text-sm">
            {MAINTENANCE_CHECKLIST_ITEMS.map((item) => {
              const value = record[item.key as keyof typeof record] as boolean | null;
              return (
                <li key={item.key} className="flex items-center gap-2">
                  <span>{value === null ? "◻" : value ? "☑" : "☐"}</span>
                  <span>{item.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
```

Everything else on the page (header, link/copy section, Hallazgos, Observaciones, PDF/resend buttons) is unchanged.

- [ ] **Step 2: Type-check and lint**

Run: `npm run lint`
Expected: no new errors in `src/app/(app)/(admin)/maintenance/[id]/`

- [ ] **Step 3: Manual verification**

Create one Preventivo and one Correctivo record from the list page, open each detail page, and confirm the Preventivo one still shows the 10-item checklist and the Correctivo one shows the 4 labeled fields (empty as "-" until the public form is filled in).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/\(admin\)/maintenance/\[id\]/page.tsx
git commit -m "feat: branch the maintenance detail page by type"
```

---

## Task 7: Public form — allow saving Correctivo fields

**Files:**
- Modify: `src/app/mantenimiento/[token]/actions.ts`
- Test: `src/app/mantenimiento/[token]/actions.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/app/mantenimiento/[token]/actions.test.ts`, add a new `it` inside `describe("saveMaintenanceProgress", ...)`:

```typescript
  it("updates correctivo fields for a pendiente record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente" } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveMaintenanceProgress("token-1", {
      problema_reportado: "No enciende",
      diagnostico: "Fuente de poder dañada",
    });

    expect(result.error).toBeUndefined();
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({
      problema_reportado: "No enciende",
      diagnostico: "Fuente de poder dañada",
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/mantenimiento/\[token\]/actions.test.ts`
Expected: FAIL — TypeScript error / `pickAllowedProgressFields` strips `problema_reportado` and `diagnostico` because they aren't yet allowed keys, so `updateMock` is called with `{}` instead

- [ ] **Step 3: Update the implementation**

In `src/app/mantenimiento/[token]/actions.ts`, add the import and extend the type + allowlist:

```typescript
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";
```

```typescript
export interface MaintenanceProgressInput {
  host_name?: string;
  ram?: string;
  os?: string;
  storage_total?: string;
  storage_used?: string;
  storage_free?: string;
  findings?: string;
  observations?: string;
  restore_point_created?: boolean;
  temp_files_cleaned?: boolean;
  disk_defragmented?: boolean;
  antivirus_updated?: boolean;
  windows_updated?: boolean;
  agenda_installed?: boolean;
  apps_match_profile?: boolean;
  wallpaper_installed?: boolean;
  keyboard_cleaned?: boolean;
  screen_cleaned?: boolean;
  problema_reportado?: string;
  diagnostico?: string;
  solucion_aplicada?: string;
  repuestos_piezas?: string;
}
```

```typescript
const ALLOWED_PROGRESS_FIELDS = [
  "host_name",
  "ram",
  "os",
  "storage_total",
  "storage_used",
  "storage_free",
  "findings",
  "observations",
  ...MAINTENANCE_CHECKLIST_ITEMS.map((item) => item.key),
  ...MAINTENANCE_CORRECTIVO_FIELDS.map((field) => field.key),
] as const satisfies readonly (keyof MaintenanceProgressInput)[];
```

Nothing else in the file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/mantenimiento/\[token\]/actions.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/app/mantenimiento/\[token\]/actions.ts src/app/mantenimiento/\[token\]/actions.test.ts
git commit -m "feat: allow saving Correctivo fields through the public maintenance form"
```

---

## Task 8: Public form UI branches by type

**Files:**
- Modify: `src/app/mantenimiento/[token]/MaintenanceForm.tsx`
- Modify: `src/app/mantenimiento/[token]/page.tsx`

No test file exists for `MaintenanceForm.tsx`/`page.tsx` today (client form + page, exercised manually per the existing module's precedent). This task is implementation-only.

- [ ] **Step 1: Add `type` to the record interface and initialize Correctivo fields**

In `src/app/mantenimiento/[token]/MaintenanceForm.tsx`, add the import:

```typescript
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";
```

Update the interface and state initializer:

```typescript
export interface MaintenanceFormRecord extends MaintenanceProgressInput {
  type: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company_name: string | null;
  department_name: string | null;
  email: string | null;
}

export function MaintenanceForm({ token, record }: { token: string; record: MaintenanceFormRecord }) {
  const router = useRouter();
  const [fields, setFields] = useState<MaintenanceProgressInput>({
    host_name: record.host_name ?? "",
    ram: record.ram ?? "",
    os: record.os ?? "",
    storage_total: record.storage_total ?? "",
    storage_used: record.storage_used ?? "",
    storage_free: record.storage_free ?? "",
    findings: record.findings ?? "",
    observations: record.observations ?? "",
    ...Object.fromEntries(MAINTENANCE_CHECKLIST_ITEMS.map((item) => [item.key, record[item.key]])),
    ...Object.fromEntries(
      MAINTENANCE_CORRECTIVO_FIELDS.map((field) => [field.key, record[field.key] ?? ""]),
    ),
  });
```

- [ ] **Step 2: Replace the checklist section with a type branch**

Replace the `"Checklist de Mantenimiento"` `<section>` in the same file with:

```tsx
      {record.type === "correctivo" ? (
        <section className="space-y-2">
          <h2 className="font-medium">Diagnóstico y Solución</h2>
          {MAINTENANCE_CORRECTIVO_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-sm text-muted-foreground">{field.label}</label>
              <textarea
                className="w-full rounded-md border p-2 text-sm"
                rows={2}
                value={(fields[field.key as keyof MaintenanceProgressInput] as string) ?? ""}
                onChange={(e) => setText(field.key as keyof MaintenanceProgressInput, e.target.value)}
              />
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="font-medium">Checklist de Mantenimiento</h2>
          <div className="space-y-1">
            {MAINTENANCE_CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(fields[item.key as keyof MaintenanceProgressInput])}
                  onChange={(e) => setChecklist(item.key, e.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </section>
      )}
```

Everything else in the form (user info, equipment info, findings, observations, save button) is unchanged.

- [ ] **Step 3: Show the right title on the public page**

In `src/app/mantenimiento/[token]/page.tsx`, update the title in the vigente-token render branch:

```tsx
      <div>
        <h1 className="text-xl font-semibold">
          Formulario de Mantenimiento {record.type === "correctivo" ? "Correctivo" : "Preventivo"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Completa la información y firma para finalizar.
        </p>
      </div>
```

`FullRecord` already extends `MaintenanceFormRecord`, which now requires `type` — since `loadMaintenanceRecordByToken` selects `*`, no query changes are needed; `type` arrives automatically once Task 1's migration has run.

- [ ] **Step 4: Type-check and lint**

Run: `npm run lint`
Expected: no new errors in `src/app/mantenimiento/[token]/`

- [ ] **Step 5: Manual verification**

Open the public link for a Correctivo record created in Task 5's manual check. Confirm the page title says "Formulario de Mantenimiento Correctivo", the equipment section still appears, the checklist is replaced by the 4 Correctivo textareas, and "Guardar progreso" persists them (reload the page and confirm the values are still there).

- [ ] **Step 6: Commit**

```bash
git add src/app/mantenimiento/\[token\]/MaintenanceForm.tsx src/app/mantenimiento/\[token\]/page.tsx
git commit -m "feat: branch the public maintenance form by type"
```

---

## Task 9: PDF report branches by type

**Files:**
- Modify: `src/lib/maintenancePdfReport.ts`
- Test: `src/lib/maintenancePdfReport.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/maintenancePdfReport.test.ts`, update every existing call to `buildMaintenancePdfBytes` to include the two new required fields (`type: "preventivo"`, `correctivo: []`) alongside the existing `checklist` array — for example, the first test in `describe("buildMaintenancePdfBytes", ...)` becomes:

```typescript
    const bytes = await buildMaintenancePdfBytes(
      {
        type: "preventivo",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        email: "ana@example.com",
        hostName: "DESKTOP-ANA",
        ram: "16 GB",
        os: "Windows 11",
        storageTotal: "512 GB",
        storageUsed: "200 GB",
        storageFree: "312 GB",
        checklist: [
          { label: "Punto de restauración creado", value: true },
          { label: "Limpieza de archivos temporales", value: false },
        ],
        correctivo: [],
        findings: "Ninguno",
        observations: "Ninguna",
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );
```

Apply the same two additions to the other three existing `buildMaintenancePdfBytes` call sites in this file — each keeps its existing `checklist` array and other fields as-is, just gaining `type: "preventivo"` and `correctivo: []`.

In the `"paginates onto a new page instead of silently clipping long content"` test:

```typescript
    const bytes = await buildMaintenancePdfBytes(
      {
        type: "preventivo",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        email: "ana@example.com",
        hostName: "DESKTOP-ANA",
        ram: "16 GB",
        os: "Windows 11",
        storageTotal: "512 GB",
        storageUsed: "200 GB",
        storageFree: "312 GB",
        checklist: [
          { label: "Punto de restauración creado", value: true },
          { label: "Limpieza de archivos temporales", value: false },
        ],
        correctivo: [],
        findings: longText,
        observations: longText,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );
```

In the `"embeds a valid PNG logo in the header without breaking the report"` test:

```typescript
    const bytes = await buildMaintenancePdfBytes(
      {
        type: "preventivo",
        firstName: "Ana",
        lastName: "García",
        position: null,
        companyName: null,
        departmentName: null,
        email: null,
        hostName: null,
        ram: null,
        os: null,
        storageTotal: null,
        storageUsed: null,
        storageFree: null,
        checklist: [{ label: "Punto de restauración creado", value: true }],
        correctivo: [],
        findings: null,
        observations: null,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
      pngBytes,
    );
```

In the `"does not throw when logoBytes is not a supported image format"` test:

```typescript
    const bytes = await buildMaintenancePdfBytes(
      {
        type: "preventivo",
        firstName: "Ana",
        lastName: "García",
        position: null,
        companyName: null,
        departmentName: null,
        email: null,
        hostName: null,
        ram: null,
        os: null,
        storageTotal: null,
        storageUsed: null,
        storageFree: null,
        checklist: [{ label: "Punto de restauración creado", value: true }],
        correctivo: [],
        findings: null,
        observations: null,
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
      notAnImage,
    );
```

Then add a new test at the end of the `describe("buildMaintenancePdfBytes", ...)` block:

```typescript
  it("renders the Correctivo fields instead of a checklist when type is correctivo", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );

    const bytes = await buildMaintenancePdfBytes(
      {
        type: "correctivo",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        email: "ana@example.com",
        hostName: "DESKTOP-ANA",
        ram: "16 GB",
        os: "Windows 11",
        storageTotal: "512 GB",
        storageUsed: "200 GB",
        storageFree: "312 GB",
        checklist: [],
        correctivo: [
          { label: "Problema reportado", value: "No enciende" },
          { label: "Diagnóstico", value: "Fuente de poder dañada" },
          { label: "Solución aplicada", value: "Se reemplazó la fuente" },
          { label: "Repuestos/piezas usadas", value: "Fuente 500W" },
        ],
        findings: "Ninguno",
        observations: "Ninguna",
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes, userPng: pngBytes },
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenancePdfReport.test.ts`
Expected: FAIL — TypeScript errors (`type`/`correctivo` don't exist on `MaintenanceRecordForPdf`) and the correctivo test throws or mis-renders since the builder doesn't branch yet

- [ ] **Step 3: Update the implementation**

In `src/lib/maintenancePdfReport.ts`, add `type` to the cursor so header/continuation text can read it without extra parameters:

```typescript
interface PdfCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  type: "preventivo" | "correctivo";
}
```

Update `drawContinuationHeader` to use it:

```typescript
function drawContinuationHeader(cursor: PdfCursor): void {
  const y = PAGE_HEIGHT - CONTINUATION_HEADER_HEIGHT;
  const label =
    cursor.type === "correctivo"
      ? "Formulario de Mantenimiento Correctivo (continuación)"
      : "Formulario de Mantenimiento Preventivo (continuación)";
  cursor.page.drawText(label, {
    x: MARGIN,
    y: y + 8,
    size: 9,
    font: cursor.font,
    color: MUTED_COLOR,
  });
  cursor.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.75,
    color: LINE_COLOR,
  });
}
```

Update `MaintenanceRecordForPdf`:

```typescript
export interface MaintenanceRecordForPdf {
  type: "preventivo" | "correctivo";
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string | null;
  departmentName: string | null;
  email: string | null;
  hostName: string | null;
  ram: string | null;
  os: string | null;
  storageTotal: string | null;
  storageUsed: string | null;
  storageFree: string | null;
  checklist: { label: string; value: boolean | null }[];
  correctivo: { label: string; value: string | null }[];
  findings: string | null;
  observations: string | null;
  completedAt: Date;
}
```

Update `drawHeader` to read the title from `cursor.type` instead of hardcoding it:

```typescript
function drawHeader(cursor: PdfCursor, logo: Awaited<ReturnType<typeof embedLogoImage>>, completedAt: Date): void {
  const topY = PAGE_HEIGHT - MARGIN;
  let nameY = topY - 10;

  if (logo) {
    const { width, height } = logo.scaleToFit(44, 44);
    cursor.page.drawImage(logo, { x: MARGIN, y: topY - height, width, height });
    nameY = topY - height - 12;
    cursor.page.drawText("Gente Sánchez Business", {
      x: MARGIN,
      y: nameY,
      size: 8,
      font: cursor.font,
      color: MUTED_COLOR,
    });
  } else {
    cursor.page.drawText("Gente Sánchez Business", {
      x: MARGIN,
      y: nameY,
      size: 10,
      font: cursor.bold,
      color: TEXT_COLOR,
    });
    nameY -= 14;
  }

  const genLabel = "Generado el:";
  const genValue = formatDisplayDate(completedAt);
  const labelWidth = cursor.font.widthOfTextAtSize(genLabel, 9);
  const valueWidth = cursor.font.widthOfTextAtSize(genValue, 9);
  cursor.page.drawText(genLabel, { x: PAGE_WIDTH - MARGIN - labelWidth, y: topY - 2, size: 9, font: cursor.font, color: MUTED_COLOR });
  cursor.page.drawText(genValue, { x: PAGE_WIDTH - MARGIN - valueWidth, y: topY - 14, size: 9, font: cursor.font, color: MUTED_COLOR });

  const titleY = nameY - 24;
  const title =
    cursor.type === "correctivo"
      ? "FORMULARIO DE MANTENIMIENTO CORRECTIVO"
      : "FORMULARIO DE MANTENIMIENTO PREVENTIVO";
  const titleWidth = cursor.bold.widthOfTextAtSize(title, 14);
  cursor.page.drawText(title, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y: titleY,
    size: 14,
    font: cursor.bold,
    color: TEXT_COLOR,
  });

  const ruleY = titleY - 16;
  cursor.page.drawLine({ start: { x: MARGIN, y: ruleY }, end: { x: PAGE_WIDTH - MARGIN, y: ruleY }, thickness: 1, color: LINE_COLOR });
  cursor.y = ruleY - 20;
}
```

Update `buildMaintenancePdfBytes` to construct the cursor with `type` and branch the checklist/correctivo section:

```typescript
export async function buildMaintenancePdfBytes(
  record: MaintenanceRecordForPdf,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
  logoBytes?: Uint8Array | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes ? await embedLogoImage(doc, logoBytes) : null;

  const cursor: PdfCursor = { doc, page, y: PAGE_HEIGHT - MARGIN, font, bold, type: record.type };
  drawHeader(cursor, logo, record.completedAt);

  const userInfoRows: [string, string][] = [
    ["Nombre", `${record.firstName} ${record.lastName}`],
    ["Posición", record.position ?? "-"],
    ["Empresa", record.companyName ?? "-"],
    ["Departamento", record.departmentName ?? "-"],
    ["Correo", record.email ?? "-"],
  ];
  const equipmentRows: [string, string][] = [
    ["Nombre del Host", record.hostName ?? "-"],
    ["Memoria RAM", record.ram ?? "-"],
    ["Sistema Operativo", record.os ?? "-"],
    ["Almacenamiento Total", record.storageTotal ?? "-"],
    ["Almacenamiento Utilizado", record.storageUsed ?? "-"],
    ["Almacenamiento Libre", record.storageFree ?? "-"],
  ];
  drawInfoTable(cursor, "Información del Usuario", userInfoRows);
  drawInfoTable(cursor, "Información del Equipo", equipmentRows);

  if (record.type === "correctivo") {
    const correctivoRows: [string, string][] = record.correctivo.map((f) => [f.label, f.value || "-"]);
    drawInfoTable(cursor, "Diagnóstico y Solución", correctivoRows);
  } else {
    const checklistCols = splitInHalf(record.checklist);
    drawChecklistTable(cursor, checklistCols);
  }

  drawFlowingParagraph(cursor, "Hallazgos", record.findings || "Ninguno");
  drawFlowingParagraph(cursor, "Observaciones", record.observations || "Ninguna");

  ensureSpace(cursor, 110);
  await drawSignatures(cursor, signatures, record.completedAt);

  drawFooters(doc, font);

  return doc.save();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenancePdfReport.test.ts`
Expected: PASS (all tests, including the new Correctivo one)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenancePdfReport.ts src/lib/maintenancePdfReport.test.ts
git commit -m "feat: render a Diagnóstico y Solución section in Correctivo PDFs"
```

---

## Task 10: `completeMaintenanceRecord` wires type + Correctivo fields into the PDF

**Files:**
- Modify: `src/lib/completeMaintenanceRecord.ts`
- Test: `src/lib/completeMaintenanceRecord.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/completeMaintenanceRecord.test.ts`, add `type: "preventivo"` and null Correctivo fields to `BASE_RECORD`:

```typescript
const BASE_RECORD = {
  id: "record-1",
  created_by: "tech-1",
  type: "preventivo",
  first_name: "Ana",
  last_name: "García",
  position: "Analista",
  company_name: "Sanchez Business Corp",
  department_name: "TI",
  email: "ana@example.com",
  host_name: "DESKTOP-ANA",
  ram: "16 GB",
  os: "Windows 11",
  storage_total: "512 GB",
  storage_used: "200 GB",
  storage_free: "312 GB",
  problema_reportado: null,
  diagnostico: null,
  solucion_aplicada: null,
  repuestos_piezas: null,
  findings: null,
  observations: null,
  technician_signature_path: "record-1/tecnico.png",
  user_signature_path: "record-1/usuario.png",
  restore_point_created: true,
  temp_files_cleaned: true,
  disk_defragmented: null,
  antivirus_updated: null,
  windows_updated: null,
  agenda_installed: null,
  apps_match_profile: null,
  wallpaper_installed: null,
  keyboard_cleaned: null,
  screen_cleaned: null,
};
```

Then add a new test at the end of `describe("completeMaintenanceRecord", ...)`:

```typescript
  it("builds the PDF with the Correctivo fields and an empty checklist when type is correctivo", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await completeMaintenanceRecord({
      ...BASE_RECORD,
      type: "correctivo",
      problema_reportado: "No enciende",
      diagnostico: "Fuente de poder dañada",
      solucion_aplicada: "Se reemplazó la fuente",
      repuestos_piezas: "Fuente 500W",
    } as never);

    expect(buildMaintenancePdfBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "correctivo",
        checklist: [],
        correctivo: [
          { label: "Problema reportado", value: "No enciende" },
          { label: "Diagnóstico", value: "Fuente de poder dañada" },
          { label: "Solución aplicada", value: "Se reemplazó la fuente" },
          { label: "Repuestos/piezas usadas", value: "Fuente 500W" },
        ],
      }),
      expect.anything(),
      expect.anything(),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/completeMaintenanceRecord.test.ts`
Expected: FAIL — `buildMaintenancePdfBytes` is still called with the Preventivo checklist regardless of `type`, and without a `correctivo` field at all

- [ ] **Step 3: Update the implementation**

In `src/lib/completeMaintenanceRecord.ts`, add the import:

```typescript
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";
```

Update the interface:

```typescript
export interface MaintenanceRecordForCompletion {
  id: string;
  created_by: string;
  type: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company_name: string | null;
  department_name: string | null;
  email: string | null;
  host_name: string | null;
  ram: string | null;
  os: string | null;
  storage_total: string | null;
  storage_used: string | null;
  storage_free: string | null;
  problema_reportado: string | null;
  diagnostico: string | null;
  solucion_aplicada: string | null;
  repuestos_piezas: string | null;
  findings: string | null;
  observations: string | null;
  technician_signature_path: string;
  user_signature_path: string;
  [checklistKey: string]: unknown;
}
```

Update the `buildMaintenancePdfBytes` call inside `completeMaintenanceRecord`:

```typescript
  const pdfBytes = await buildMaintenancePdfBytes(
    {
      type: record.type === "correctivo" ? "correctivo" : "preventivo",
      firstName: record.first_name,
      lastName: record.last_name,
      position: record.position,
      companyName: record.company_name,
      departmentName: record.department_name,
      email: record.email,
      hostName: record.host_name,
      ram: record.ram,
      os: record.os,
      storageTotal: record.storage_total,
      storageUsed: record.storage_used,
      storageFree: record.storage_free,
      checklist:
        record.type === "correctivo"
          ? []
          : MAINTENANCE_CHECKLIST_ITEMS.map((item) => ({
              label: item.label,
              value: (record[item.key] as boolean | null) ?? null,
            })),
      correctivo:
        record.type === "correctivo"
          ? MAINTENANCE_CORRECTIVO_FIELDS.map((field) => ({
              label: field.label,
              value: (record[field.key] as string | null) ?? null,
            }))
          : [],
      findings: record.findings,
      observations: record.observations,
      completedAt,
    },
    { technicianPng, userPng },
    logoBytes,
  );
```

Nothing else in the file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/completeMaintenanceRecord.test.ts`
Expected: PASS (all tests, including the new Correctivo one)

- [ ] **Step 5: Commit**

```bash
git add src/lib/completeMaintenanceRecord.ts src/lib/completeMaintenanceRecord.test.ts
git commit -m "feat: pass type and Correctivo fields into PDF generation on completion"
```

---

## Task 11: CSV reports include type and Correctivo columns

**Files:**
- Modify: `src/lib/maintenanceReportCsv.ts`
- Test: `src/lib/maintenanceReportCsv.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/lib/maintenanceReportCsv.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { buildMaintenanceBasicCsv, buildMaintenanceDetailedCsv, type MaintenanceReportRow } from "./maintenanceReportCsv";

const CHECKLIST_ITEMS = [
  { key: "restore_point_created", label: "Punto de restauración creado" },
  { key: "temp_files_cleaned", label: "Limpieza de archivos temporales" },
];

const CORRECTIVO_FIELDS = [
  { key: "problema_reportado", label: "Problema reportado" },
  { key: "diagnostico", label: "Diagnóstico" },
];

function baseRow(overrides: Partial<MaintenanceReportRow> = {}): MaintenanceReportRow {
  return {
    type: "preventivo",
    first_name: "Ana",
    last_name: "García",
    company_name: "Sanchez Business Corp",
    department_name: "TI",
    technician_name: "Luis Pérez",
    status: "completado",
    created_at: "2026-07-28T10:00:00+00:00",
    completed_at: "2026-07-28T11:00:00+00:00",
    email: "ana@example.com",
    position: "Analista",
    host_name: "DESKTOP-ANA",
    ram: "16 GB",
    os: "Windows 11",
    storage_total: "512 GB",
    storage_used: "200 GB",
    storage_free: "312 GB",
    checklist: { restore_point_created: true, temp_files_cleaned: false },
    correctivo: { problema_reportado: null, diagnostico: null },
    findings: "Ninguno",
    observations: "Ninguna",
    technician_signed_at: "2026-07-28T10:50:00+00:00",
    user_signed_at: "2026-07-28T11:00:00+00:00",
    survey_completed: true,
    quality_score: 5,
    professionalism_score: 4,
    clarity_score: 5,
    satisfaction_score: 5,
    survey_comments: "Muy bien",
    ...overrides,
  };
}

describe("buildMaintenanceBasicCsv", () => {
  it("includes exactly the requested columns in order, with type", () => {
    const csv = buildMaintenanceBasicCsv([baseRow()]);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Usuario,Tipo,Empresa,Técnico,Estado,Fecha de creación,Departamento,Encuesta completada");
    expect(lines[1]).toBe(
      "Ana García,Preventivo,Sanchez Business Corp,Luis Pérez,Completado,2026-07-28T10:00:00+00:00,TI,Sí",
    );
  });

  it("shows the Correctivo label for a correctivo row", () => {
    const csv = buildMaintenanceBasicCsv([baseRow({ type: "correctivo" })]);
    expect(csv.split("\r\n")[1]).toContain("Correctivo");
  });

  it("shows 'No' when the survey has not been completed", () => {
    const csv = buildMaintenanceBasicCsv([baseRow({ survey_completed: false })]);
    expect(csv.split("\r\n")[1]).toContain(",No");
  });

  it("returns just the header when there are no rows", () => {
    expect(buildMaintenanceBasicCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("buildMaintenanceDetailedCsv", () => {
  it("includes equipment, checklist, correctivo, findings, signatures, and survey columns", () => {
    const csv = buildMaintenanceDetailedCsv([baseRow()], CHECKLIST_ITEMS, CORRECTIVO_FIELDS);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      [
        "Usuario",
        "Tipo",
        "Correo",
        "Posición",
        "Empresa",
        "Departamento",
        "Técnico",
        "Estado",
        "Fecha de creación",
        "Fecha de completado",
        "Nombre del Host",
        "Memoria RAM",
        "Sistema Operativo",
        "Almacenamiento Total",
        "Almacenamiento Utilizado",
        "Almacenamiento Libre",
        "Punto de restauración creado",
        "Limpieza de archivos temporales",
        "Problema reportado",
        "Diagnóstico",
        "Hallazgos",
        "Observaciones",
        "Firma Técnico",
        "Firma Usuario",
        "Encuesta completada",
        "Calidad",
        "Profesionalismo",
        "Claridad",
        "Satisfacción",
        "Comentarios de encuesta",
      ].join(","),
    );
    expect(lines[1]).toBe(
      "Ana García,Preventivo,ana@example.com,Analista,Sanchez Business Corp,TI,Luis Pérez,Completado,2026-07-28T10:00:00+00:00,2026-07-28T11:00:00+00:00,DESKTOP-ANA,16 GB,Windows 11,512 GB,200 GB,312 GB,Sí,No,,,Ninguno,Ninguna,2026-07-28T10:50:00+00:00,2026-07-28T11:00:00+00:00,Sí,5,4,5,5,Muy bien",
    );
  });

  it("fills the correctivo columns and leaves checklist columns as N/A for a correctivo row", () => {
    const csv = buildMaintenanceDetailedCsv(
      [
        baseRow({
          type: "correctivo",
          checklist: { restore_point_created: null, temp_files_cleaned: null },
          correctivo: { problema_reportado: "No enciende", diagnostico: "Fuente dañada" },
        }),
      ],
      CHECKLIST_ITEMS,
      CORRECTIVO_FIELDS,
    );
    const cells = csv.split("\r\n")[1]!.split(",");

    expect(cells).toContain("No enciende");
    expect(cells).toContain("Fuente dañada");
  });

  it("renders N/A for a null checklist value and empty fields for nulls", () => {
    const csv = buildMaintenanceDetailedCsv(
      [baseRow({ checklist: { restore_point_created: null, temp_files_cleaned: false }, findings: null, quality_score: null })],
      CHECKLIST_ITEMS,
      CORRECTIVO_FIELDS,
    );
    const cells = csv.split("\r\n")[1]!.split(",");
    expect(cells).toContain("N/A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceReportCsv.test.ts`
Expected: FAIL — `type`/`correctivo` don't exist on `MaintenanceReportRow`, `buildMaintenanceDetailedCsv` doesn't accept a third argument, headers don't include "Tipo"/Correctivo labels

- [ ] **Step 3: Update the implementation**

Replace `src/lib/maintenanceReportCsv.ts` with:

```typescript
export interface MaintenanceReportRow {
  type: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  department_name: string | null;
  technician_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  email: string | null;
  position: string | null;
  host_name: string | null;
  ram: string | null;
  os: string | null;
  storage_total: string | null;
  storage_used: string | null;
  storage_free: string | null;
  checklist: Record<string, boolean | null>;
  correctivo: Record<string, string | null>;
  findings: string | null;
  observations: string | null;
  technician_signed_at: string | null;
  user_signed_at: string | null;
  survey_completed: boolean;
  quality_score: number | null;
  professionalism_score: number | null;
  clarity_score: number | null;
  satisfaction_score: number | null;
  survey_comments: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

const TYPE_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};

function csvField(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function joinRow(fields: (string | number | boolean | null | undefined)[]): string {
  return fields.map(csvField).join(",");
}

function boolLabel(value: boolean | null): string {
  if (value === null || value === undefined) return "N/A";
  return value ? "Sí" : "No";
}

export function buildMaintenanceBasicCsv(rows: MaintenanceReportRow[]): string {
  const lines = [
    joinRow(["Usuario", "Tipo", "Empresa", "Técnico", "Estado", "Fecha de creación", "Departamento", "Encuesta completada"]),
  ];
  for (const r of rows) {
    lines.push(
      joinRow([
        `${r.first_name} ${r.last_name}`,
        TYPE_LABEL[r.type] ?? r.type,
        r.company_name,
        r.technician_name,
        STATUS_LABEL[r.status] ?? r.status,
        r.created_at,
        r.department_name,
        r.survey_completed ? "Sí" : "No",
      ]),
    );
  }
  return lines.join("\r\n");
}

export function buildMaintenanceDetailedCsv(
  rows: MaintenanceReportRow[],
  checklistItems: readonly { key: string; label: string }[],
  correctivoFields: readonly { key: string; label: string }[],
): string {
  const header = [
    "Usuario",
    "Tipo",
    "Correo",
    "Posición",
    "Empresa",
    "Departamento",
    "Técnico",
    "Estado",
    "Fecha de creación",
    "Fecha de completado",
    "Nombre del Host",
    "Memoria RAM",
    "Sistema Operativo",
    "Almacenamiento Total",
    "Almacenamiento Utilizado",
    "Almacenamiento Libre",
    ...checklistItems.map((i) => i.label),
    ...correctivoFields.map((f) => f.label),
    "Hallazgos",
    "Observaciones",
    "Firma Técnico",
    "Firma Usuario",
    "Encuesta completada",
    "Calidad",
    "Profesionalismo",
    "Claridad",
    "Satisfacción",
    "Comentarios de encuesta",
  ];
  const lines = [joinRow(header)];
  for (const r of rows) {
    lines.push(
      joinRow([
        `${r.first_name} ${r.last_name}`,
        TYPE_LABEL[r.type] ?? r.type,
        r.email,
        r.position,
        r.company_name,
        r.department_name,
        r.technician_name,
        STATUS_LABEL[r.status] ?? r.status,
        r.created_at,
        r.completed_at,
        r.host_name,
        r.ram,
        r.os,
        r.storage_total,
        r.storage_used,
        r.storage_free,
        ...checklistItems.map((i) => boolLabel(r.checklist[i.key] ?? null)),
        ...correctivoFields.map((f) => r.correctivo[f.key] ?? ""),
        r.findings,
        r.observations,
        r.technician_signed_at,
        r.user_signed_at,
        r.survey_completed ? "Sí" : "No",
        r.quality_score,
        r.professionalism_score,
        r.clarity_score,
        r.satisfaction_score,
        r.survey_comments,
      ]),
    );
  }
  return lines.join("\r\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceReportCsv.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceReportCsv.ts src/lib/maintenanceReportCsv.test.ts
git commit -m "feat: add type and Correctivo columns to maintenance CSV reports"
```

---

## Task 12: Export routes filter by type/year and populate the new columns

**Files:**
- Modify: `src/app/(app)/(admin)/maintenance/export/basic/route.ts`
- Create: `src/app/(app)/(admin)/maintenance/export/basic/route.test.ts`
- Modify: `src/app/(app)/(admin)/maintenance/export/detailed/route.ts`
- Create: `src/app/(app)/(admin)/maintenance/export/detailed/route.test.ts`

These routes have no existing tests to extend, but the spec calls for unit coverage of the new type/year filtering, so this task adds test files following the `GET(request: NextRequest)` pattern already used in `src/app/auth/confirm/route.test.ts`.

- [ ] **Step 1: Write the failing test for the basic export route**

Create `src/app/(app)/(admin)/maintenance/export/basic/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

function mockSupabase({
  canView = true,
  records = [] as unknown[],
}: { canView?: boolean; records?: unknown[] } = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.lt = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockResolvedValue({ data: records });

  return {
    rpc: vi.fn().mockResolvedValue({ data: [{ can_view: canView }] }),
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /maintenance/export/basic", () => {
  it("rejects callers without can_view on the maintenance module", async () => {
    const supabase = mockSupabase({ canView: false });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/basic"));

    expect(response.status).toBe(403);
  });

  it("does not filter the query when type/year are absent", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/basic"));

    expect(supabase._builder.eq).not.toHaveBeenCalled();
    expect(supabase._builder.gte).not.toHaveBeenCalled();
  });

  it("filters by type and year when both are present", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/basic?type=correctivo&year=2026"));

    expect(supabase._builder.eq).toHaveBeenCalledWith("type", "correctivo");
    expect(supabase._builder.gte).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00.000Z");
    expect(supabase._builder.lt).toHaveBeenCalledWith("created_at", "2027-01-01T00:00:00.000Z");
  });

  it("returns a CSV with the Tipo column populated", async () => {
    const supabase = mockSupabase({
      records: [
        {
          type: "correctivo",
          first_name: "Ana",
          last_name: "García",
          company_name: "Sanchez Business Corp",
          department_name: "TI",
          status: "completado",
          created_at: "2026-07-28T10:00:00+00:00",
          app_users: { full_name: "Luis Pérez", email: "luis@example.com" },
          maintenance_surveys: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/basic"));
    const csv = await response.text();

    expect(csv).toContain("Correctivo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/\(app\)/\(admin\)/maintenance/export/basic/route.test.ts`
Expected: FAIL — `route.ts`'s `GET` doesn't accept a `request` argument yet, so it never reads `type`/`year` or filters the query; the "Tipo" column doesn't exist in the CSV yet either

- [ ] **Step 3: Update the basic export route**

Replace `src/app/(app)/(admin)/maintenance/export/basic/route.ts` with:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMaintenanceBasicCsv, type MaintenanceReportRow } from "@/lib/maintenanceReportCsv";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const yearParam = url.searchParams.get("year");

  let query = supabase
    .from("maintenance_records")
    .select(
      "type, first_name, last_name, company_name, department_name, status, created_at, app_users(full_name, email), maintenance_surveys(status)",
    );
  if (typeParam === "preventivo" || typeParam === "correctivo") {
    query = query.eq("type", typeParam);
  }
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    const year = Number(yearParam);
    query = query.gte("created_at", `${year}-01-01T00:00:00.000Z`).lt("created_at", `${year + 1}-01-01T00:00:00.000Z`);
  }

  const { data: records } = await query.order("created_at", { ascending: false });

  const rows: MaintenanceReportRow[] = (records ?? []).map((r) => {
    const tech = r.app_users as unknown as { full_name: string | null; email: string } | null;
    const survey = r.maintenance_surveys as unknown as { status: string } | { status: string }[] | null;
    const surveyStatus = Array.isArray(survey) ? survey[0]?.status : survey?.status;
    return {
      type: r.type,
      first_name: r.first_name,
      last_name: r.last_name,
      company_name: r.company_name,
      department_name: r.department_name,
      technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
      status: r.status,
      created_at: r.created_at,
      completed_at: null,
      email: null,
      position: null,
      host_name: null,
      ram: null,
      os: null,
      storage_total: null,
      storage_used: null,
      storage_free: null,
      checklist: {},
      correctivo: {},
      findings: null,
      observations: null,
      technician_signed_at: null,
      user_signed_at: null,
      survey_completed: surveyStatus === "respondida",
      quality_score: null,
      professionalism_score: null,
      clarity_score: null,
      satisfaction_score: null,
      survey_comments: null,
    };
  });

  const csv = buildMaintenanceBasicCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mantenimientos-basico.csv"`,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/\(app\)/\(admin\)/maintenance/export/basic/route.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/\(admin\)/maintenance/export/basic/route.ts src/app/\(app\)/\(admin\)/maintenance/export/basic/route.test.ts
git commit -m "feat: filter the basic maintenance CSV export by type/year"
```

- [ ] **Step 6: Write the failing test for the detailed export route**

Create `src/app/(app)/(admin)/maintenance/export/detailed/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

function mockSupabase({
  canView = true,
  records = [] as unknown[],
}: { canView?: boolean; records?: unknown[] } = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.lt = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockResolvedValue({ data: records });

  return {
    rpc: vi.fn().mockResolvedValue({ data: [{ can_view: canView }] }),
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /maintenance/export/detailed", () => {
  it("rejects callers without can_view on the maintenance module", async () => {
    const supabase = mockSupabase({ canView: false });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/detailed"));

    expect(response.status).toBe(403);
  });

  it("filters by type and year when both are present", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/detailed?type=preventivo&year=2025"));

    expect(supabase._builder.eq).toHaveBeenCalledWith("type", "preventivo");
    expect(supabase._builder.gte).toHaveBeenCalledWith("created_at", "2025-01-01T00:00:00.000Z");
    expect(supabase._builder.lt).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00.000Z");
  });

  it("does not filter the query when type/year are absent", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/detailed"));

    expect(supabase._builder.eq).not.toHaveBeenCalled();
    expect(supabase._builder.gte).not.toHaveBeenCalled();
  });

  it("includes the Correctivo field values in the CSV for a correctivo record", async () => {
    const supabase = mockSupabase({
      records: [
        {
          type: "correctivo",
          first_name: "Ana",
          last_name: "García",
          email: "ana@example.com",
          position: "Analista",
          company_name: "Sanchez Business Corp",
          department_name: "TI",
          status: "completado",
          created_at: "2026-07-28T10:00:00+00:00",
          completed_at: "2026-07-28T11:00:00+00:00",
          host_name: "DESKTOP-ANA",
          ram: "16 GB",
          os: "Windows 11",
          storage_total: "512 GB",
          storage_used: "200 GB",
          storage_free: "312 GB",
          restore_point_created: null,
          temp_files_cleaned: null,
          disk_defragmented: null,
          antivirus_updated: null,
          windows_updated: null,
          agenda_installed: null,
          apps_match_profile: null,
          wallpaper_installed: null,
          keyboard_cleaned: null,
          screen_cleaned: null,
          problema_reportado: "No enciende",
          diagnostico: "Fuente dañada",
          solucion_aplicada: "Se reemplazó la fuente",
          repuestos_piezas: "Fuente 500W",
          findings: null,
          observations: null,
          technician_signed_at: null,
          user_signed_at: null,
          app_users: { full_name: "Luis Pérez", email: "luis@example.com" },
          maintenance_surveys: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/detailed"));
    const csv = await response.text();

    expect(csv).toContain("No enciende");
    expect(csv).toContain("Fuente dañada");
    expect(csv).toContain("Se reemplazó la fuente");
    expect(csv).toContain("Fuente 500W");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/app/\(app\)/\(admin\)/maintenance/export/detailed/route.test.ts`
Expected: FAIL — same reasons as the basic route: no `request` param read yet, and the Correctivo columns don't exist in the select/CSV yet

- [ ] **Step 8: Update the detailed export route**

Replace `src/app/(app)/(admin)/maintenance/export/detailed/route.ts` with:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMaintenanceDetailedCsv, type MaintenanceReportRow } from "@/lib/maintenanceReportCsv";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";

interface SurveyJoin {
  status: string;
  quality_score: number | null;
  professionalism_score: number | null;
  clarity_score: number | null;
  satisfaction_score: number | null;
  comments: string | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const yearParam = url.searchParams.get("year");

  let query = supabase
    .from("maintenance_records")
    .select(
      `type, first_name, last_name, email, position, company_name, department_name, status, created_at, completed_at,
       host_name, ram, os, storage_total, storage_used, storage_free,
       restore_point_created, temp_files_cleaned, disk_defragmented, antivirus_updated, windows_updated,
       agenda_installed, apps_match_profile, wallpaper_installed, keyboard_cleaned, screen_cleaned,
       problema_reportado, diagnostico, solucion_aplicada, repuestos_piezas,
       findings, observations, technician_signed_at, user_signed_at,
       app_users(full_name, email),
       maintenance_surveys(status, quality_score, professionalism_score, clarity_score, satisfaction_score, comments)`,
    );
  if (typeParam === "preventivo" || typeParam === "correctivo") {
    query = query.eq("type", typeParam);
  }
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    const year = Number(yearParam);
    query = query.gte("created_at", `${year}-01-01T00:00:00.000Z`).lt("created_at", `${year + 1}-01-01T00:00:00.000Z`);
  }

  const { data: records } = await query.order("created_at", { ascending: false });

  const rows: MaintenanceReportRow[] = (records ?? []).map((r) => {
    const tech = r.app_users as unknown as { full_name: string | null; email: string } | null;
    const surveyRaw = r.maintenance_surveys as unknown as SurveyJoin | SurveyJoin[] | null;
    const survey = Array.isArray(surveyRaw) ? surveyRaw[0] : surveyRaw;
    return {
      type: r.type,
      first_name: r.first_name,
      last_name: r.last_name,
      company_name: r.company_name,
      department_name: r.department_name,
      technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      email: r.email,
      position: r.position,
      host_name: r.host_name,
      ram: r.ram,
      os: r.os,
      storage_total: r.storage_total,
      storage_used: r.storage_used,
      storage_free: r.storage_free,
      checklist: {
        restore_point_created: r.restore_point_created,
        temp_files_cleaned: r.temp_files_cleaned,
        disk_defragmented: r.disk_defragmented,
        antivirus_updated: r.antivirus_updated,
        windows_updated: r.windows_updated,
        agenda_installed: r.agenda_installed,
        apps_match_profile: r.apps_match_profile,
        wallpaper_installed: r.wallpaper_installed,
        keyboard_cleaned: r.keyboard_cleaned,
        screen_cleaned: r.screen_cleaned,
      },
      correctivo: {
        problema_reportado: r.problema_reportado,
        diagnostico: r.diagnostico,
        solucion_aplicada: r.solucion_aplicada,
        repuestos_piezas: r.repuestos_piezas,
      },
      findings: r.findings,
      observations: r.observations,
      technician_signed_at: r.technician_signed_at,
      user_signed_at: r.user_signed_at,
      survey_completed: survey?.status === "respondida",
      quality_score: survey?.quality_score ?? null,
      professionalism_score: survey?.professionalism_score ?? null,
      clarity_score: survey?.clarity_score ?? null,
      satisfaction_score: survey?.satisfaction_score ?? null,
      survey_comments: survey?.comments ?? null,
    };
  });

  const csv = buildMaintenanceDetailedCsv(rows, MAINTENANCE_CHECKLIST_ITEMS, MAINTENANCE_CORRECTIVO_FIELDS);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mantenimientos-detallado.csv"`,
    },
  });
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/app/\(app\)/\(admin\)/maintenance/export/detailed/route.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 10: Manual verification**

With `npm run dev` running, visit `/maintenance` on the Correctivo tab and click "Reporte básico" / "Reporte detallado" — confirm the downloaded CSV's URL includes `?type=correctivo&year=<current year>` and contains only Correctivo rows with the "Tipo" column reading "Correctivo" and the Correctivo columns filled in. Switch to the Preventivo tab and re-download both reports, confirming they still include all historical Preventivo rows (unaffected by this change) with "Tipo" = "Preventivo" and the Correctivo columns blank.

- [ ] **Step 11: Run the full test suite**

Run: `npm run test`
Expected: PASS — every test in the repo, not just the maintenance module (confirms nothing outside this module's scope broke).

- [ ] **Step 12: Commit**

```bash
git add src/app/\(app\)/\(admin\)/maintenance/export/detailed/route.ts src/app/\(app\)/\(admin\)/maintenance/export/detailed/route.test.ts
git commit -m "feat: filter the detailed maintenance CSV export by type/year"
```

---

## Post-implementation

Once all 12 tasks are committed on `feature/preventive-maintenance`, this branch still needs the same merge-to-`main` decision as the rest of the Preventivo work it builds on — that's a separate, explicit step to take with the user, not part of this plan.
