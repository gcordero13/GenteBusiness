# Solicitudes de permisos: perfil, últimas vacaciones y flujo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a profile header (photo + tenure), an "última vacación tomada" card with full date ranges, and a per-request approval-flow timeline dialog to `/solicitudes/vacaciones`, plus responsive/grid polish.

**Architecture:** Two new pure-logic functions and a new pure-logic file extend the existing `src/lib/vacationRequestSummary.ts` pattern; two new presentational/client components (`SolicitudesProfileHeader`, `RequestFlowDialog`) plug into the existing component tree; `page.tsx` gains one more read-only query (`contacts` by email) and rewires the summary-card props. No schema changes.

**Tech Stack:** Next.js 16 App Router, Supabase, Vitest, Bun, lucide-react, base-ui dialog primitives.

**Build-safety note:** Several tasks below touch `page.tsx` incrementally (Tasks 1 and 5) specifically so that `main` compiles and passes tests after every single task's commit — don't skip those `page.tsx` edits just because "the real` page.tsx` work is in Task 7."

---

### Task 1: Rename `findNextApprovedVacationDate` → `findNextApprovedVacation`, add `findLastTakenVacation` and `formatFechaEs`

**Files:**
- Modify: `src/lib/vacationRequestSummary.ts`
- Modify: `src/lib/vacationRequestSummary.test.ts`
- Modify: `src/app/(app)/solicitudes/vacaciones/page.tsx` (minimal compile-keeping edit only — the full rewiring happens in Task 5 and Task 7, not here)

This task renames an already-wired exported function (`findNextApprovedVacationDate`, used by `page.tsx`) and changes its return type from a string to a date-range object. The only caller outside this file and its test is `page.tsx` — confirmed by grep, nothing else imports it.

- [ ] **Step 1: Replace the entire contents of `src/lib/vacationRequestSummary.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  countOwnRequestsInProgress,
  findLastTakenVacation,
  findNextApprovedVacation,
  formatFechaEs,
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

describe("findNextApprovedVacation", () => {
  const TODAY_ISO = "2026-11-03";

  it("returns null when there are no upcoming approved vacaciones", () => {
    expect(findNextApprovedVacation([], USER_ID, TODAY_ISO)).toBeNull();
  });

  it("excludes a vacation that already started or ended in the past", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-10-01", date_to: "2026-10-05" })];

    expect(findNextApprovedVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });

  it("returns the nearest future approved vacation's full date range among several", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-12-20", date_to: "2026-12-27" }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-11-15", date_to: "2026-11-22" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2027-01-10", date_to: "2027-01-15" }),
    ];

    expect(findNextApprovedVacation(requests, USER_ID, TODAY_ISO)).toEqual({ date_from: "2026-11-15", date_to: "2026-11-22" });
  });

  it("ignores a future request that isn't tipo vacaciones or isn't aprobado yet", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-11-15" }),
      row({ id: "b", tipo: "vacaciones", status: "pendiente_rrhh", date_from: "2026-11-20" }),
    ];

    expect(findNextApprovedVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });
});

describe("findLastTakenVacation", () => {
  const TODAY_ISO = "2026-11-03";

  it("returns null when none have been taken yet", () => {
    expect(findLastTakenVacation([], USER_ID, TODAY_ISO)).toBeNull();
  });

  it("excludes a vacation that hasn't started yet", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-11-15", date_to: "2026-11-20" })];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });

  it("counts a vacation currently in progress (date_from <= today <= date_to) as taken", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-11-01", date_to: "2026-11-05" })];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toEqual({ date_from: "2026-11-01", date_to: "2026-11-05" });
  });

  it("returns the most recent among several past approved vacations", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-01-05", date_to: "2026-01-10" }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-09-01", date_to: "2026-09-08" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2025-06-01", date_to: "2025-06-08" }),
    ];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toEqual({ date_from: "2026-09-01", date_to: "2026-09-08" });
  });

  it("ignores a past request that isn't tipo vacaciones, isn't aprobado, or belongs to someone else", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-09-01", date_to: "2026-09-02" }),
      row({ id: "b", tipo: "vacaciones", status: "rechazado", date_from: "2026-09-01", date_to: "2026-09-02" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2026-09-01", date_to: "2026-09-02", requester_app_user_id: OTHER_USER_ID }),
    ];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });
});

describe("formatFechaEs", () => {
  it("formats a single-digit day and month with the full Spanish month name and no leading zeros", () => {
    expect(formatFechaEs("2026-01-05")).toBe("5 de enero de 2026");
  });

  it("formats a double-digit day", () => {
    expect(formatFechaEs("2026-11-22")).toBe("22 de noviembre de 2026");
  });

  it("is not affected by the local timezone (uses UTC explicitly)", () => {
    // A date string parsed as local time at UTC-4 or further behind would
    // shift to the previous day if formatFechaEs didn't force UTC.
    expect(formatFechaEs("2026-11-01")).toBe("1 de noviembre de 2026");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts`
Expected: FAIL — `findNextApprovedVacation`, `findLastTakenVacation`, and `formatFechaEs` are not exported yet.

- [ ] **Step 3: Replace the entire contents of `src/lib/vacationRequestSummary.ts`**

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

export interface VacationDateRange {
  date_from: string;
  date_to: string;
}

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

export function findNextApprovedVacation(
  requests: VacationRequestSummaryRow[],
  userId: string,
  todayIso: string,
): VacationDateRange | null {
  const upcoming = requests
    .filter(
      (r) =>
        r.requester_app_user_id === userId &&
        r.tipo === "vacaciones" &&
        r.status === "aprobado" &&
        r.date_from > todayIso,
    )
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const next = upcoming[0];
  return next ? { date_from: next.date_from, date_to: next.date_to } : null;
}

export function findLastTakenVacation(
  requests: VacationRequestSummaryRow[],
  userId: string,
  todayIso: string,
): VacationDateRange | null {
  const taken = requests
    .filter(
      (r) =>
        r.requester_app_user_id === userId &&
        r.tipo === "vacaciones" &&
        r.status === "aprobado" &&
        r.date_from <= todayIso,
    )
    .sort((a, b) => b.date_from.localeCompare(a.date_from));
  const last = taken[0];
  return last ? { date_from: last.date_from, date_to: last.date_to } : null;
}

export function formatFechaEs(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-DO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Make the minimal edit to `src/app/(app)/solicitudes/vacaciones/page.tsx` so the project keeps compiling**

This is a **deliberate temporary shim** — it keeps `page.tsx` compiling and behaviorally identical to before, without yet wiring the new "Última vacación" card or full date ranges. Task 5 replaces this shim properly once `SolicitudesSummaryCards` accepts the new props.

Find:
```tsx
import {
  countOwnRequestsInProgress,
  findNextApprovedVacationDate,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
} from "@/lib/vacationRequestSummary";
```
Replace with:
```tsx
import {
  countOwnRequestsInProgress,
  findNextApprovedVacation,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
} from "@/lib/vacationRequestSummary";
```

Find:
```tsx
  const nextVacationDate = findNextApprovedVacationDate(allRequests, user!.id, todayIso);
```
Replace with:
```tsx
  const nextVacation = findNextApprovedVacation(allRequests, user!.id, todayIso);
```

Find:
```tsx
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        nextVacationDate={nextVacationDate}
      />
```
Replace with:
```tsx
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        nextVacationDate={nextVacation?.date_from ?? null}
      />
```

- [ ] **Step 6: Verify the project still typechecks**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vacationRequestSummary.ts src/lib/vacationRequestSummary.test.ts src/app/\(app\)/solicitudes/vacaciones/page.tsx
git commit -m "$(cat <<'EOF'
refactor(solicitudes): return full date ranges from vacation date lookups, add findLastTakenVacation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `deriveRequestFlowSteps` pure function

**Files:**
- Create: `src/lib/vacationRequestFlow.ts`
- Create: `src/lib/vacationRequestFlow.test.ts`

This is the one subtle business rule in this plan: the "RRHH" step must read `not_reached` (not `pending`) whenever the request never got that far — either it's still waiting on the supervisor, or the supervisor already rejected it. Only once the supervisor has approved does the RRHH step become meaningful (`pending`, then `completed`/`rejected`).

- [ ] **Step 1: Write the failing tests — create `src/lib/vacationRequestFlow.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { deriveRequestFlowSteps, type RequestFlowInput } from "./vacationRequestFlow";

function request(overrides: Partial<RequestFlowInput>): RequestFlowInput {
  return {
    tipo: "vacaciones",
    status: "pendiente_supervisor",
    created_at: "2026-10-01T12:00:00Z",
    supervisor_decision: null,
    supervisor_decided_at: null,
    supervisor_comments: null,
    rrhh_decision: null,
    rrhh_decided_at: null,
    rrhh_comments: null,
    rrhh_period_confirmed: null,
    rrhh_has_current_vacation: null,
    rrhh_is_advance: null,
    ...overrides,
  };
}

describe("deriveRequestFlowSteps", () => {
  it("marks 'Solicitado' as completed and 'Jefe directo'/'RRHH' as pending/not_reached while awaiting the supervisor", () => {
    const steps = deriveRequestFlowSteps(request({ status: "pendiente_supervisor" }));

    expect(steps).toEqual([
      { label: "Solicitado", state: "completed", decidedAt: "2026-10-01T12:00:00Z", comments: null, extra: [] },
      { label: "Jefe directo", state: "pending", decidedAt: null, comments: null, extra: [] },
      { label: "RRHH", state: "not_reached", decidedAt: null, comments: null, extra: [] },
    ]);
  });

  it("marks 'RRHH' as not_reached when the supervisor rejected the request", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "rechazado",
        supervisor_decision: "rechazado",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
        supervisor_comments: "No hay cobertura ese día",
      }),
    );

    expect(steps[1]).toEqual({
      label: "Jefe directo",
      state: "rejected",
      decidedAt: "2026-10-02T09:00:00Z",
      comments: "No hay cobertura ese día",
      extra: [],
    });
    expect(steps[2]).toEqual({ label: "RRHH", state: "not_reached", decidedAt: null, comments: null, extra: [] });
  });

  it("marks 'Jefe directo' as completed and 'RRHH' as pending once the supervisor approved", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "pendiente_rrhh",
        supervisor_decision: "aprobado",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
      }),
    );

    expect(steps[1].state).toBe("completed");
    expect(steps[2]).toEqual({ label: "RRHH", state: "pending", decidedAt: null, comments: null, extra: [] });
  });

  it("includes the vacation classification lines when RRHH approves a tipo vacaciones request", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "aprobado",
        tipo: "vacaciones",
        supervisor_decision: "aprobado",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
        rrhh_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_comments: "Todo en orden",
        rrhh_period_confirmed: "2026",
        rrhh_has_current_vacation: true,
        rrhh_is_advance: true,
      }),
    );

    expect(steps[2]).toEqual({
      label: "RRHH",
      state: "completed",
      decidedAt: "2026-10-03T14:00:00Z",
      comments: "Todo en orden",
      extra: ["Período confirmado: 2026", "Tenía vacaciones vigentes", "Vacaciones por adelantado"],
    });
  });

  it("has no extra lines when the classification fields are null or false", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "aprobado",
        tipo: "vacaciones",
        supervisor_decision: "aprobado",
        rrhh_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_period_confirmed: null,
        rrhh_has_current_vacation: false,
        rrhh_is_advance: false,
      }),
    );

    expect(steps[2].extra).toEqual([]);
  });

  it("never adds classification lines for a tipo other than vacaciones, even if those fields are set", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "aprobado",
        tipo: "medico",
        supervisor_decision: "aprobado",
        rrhh_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_period_confirmed: "2026",
        rrhh_has_current_vacation: true,
        rrhh_is_advance: true,
      }),
    );

    expect(steps[2].extra).toEqual([]);
  });

  it("marks 'RRHH' as rejected with its comments when RRHH rejects", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "rechazado",
        supervisor_decision: "aprobado",
        rrhh_decision: "rechazado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_comments: "Documentación incompleta",
      }),
    );

    expect(steps[2]).toEqual({
      label: "RRHH",
      state: "rejected",
      decidedAt: "2026-10-03T14:00:00Z",
      comments: "Documentación incompleta",
      extra: [],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/vacationRequestFlow.test.ts`
Expected: FAIL — `./vacationRequestFlow` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/vacationRequestFlow.ts`**

```ts
export type FlowStepState = "completed" | "rejected" | "pending" | "not_reached";

export interface FlowStep {
  label: string;
  state: FlowStepState;
  decidedAt: string | null;
  comments: string | null;
  extra: string[];
}

export interface RequestFlowInput {
  tipo: string;
  status: string;
  created_at: string;
  supervisor_decision: string | null;
  supervisor_decided_at: string | null;
  supervisor_comments: string | null;
  rrhh_decision: string | null;
  rrhh_decided_at: string | null;
  rrhh_comments: string | null;
  rrhh_period_confirmed: string | null;
  rrhh_has_current_vacation: boolean | null;
  rrhh_is_advance: boolean | null;
}

export function deriveRequestFlowSteps(request: RequestFlowInput): FlowStep[] {
  const solicitado: FlowStep = {
    label: "Solicitado",
    state: "completed",
    decidedAt: request.created_at,
    comments: null,
    extra: [],
  };

  const jefeState: FlowStepState =
    request.status === "pendiente_supervisor"
      ? "pending"
      : request.supervisor_decision === "rechazado"
        ? "rejected"
        : "completed";

  const jefe: FlowStep = {
    label: "Jefe directo",
    state: jefeState,
    decidedAt: request.supervisor_decided_at,
    comments: request.supervisor_comments,
    extra: [],
  };

  const rrhhState: FlowStepState =
    request.status === "pendiente_supervisor" || request.supervisor_decision === "rechazado"
      ? "not_reached"
      : request.status === "pendiente_rrhh"
        ? "pending"
        : request.rrhh_decision === "rechazado"
          ? "rejected"
          : "completed";

  const rrhhReached = rrhhState !== "not_reached" && rrhhState !== "pending";
  const extra: string[] = [];
  if (request.tipo === "vacaciones" && rrhhReached) {
    if (request.rrhh_period_confirmed) extra.push(`Período confirmado: ${request.rrhh_period_confirmed}`);
    if (request.rrhh_has_current_vacation === true) extra.push("Tenía vacaciones vigentes");
    if (request.rrhh_is_advance === true) extra.push("Vacaciones por adelantado");
  }

  const rrhh: FlowStep = {
    label: "RRHH",
    state: rrhhState,
    decidedAt: rrhhState === "not_reached" ? null : request.rrhh_decided_at,
    comments: rrhhState === "not_reached" ? null : request.rrhh_comments,
    extra,
  };

  return [solicitado, jefe, rrhh];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/vacationRequestFlow.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vacationRequestFlow.ts src/lib/vacationRequestFlow.test.ts
git commit -m "$(cat <<'EOF'
feat(solicitudes): add deriveRequestFlowSteps for the approval-flow timeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `SolicitudesProfileHeader.tsx`

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx`

Presentational only — no data fetching, no new logic to unit test (consistent with `SolicitudesSummaryCards.tsx`, which also has no test file). Verified via typecheck, lint, and the manual smoke test in Task 8.

- [ ] **Step 1: Create the file**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/contacts";

export interface SolicitudesProfileHeaderProps {
  name: string;
  position: string | null;
  photoUrl: string | null;
  tenure: string | null;
}

export function SolicitudesProfileHeader({ name, position, photoUrl, tenure }: SolicitudesProfileHeaderProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border p-4">
      <Avatar className="size-14">
        <AvatarImage src={photoUrl ?? undefined} alt="" />
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div>
        <p className="font-semibold">{name}</p>
        {(position || tenure) && (
          <p className="text-sm text-muted-foreground">
            {position}
            {position && tenure ? " · " : ""}
            {tenure && `${tenure} en la empresa`}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `bunx tsc --noEmit`
Expected: no errors (the file isn't imported anywhere yet, Task 7 wires it in).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): add SolicitudesProfileHeader presentational component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `RequestFlowDialog.tsx`

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/RequestFlowDialog.tsx`

Dumb renderer of `deriveRequestFlowSteps`' output (Task 2) behind a dialog trigger button. No test file, same reasoning as Task 3 — all the branching logic it depends on is already covered by `vacationRequestFlow.test.ts`.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { ListChecks, CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatFechaEs } from "@/lib/vacationRequestSummary";
import {
  deriveRequestFlowSteps,
  type FlowStep,
  type FlowStepState,
  type RequestFlowInput,
} from "@/lib/vacationRequestFlow";

const STATE_ICON: Record<FlowStepState, typeof CheckCircle2> = {
  completed: CheckCircle2,
  rejected: XCircle,
  pending: Clock,
  not_reached: MinusCircle,
};

const STATE_COLOR: Record<FlowStepState, string> = {
  completed: "text-green-600",
  rejected: "text-red-600",
  pending: "text-amber-600",
  not_reached: "text-muted-foreground",
};

export function RequestFlowDialog({ request }: { request: RequestFlowInput }) {
  const steps = deriveRequestFlowSteps(request);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Ver flujo" aria-label="Ver flujo de la solicitud">
            <ListChecks className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flujo de la solicitud</DialogTitle>
        </DialogHeader>
        <ol className="space-y-0">
          {steps.map((step, index) => (
            <FlowStepItem key={step.label} step={step} isLast={index === steps.length - 1} />
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function FlowStepItem({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  const Icon = STATE_ICON[step.state];
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <Icon className={`size-5 ${STATE_COLOR[step.state]}`} aria-hidden="true" />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium">{step.label}</p>
        {step.decidedAt && (
          <p className="text-xs text-muted-foreground">{formatFechaEs(step.decidedAt.slice(0, 10))}</p>
        )}
        {step.comments && <p className="mt-1 text-sm">{step.comments}</p>}
        {step.extra.map((line) => (
          <p key={line} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `bunx tsc --noEmit`
Expected: no errors (the file isn't imported anywhere yet, Task 6 wires it in).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/RequestFlowDialog.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): add RequestFlowDialog timeline component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update `SolicitudesSummaryCards.tsx` for the 5-card grid and full date ranges

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx`
- Modify: `src/app/(app)/solicitudes/vacaciones/page.tsx` (finishes replacing the Task 1 shim with the real prop wiring — `page.tsx`'s `max-w-4xl` → `max-w-5xl` and the profile header itself are still deferred to Task 7)

- [ ] **Step 1: Replace the entire contents of `SolicitudesSummaryCards.tsx`**

```tsx
import { CalendarCheck, ClipboardCheck, History, Hourglass, Plane } from "lucide-react";
import {
  formatFechaEs,
  type ApprovedDaysSummary,
  type AwaitingApprovalSummary,
  type VacationDateRange,
} from "@/lib/vacationRequestSummary";

interface SolicitudesSummaryCardsProps {
  year: number;
  inProgressCount: number;
  approval: AwaitingApprovalSummary;
  approvedDays: ApprovedDaysSummary;
  lastVacation: VacationDateRange | null;
  nextVacation: VacationDateRange | null;
}

export function SolicitudesSummaryCards({
  year,
  inProgressCount,
  approval,
  approvedDays,
  lastVacation,
  nextVacation,
}: SolicitudesSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Hourglass className="size-4 text-[#04B1AF]" aria-hidden="true" />
          Mis solicitudes en trámite
        </div>
        <p className="mt-2 text-2xl font-bold">{inProgressCount}</p>
      </div>

      {approval.visible && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ClipboardCheck className="size-4 text-orange-600" aria-hidden="true" />
            Por aprobar
          </div>
          <p className="mt-2 text-2xl font-bold">{approval.count}</p>
        </div>
      )}

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <CalendarCheck className="size-4 text-blue-600" aria-hidden="true" />
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

      {lastVacation && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <History className="size-4 text-blue-600" aria-hidden="true" />
            Última vacación
          </div>
          <p className="mt-2 text-sm font-medium">
            Del {formatFechaEs(lastVacation.date_from)} al {formatFechaEs(lastVacation.date_to)}
          </p>
        </div>
      )}

      {nextVacation && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Plane className="size-4 text-blue-600" aria-hidden="true" />
            Próxima vacación
          </div>
          <p className="mt-2 text-sm font-medium">
            Del {formatFechaEs(nextVacation.date_from)} al {formatFechaEs(nextVacation.date_to)}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Finish rewiring `page.tsx` for the new props**

Find:
```tsx
import {
  countOwnRequestsInProgress,
  findNextApprovedVacation,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
} from "@/lib/vacationRequestSummary";
```
Replace with:
```tsx
import {
  countOwnRequestsInProgress,
  findLastTakenVacation,
  findNextApprovedVacation,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
} from "@/lib/vacationRequestSummary";
```

Find:
```tsx
  const nextVacation = findNextApprovedVacation(allRequests, user!.id, todayIso);
```
Replace with:
```tsx
  const lastVacation = findLastTakenVacation(allRequests, user!.id, todayIso);
  const nextVacation = findNextApprovedVacation(allRequests, user!.id, todayIso);
```

Find:
```tsx
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        nextVacationDate={nextVacation?.date_from ?? null}
      />
```
Replace with:
```tsx
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        lastVacation={lastVacation}
        nextVacation={nextVacation}
      />
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx src/app/\(app\)/solicitudes/vacaciones/page.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): add Última vacación card, show full date ranges, widen summary grid

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add the "Flujo" column to `SolicitudesTable.tsx`

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx`

This task doesn't change any prop that `page.tsx` passes (it already passes the whole untyped `vacation_requests` row via `requests={allRequests}`), so it's safe standalone — no `page.tsx` edit needed here.

- [ ] **Step 1: Add the import**

Find:
```tsx
import { VacationRequestActions } from "./VacationRequestActions";
```
Replace with:
```tsx
import { RequestFlowDialog } from "./RequestFlowDialog";
import { VacationRequestActions } from "./VacationRequestActions";
```

- [ ] **Step 2: Extend `SolicitudRequestRow` with the flow fields**

Find:
```tsx
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
```
Replace with:
```tsx
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
  created_at: string;
  supervisor_decision: string | null;
  supervisor_decided_at: string | null;
  supervisor_comments: string | null;
  rrhh_decision: string | null;
  rrhh_decided_at: string | null;
  rrhh_comments: string | null;
  rrhh_period_confirmed: string | null;
  rrhh_has_current_vacation: boolean | null;
  rrhh_is_advance: boolean | null;
}
```

- [ ] **Step 3: Add the "Flujo" table header**

Find:
```tsx
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
```
Replace with:
```tsx
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
              <TableHead>Flujo</TableHead>
            </TableRow>
```

- [ ] **Step 4: Render `RequestFlowDialog` for every row**

Find:
```tsx
                  <TableCell>
                    {isPendingSupervisorForMe && (
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} tipo={r.tipo} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} tipo={r.tipo} />
                    )}
                  </TableCell>
                </TableRow>
```
Replace with:
```tsx
                  <TableCell>
                    {isPendingSupervisorForMe && (
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} tipo={r.tipo} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} tipo={r.tipo} />
                    )}
                  </TableCell>
                  <TableCell>
                    <RequestFlowDialog request={r} />
                  </TableCell>
                </TableRow>
```

- [ ] **Step 5: Verify the project still typechecks**

Run: `bunx tsc --noEmit`
Expected: no errors (`allRequests` in `page.tsx` is untyped `any[]` from `.select("*")`, so it structurally satisfies the wider `SolicitudRequestRow`).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesTable.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): add a Flujo column that opens the approval-flow dialog per request

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire the profile header into `page.tsx` and widen the container

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/page.tsx`

- [ ] **Step 1: Replace the entire contents of `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTenure } from "@/lib/contacts";
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { SolicitudesProfileHeader } from "./SolicitudesProfileHeader";
import { SolicitudesSummaryCards } from "./SolicitudesSummaryCards";
import { SolicitudesTable } from "./SolicitudesTable";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import {
  countOwnRequestsInProgress,
  findLastTakenVacation,
  findNextApprovedVacation,
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

  // Same email-join pattern already used for the home page's "my profile"
  // card (src/app/(app)/page.tsx) - deliberately without the schedule_id
  // join, since this page has no use for "Horario".
  let myContact: {
    first_name: string;
    last_name: string;
    position: string | null;
    photo_url: string | null;
    hire_date: string | null;
  } | null = null;
  if (user?.email) {
    const { data } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date")
      .eq("email", user.email)
      .maybeSingle();
    myContact = data;
  }

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

  const today = new Date();
  const year = today.getFullYear();
  const todayIso = today.toISOString().slice(0, 10);

  const allRequests = requests ?? [];
  const inProgressCount = countOwnRequestsInProgress(allRequests, user!.id);
  const approval = summarizeAwaitingMyApproval(allRequests, user!.id, canAuthorize);
  const approvedDays = summarizeApprovedDaysForYear(allRequests, user!.id, year);
  const lastVacation = findLastTakenVacation(allRequests, user!.id, todayIso);
  const nextVacation = findNextApprovedVacation(allRequests, user!.id, todayIso);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de permisos</h1>
        <NewVacationRequestDialog />
      </div>
      {myContact && (
        <SolicitudesProfileHeader
          name={`${myContact.first_name} ${myContact.last_name}`}
          position={myContact.position}
          photoUrl={myContact.photo_url}
          tenure={myContact.hire_date ? formatTenure(myContact.hire_date, today) : null}
        />
      )}
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        lastVacation={lastVacation}
        nextVacation={nextVacation}
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

- [ ] **Step 2: Verify the project still typechecks**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/page.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): render the profile header and widen the page container

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole project**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint every file touched by this plan**

Run: `bunx eslint src/lib/vacationRequestSummary.ts src/lib/vacationRequestSummary.test.ts src/lib/vacationRequestFlow.ts src/lib/vacationRequestFlow.test.ts "src/app/(app)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx" "src/app/(app)/solicitudes/vacaciones/RequestFlowDialog.tsx" "src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx" "src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx" "src/app/(app)/solicitudes/vacaciones/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Run all touched test suites plus the existing actions test**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts src/lib/vacationRequestFlow.test.ts "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: all tests passing, 0 failures.

- [ ] **Step 4: Manual smoke test (reproduced verbatim from the spec's "Pruebas" section)**

1. Confirmar que el encabezado de perfil muestra la foto (o las iniciales si no hay foto), el nombre, el puesto y el tiempo en la empresa correctos para el usuario que inició sesión.
2. Con una vacación en curso ahora mismo, confirmar que aparece como "Última vacación" (no como "Próxima").
3. Con una vacación futura y otra ya pasada, confirmar que ambas tarjetas muestran el rango completo de fechas en español.
4. Hacer clic en el ícono de flujo de una solicitud en cada estado (pendiente de jefe, pendiente de RRHH, aprobada, rechazada por jefe, rechazada por RRHH) y confirmar que los 3 pasos muestran el estado, fecha y comentario correctos.
5. En una vacación aprobada por RRHH, confirmar que el paso "RRHH" muestra el período confirmado y los indicadores de vacaciones vigentes/adelanto cuando aplican.
6. Revisar en una pantalla ancha (desktop) y una angosta (móvil) que el encabezado, las tarjetas y la tabla se ven bien y no hay desbordamiento horizontal de la página.

- [ ] **Step 5: Preview deploy**

Run: `bunx vercel`
Report the resulting preview URL to the user for them to run the manual smoke test above. **Do not run `bunx vercel --prod`** until the user explicitly confirms they want to deploy to production.
