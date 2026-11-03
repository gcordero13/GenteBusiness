# Solicitudes de permisos: resumen personal y filtro de búsqueda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add personal summary cards and a client-side search/filter bar to `/solicitudes/vacaciones`, per the approved spec at `docs/superpowers/specs/2026-11-03-solicitudes-dashboard-design.md`.

**Architecture:** Extract 4 pure calculation functions into `src/lib/vacationRequestSummary.ts` (unit-tested in isolation), a dumb presentational component `SolicitudesSummaryCards.tsx` that renders their output, and a new client component `SolicitudesTable.tsx` that owns the existing table JSX (moved as-is) plus new filter state. `page.tsx` keeps its existing data-fetching untouched and just wires the three pieces together.

**Tech Stack:** Next.js 16 App Router (server component page + client components), Supabase (no schema changes), Vitest, Bun.

---

## Important context for every task

- Repo: `C:\Users\gcordero\Documents\GitHub\GenteBusiness`. Bun only — use `bun`/`bunx`, never `npm`/`npx`/`node` (this machine has no `node.exe`).
- Work directly on `main`. No worktree.
- No database changes in this plan — every field used already exists on `vacation_requests` (shipped in the Fase 1 migration).
- Commit messages must end with exactly:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- This codebase has **no generated Supabase `Database` types** — `supabase.from("vacation_requests").select("*")` returns `any[]`. That's fine: the typed interfaces defined in this plan exist for the new files' own internal clarity and for the test files, not to add compile-time safety on the Supabase call site.
- There is **no shadcn `Card` component** in this codebase (`src/components/ui/` only has `avatar`, `badge`, `button`, `dialog`, `input`, `label`, `select`, `table`). Do not add one. The established "stat card" convention in this codebase is a plain `<div>` with Tailwind classes — see `src/app/(app)/ponchador/PonchadorDashboard.tsx` lines 95–131 (the `rounded-2xl border ... p-5` tiles in a `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`). Follow that exact pattern.
- The dropdown filters use the existing `@/components/ui/select` component (a `base-ui`-backed `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` set — **not** a native `<select>`). Follow the exact usage pattern already established in `src/app/(app)/quejas/ComplaintsFilterBar.tsx` and `src/app/(app)/goservices/GoservicesFilterBar.tsx` (an `ALL_VALUE = "__all__"` sentinel, `onValueChange={(value) => value && setX(value)}`, a function-as-children `SelectValue`).
- Color convention already established for vacaciones vs. permiso (see `ESTADO_BADGE_CLASSNAMES` in `src/app/(app)/ponchador/PonchadorDashboard.tsx:45-52`): vacaciones = `bg-blue-100 text-blue-700` (blue), permiso = `bg-orange-100 text-orange-700` (orange). Use `blue-*`/`orange-*` Tailwind shades for the matching summary cards' borders/backgrounds/icon colors (e.g. `border-blue-200 bg-blue-50 text-blue-600`), not the teal `#04B1AF` brand color used for the neutral/non-type-specific cards.

---

### Task 1: Pure summary calculation functions

**Files:**
- Create: `src/lib/vacationRequestSummary.ts`
- Create: `src/lib/vacationRequestSummary.test.ts`

This is the highest-value task — every card's correctness depends on these four functions being right. Write it TDD-style: tests first, watch them fail, then implement.

- [ ] **Step 1: Write the failing test file**

Create `src/lib/vacationRequestSummary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  countOwnRequestsInProgress,
  findNextApprovedVacationDate,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
  type VacationRequestSummaryRow,
} from "./vacationRequestSummary";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

function row(overrides: Partial<VacationRequestSummaryRow>): VacationRequestSummaryRow {
  return {
    id: "req-1",
    tipo: "vacaciones",
    status: "aprobado",
    date_from: "2026-11-10",
    date_to: "2026-11-14",
    days_requested: 5,
    requester_app_user_id: USER_ID,
    supervisor_app_user_id: OTHER_USER_ID,
    ...overrides,
  };
}

describe("countOwnRequestsInProgress", () => {
  it("returns 0 for an empty array", () => {
    expect(countOwnRequestsInProgress([], USER_ID)).toBe(0);
  });

  it("counts only the user's own pendiente_supervisor and pendiente_rrhh requests", () => {
    const requests = [
      row({ id: "a", status: "pendiente_supervisor" }),
      row({ id: "b", status: "pendiente_rrhh" }),
      row({ id: "c", status: "aprobado" }),
      row({ id: "d", status: "rechazado" }),
      row({ id: "e", status: "pendiente_supervisor", requester_app_user_id: OTHER_USER_ID }),
    ];

    expect(countOwnRequestsInProgress(requests, USER_ID)).toBe(2);
  });
});

describe("summarizeAwaitingMyApproval", () => {
  it("is not visible and counts 0 when the viewer is neither a supervisor nor can authorize", () => {
    const requests = [row({ status: "pendiente_rrhh" })];

    const result = summarizeAwaitingMyApproval(requests, USER_ID, false);

    expect(result).toEqual({ visible: false, count: 0 });
  });

  it("is visible with count 0 when canAuthorize is true but nothing is pending for RRHH", () => {
    const requests = [row({ status: "aprobado" })];

    const result = summarizeAwaitingMyApproval(requests, USER_ID, true);

    expect(result).toEqual({ visible: true, count: 0 });
  });

  it("is visible with count 0 when the viewer supervises someone but nothing is pending for them right now", () => {
    const requests = [row({ status: "aprobado", supervisor_app_user_id: USER_ID })];

    const result = summarizeAwaitingMyApproval(requests, USER_ID, false);

    expect(result).toEqual({ visible: true, count: 0 });
  });

  it("counts pendiente_supervisor rows where the viewer is the resolved supervisor", () => {
    const requests = [
      row({ id: "a", status: "pendiente_supervisor", supervisor_app_user_id: USER_ID }),
      row({ id: "b", status: "pendiente_supervisor", supervisor_app_user_id: OTHER_USER_ID }),
    ];

    expect(summarizeAwaitingMyApproval(requests, USER_ID, false)).toEqual({ visible: true, count: 1 });
  });

  it("counts pendiente_rrhh rows only when canAuthorize is true", () => {
    const requests = [
      row({ id: "a", status: "pendiente_rrhh" }),
      row({ id: "b", status: "pendiente_rrhh" }),
    ];

    expect(summarizeAwaitingMyApproval(requests, USER_ID, true)).toEqual({ visible: true, count: 2 });
    expect(summarizeAwaitingMyApproval(requests, USER_ID, false)).toEqual({ visible: false, count: 0 });
  });
});

describe("summarizeApprovedDaysForYear", () => {
  it("sums days_requested for approved vacaciones requests in the given year", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-01-05", days_requested: 5 }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-06-01", days_requested: 3 }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 8, permisoDias: 0 });
  });

  it("excludes a request from a different year (year-boundary check)", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2025-12-31", date_to: "2026-01-02", days_requested: 3 }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 0, permisoDias: 0 });
  });

  it("computes permiso days inclusively from date_from/date_to (not days_requested, which is null for these tipos)", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-03-01", date_to: "2026-03-01", days_requested: null }),
      row({ id: "b", tipo: "familiar", status: "aprobado", date_from: "2026-03-10", date_to: "2026-03-12", days_requested: null }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 0, permisoDias: 4 });
  });

  it("excludes requests that are not aprobado or not the viewer's own", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "pendiente_rrhh", date_from: "2026-01-05", days_requested: 5 }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-01-05", days_requested: 5, requester_app_user_id: OTHER_USER_ID }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 0, permisoDias: 0 });
  });
});

describe("findNextApprovedVacationDate", () => {
  const TODAY_ISO = "2026-11-03";

  it("returns null when there are no upcoming approved vacaciones", () => {
    expect(findNextApprovedVacationDate([], USER_ID, TODAY_ISO)).toBeNull();
  });

  it("excludes a vacation that already started or ended in the past", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-10-01", date_to: "2026-10-05" })];

    expect(findNextApprovedVacationDate(requests, USER_ID, TODAY_ISO)).toBeNull();
  });

  it("returns the nearest future approved vacaciones date_from among several", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-12-20" }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-11-15" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2027-01-10" }),
    ];

    expect(findNextApprovedVacationDate(requests, USER_ID, TODAY_ISO)).toBe("2026-11-15");
  });

  it("ignores a future request that isn't tipo vacaciones or isn't aprobado yet", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-11-15" }),
      row({ id: "b", tipo: "vacaciones", status: "pendiente_rrhh", date_from: "2026-11-20" }),
    ];

    expect(findNextApprovedVacationDate(requests, USER_ID, TODAY_ISO)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts`
Expected: FAIL — `Cannot find module './vacationRequestSummary'` (the implementation file doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/vacationRequestSummary.ts`**

```ts
export interface VacationRequestSummaryRow {
  id: string;
  tipo: string;
  status: string;
  date_from: string;
  date_to: string;
  days_requested: number | null;
  requester_app_user_id: string;
  supervisor_app_user_id: string;
}

export interface AwaitingApprovalSummary {
  visible: boolean;
  count: number;
}

export interface ApprovedDaysSummary {
  vacacionesDias: number;
  permisoDias: number;
}

// date_from/date_to are plain "YYYY-MM-DD" date strings (no time component),
// so this parses them as UTC calendar dates to avoid any local-timezone
// off-by-one when computing the inclusive day span.
function daysBetweenInclusive(dateFrom: string, dateTo: string): number {
  const [fy, fm, fd] = dateFrom.split("-").map(Number);
  const [ty, tm, td] = dateTo.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function countOwnRequestsInProgress(requests: VacationRequestSummaryRow[], userId: string): number {
  return requests.filter(
    (r) =>
      r.requester_app_user_id === userId &&
      (r.status === "pendiente_supervisor" || r.status === "pendiente_rrhh"),
  ).length;
}

// The "Por aprobar" card is visible whenever the viewer has any approval
// role at all - either they're resolved as someone's supervisor on at least
// one request (regardless of that request's current status), or they hold
// can_authorize (RRHH). It stays visible even when the current count is 0,
// since "0 pendientes" is still meaningful information for an approver -
// only a viewer with no approval role at all gets the card hidden entirely.
export function summarizeAwaitingMyApproval(
  requests: VacationRequestSummaryRow[],
  userId: string,
  canAuthorize: boolean,
): AwaitingApprovalSummary {
  const isSupervisorOfSomeone = requests.some((r) => r.supervisor_app_user_id === userId);
  const visible = canAuthorize || isSupervisorOfSomeone;
  const count = requests.filter(
    (r) =>
      (r.status === "pendiente_supervisor" && r.supervisor_app_user_id === userId) ||
      (r.status === "pendiente_rrhh" && canAuthorize),
  ).length;
  return { visible, count };
}

// Vacaciones days come from days_requested (always set for that tipo).
// The other 6 tipos never set days_requested - it's computed from the date
// range instead, inclusive of both endpoints.
export function summarizeApprovedDaysForYear(
  requests: VacationRequestSummaryRow[],
  userId: string,
  year: number,
): ApprovedDaysSummary {
  let vacacionesDias = 0;
  let permisoDias = 0;
  for (const r of requests) {
    if (r.requester_app_user_id !== userId || r.status !== "aprobado") continue;
    const requestYear = Number(r.date_from.slice(0, 4));
    if (requestYear !== year) continue;
    if (r.tipo === "vacaciones") {
      vacacionesDias += r.days_requested ?? 0;
    } else {
      permisoDias += daysBetweenInclusive(r.date_from, r.date_to);
    }
  }
  return { vacacionesDias, permisoDias };
}

// todayIso is a "YYYY-MM-DD" string so the "future" comparison is a plain
// string comparison (works correctly for ISO-formatted dates) rather than
// Date parsing with its timezone pitfalls.
export function findNextApprovedVacationDate(
  requests: VacationRequestSummaryRow[],
  userId: string,
  todayIso: string,
): string | null {
  const upcoming = requests
    .filter(
      (r) =>
        r.requester_app_user_id === userId &&
        r.tipo === "vacaciones" &&
        r.status === "aprobado" &&
        r.date_from > todayIso,
    )
    .map((r) => r.date_from)
    .sort();
  return upcoming[0] ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts`
Expected: PASS — 14 tests, 0 failures.

- [ ] **Step 5: Typecheck and lint**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bunx eslint src/lib/vacationRequestSummary.ts src/lib/vacationRequestSummary.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vacationRequestSummary.ts src/lib/vacationRequestSummary.test.ts
git commit -m "$(cat <<'EOF'
feat(solicitudes): add pure summary calculation functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Summary cards component

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx`

This is a dumb presentational component. It does **not** call any function from Task 1 — it takes their already-computed output as props. This keeps it trivially understandable and keeps all the business logic testable in one place (Task 1).

- [ ] **Step 1: Create the component**

```tsx
import { CalendarCheck, ClipboardCheck, Hourglass, Plane } from "lucide-react";
import type { ApprovedDaysSummary, AwaitingApprovalSummary } from "@/lib/vacationRequestSummary";

interface SolicitudesSummaryCardsProps {
  year: number;
  inProgressCount: number;
  approval: AwaitingApprovalSummary;
  approvedDays: ApprovedDaysSummary;
  nextVacationDate: string | null;
}

export function SolicitudesSummaryCards({
  year,
  inProgressCount,
  approval,
  approvedDays,
  nextVacationDate,
}: SolicitudesSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Hourglass className="size-4 text-[#04B1AF]" />
          Mis solicitudes en trámite
        </div>
        <p className="mt-2 text-2xl font-bold">{inProgressCount}</p>
      </div>

      {approval.visible && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ClipboardCheck className="size-4 text-orange-600" />
            Por aprobar
          </div>
          <p className="mt-2 text-2xl font-bold">{approval.count}</p>
        </div>
      )}

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <CalendarCheck className="size-4 text-blue-600" />
          Días aprobados ({year})
        </div>
        <div className="mt-2 flex gap-6">
          <div>
            <p className="text-2xl font-bold">{approvedDays.vacacionesDias}</p>
            <p className="text-xs text-muted-foreground">Vacaciones</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{approvedDays.permisoDias}</p>
            <p className="text-xs text-muted-foreground">Permisos</p>
          </div>
        </div>
      </div>

      {nextVacationDate && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Plane className="size-4 text-blue-600" />
            Próxima vacación
          </div>
          <p className="mt-2 text-sm font-medium">Tus vacaciones empiezan el {nextVacationDate}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit`
Expected: no errors (note: `page.tsx` isn't wired up yet, so this component isn't imported anywhere yet — that's fine, it's still valid standalone TypeScript).

Run: `bunx eslint "src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx"
git commit -m "$(cat <<'EOF'
feat(solicitudes): add presentational summary cards component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Extract the table into its own filterable client component

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx`
- Reference (read-only, do not modify in this task): `src/app/(app)/solicitudes/vacaciones/page.tsx` (current state — the table JSX you're extracting lives at lines 92–153; `TIPO_LABEL`/`STATUS_LABEL` live at lines 16–31)
- Reference (read-only): `src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx` (props are `{ requestId: string; role: "supervisor" | "rrhh"; signatures: SignatureWithUrl[]; tipo: string }` — unchanged)
- Reference (read-only, for the Select filter pattern): `src/app/(app)/quejas/ComplaintsFilterBar.tsx`

This task **extracts** existing behavior — it must not change what already renders for a given set of requests. Before marking this task done, verify every item in this checklist is preserved:

- [ ] `TIPO_LABEL` and `STATUS_LABEL` maps, with the exact same 7/4 entries.
- [ ] The "Ver documento" attachment link, shown only when `attachmentUrlByRequestId` has an entry for that row's id, with the exact same `text-xs text-[#04B1AF] hover:underline` styling.
- [ ] `isPendingSupervisorForMe` (`status === "pendiente_supervisor" && supervisor_app_user_id === userId`) and `isPendingRrhhForMe` (`status === "pendiente_rrhh" && canAuthorize`), and both `<VacationRequestActions>` renders gated on them.
- [ ] The `Badge` `variant` logic: `"default"` for `aprobado`, `"secondary"` for `rechazado`, `"outline"` otherwise.
- [ ] The empty state "No hay solicitudes todavía." when there are **no requests at all** (unfiltered).
- [ ] The new empty state "No hay solicitudes que coincidan con el filtro." when there are requests but the current filter matches none of them.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  personal: "Personal",
  familiar: "Familiar",
  medico: "Médico",
  perdida: "Pérdida",
  tramites: "Trámites",
  otro: "Otro",
};

const ALL_VALUE = "__all__";

export interface SolicitudRequestRow {
  id: string;
  first_name: string;
  last_name: string;
  tipo: string;
  period: string | null;
  date_from: string;
  date_to: string;
  status: string;
  supervisor_app_user_id: string;
}

interface SolicitudesTableProps {
  requests: SolicitudRequestRow[];
  attachmentUrlByRequestId: Record<string, string>;
  signatures: SignatureWithUrl[];
  userId: string;
  canAuthorize: boolean;
}

export function SolicitudesTable({
  requests,
  attachmentUrlByRequestId,
  signatures,
  userId,
  canAuthorize,
}: SolicitudesTableProps) {
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState(ALL_VALUE);
  const [estadoFilter, setEstadoFilter] = useState(ALL_VALUE);

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>;
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = requests.filter((r) => {
    if (tipoFilter !== ALL_VALUE && r.tipo !== tipoFilter) return false;
    if (estadoFilter !== ALL_VALUE && r.status !== estadoFilter) return false;
    if (normalizedSearch) {
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
      if (!fullName.includes(normalizedSearch)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por colaborador..."
          className="w-64"
        />
        <Select value={tipoFilter} onValueChange={(value) => value && setTipoFilter(value)}>
          <SelectTrigger className="w-48">
            <SelectValue>
              {(value: string) => (value === ALL_VALUE ? "Todos los tipos" : (TIPO_LABEL[value] ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estadoFilter} onValueChange={(value) => value && setEstadoFilter(value)}>
          <SelectTrigger className="w-56">
            <SelectValue>
              {(value: string) => (value === ALL_VALUE ? "Todos los estados" : (STATUS_LABEL[value] ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los estados</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes que coincidan con el filtro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const isPendingSupervisorForMe = r.status === "pendiente_supervisor" && r.supervisor_app_user_id === userId;
              const isPendingRrhhForMe = r.status === "pendiente_rrhh" && canAuthorize;
              const attachmentUrl = attachmentUrlByRequestId[r.id];
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.first_name} {r.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                      {attachmentUrl && (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#04B1AF] hover:underline"
                        >
                          Ver documento
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.period ?? "-"}</TableCell>
                  <TableCell>
                    {r.date_from} → {r.date_to}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "aprobado" ? "default" : r.status === "rechazado" ? "secondary" : "outline"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isPendingSupervisorForMe && (
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} tipo={r.tipo} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} tipo={r.tipo} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit`
Expected: no errors (page.tsx still has its own unused old table JSX at this point — that's fine, Task 4 removes it next; this file itself must be clean).

Run: `bunx eslint "src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx"
git commit -m "$(cat <<'EOF'
feat(solicitudes): extract table into a filterable client component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire it all together in `page.tsx`

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/page.tsx` (full current content shown below as the "before" — replace entirely with the "after")

**Before** (current full file):

```tsx
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  personal: "Personal",
  familiar: "Familiar",
  medico: "Médico",
  perdida: "Pérdida",
  tramites: "Trámites",
  otro: "Otro",
};

export default async function VacationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "solicitudes_vacaciones",
  });
  const canAuthorize = flagsRows?.[0]?.can_authorize ?? false;

  const { data: requests } = await supabase
    .from("vacation_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: signatureRows } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signatures: SignatureWithUrl[] = await Promise.all(
    (signatureRows ?? []).map(async (s) => {
      const { data, error } = await supabase.storage.from("user-signatures").createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for signature ${s.id} (${s.storage_path}):`, error.message);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  const attachmentUrlByRequestId = new Map<string, string>();
  const admin = createAdminClient();
  await Promise.all(
    (requests ?? [])
      .filter((r) => r.attachment_path)
      .map(async (r) => {
        const { data, error } = await admin.storage
          .from("vacation-request-attachments")
          .createSignedUrl(r.attachment_path, 14400);
        if (error) {
          console.error(`Failed to sign URL for attachment on request ${r.id}:`, error.message);
          return;
        }
        if (data?.signedUrl) attachmentUrlByRequestId.set(r.id, data.signedUrl);
      }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de permisos</h1>
        <NewVacationRequestDialog />
      </div>
      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>
      ) : (
        <Table>
          {/* ... full table JSX, now moved to SolicitudesTable.tsx ... */}
        </Table>
      )}
    </div>
  );
}
```

**After** (replace the entire file with this):

```tsx
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { SolicitudesSummaryCards } from "./SolicitudesSummaryCards";
import { SolicitudesTable } from "./SolicitudesTable";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import {
  countOwnRequestsInProgress,
  findNextApprovedVacationDate,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
} from "@/lib/vacationRequestSummary";

export default async function VacationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "solicitudes_vacaciones",
  });
  const canAuthorize = flagsRows?.[0]?.can_authorize ?? false;

  const { data: requests } = await supabase
    .from("vacation_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: signatureRows } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signatures: SignatureWithUrl[] = await Promise.all(
    (signatureRows ?? []).map(async (s) => {
      const { data, error } = await supabase.storage.from("user-signatures").createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for signature ${s.id} (${s.storage_path}):`, error.message);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  // Signed URLs for any request that has an attachment_path - same pattern
  // as the signatures above, just keyed by request id instead of signature
  // id since there's at most one attachment per request.
  const attachmentUrlByRequestId = new Map<string, string>();
  const admin = createAdminClient();
  await Promise.all(
    (requests ?? [])
      .filter((r) => r.attachment_path)
      .map(async (r) => {
        const { data, error } = await admin.storage
          .from("vacation-request-attachments")
          .createSignedUrl(r.attachment_path, 14400);
        if (error) {
          console.error(`Failed to sign URL for attachment on request ${r.id}:`, error.message);
          return;
        }
        if (data?.signedUrl) attachmentUrlByRequestId.set(r.id, data.signedUrl);
      }),
  );

  const today = new Date();
  const year = today.getFullYear();
  const todayIso = today.toISOString().slice(0, 10);

  const allRequests = requests ?? [];
  const inProgressCount = countOwnRequestsInProgress(allRequests, user!.id);
  const approval = summarizeAwaitingMyApproval(allRequests, user!.id, canAuthorize);
  const approvedDays = summarizeApprovedDaysForYear(allRequests, user!.id, year);
  const nextVacationDate = findNextApprovedVacationDate(allRequests, user!.id, todayIso);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de permisos</h1>
        <NewVacationRequestDialog />
      </div>
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        nextVacationDate={nextVacationDate}
      />
      <SolicitudesTable
        requests={allRequests}
        attachmentUrlByRequestId={Object.fromEntries(attachmentUrlByRequestId)}
        signatures={signatures}
        userId={user!.id}
        canAuthorize={canAuthorize}
      />
    </div>
  );
}
```

Note what intentionally did **not** change: the data-fetching block (requests/signatures/attachment URL resolution) is copied verbatim from the current file. Only the imports, the two now-unused label maps (removed — they live in `SolicitudesTable.tsx` now), the summary calculations, the container width (`max-w-3xl` → `max-w-4xl`), and the JSX below the heading changed.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/app/(app)/solicitudes/vacaciones/page.tsx` with the "After" version above.

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bunx eslint "src/app/(app)/solicitudes/vacaciones/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Run the full existing test suite for this module to confirm nothing broke**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: all tests pass (14 new + the existing `actions.test.ts` count, 0 failures). `actions.test.ts` isn't touched by this plan, so it should be unaffected.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/page.tsx"
git commit -m "$(cat <<'EOF'
feat(solicitudes): wire summary cards and filterable table into the page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Lint every file touched by this plan**

Run:
```bash
bunx eslint src/lib/vacationRequestSummary.ts src/lib/vacationRequestSummary.test.ts "src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx" "src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx" "src/app/(app)/solicitudes/vacaciones/page.tsx"
```
Expected: 0 errors.

- [ ] **Step 3: Full test run for the module**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: all passing, 0 failures.

- [ ] **Step 4: Manual smoke test**

Reproduced verbatim from the spec's "Pruebas" section — perform these against a preview deploy:

1. Con solicitudes propias en varios estados, confirmar que "Mis solicitudes en trámite" cuenta solo `pendiente_supervisor` + `pendiente_rrhh` propias.
2. Como jefe con una solicitud pendiente de un subordinado, confirmar que aparece la tarjeta "Por aprobar" con la cuenta correcta; como empleado sin nadie a cargo, confirmar que esa tarjeta no aparece.
3. Con vacaciones y permisos aprobados este año, confirmar que las cifras de "Días aprobados" coinciden con sumar manualmente.
4. Con una vacación aprobada futura, confirmar que "Próxima vacación" muestra la fecha correcta; sin ninguna, confirmar que no se muestra.
5. Usar el filtro de Tipo, Estado y el buscador de nombre y confirmar que la tabla se actualiza sin recargar la página.

- [ ] **Step 5: Preview deploy**

Run: `bunx vercel`

Report the resulting preview URL to the user for them to run the manual smoke test above. **Do not run `bunx vercel --prod`** until the user explicitly confirms they want to deploy to production.
