# Horarios Named-Schedules Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the just-shipped single-company-schedule Horarios feature with named, reusable schedule templates (full per-day-of-week hours), assignable per-department by default and per-contact by exception.

**Architecture:** A new `schedule_templates` + `schedule_template_days` pair of tables replaces `company_schedule`; `departments.default_schedule_id` and `contacts.schedule_id` (replacing four free-form columns) point at a template. A pure library (`src/lib/schedules.ts`) resolves and formats the effective schedule; a small server-only helper (`src/lib/scheduleTemplates.ts`) fetches all templates once per page load. Profile-display components read a pre-resolved `schedule_line: string` instead of a threaded schedule object.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), Vitest (`bun run test` in this worktree — `node.exe` is missing on this machine, use `bun run <script>` not `npm run <script>`, and `bunx tsc --noEmit` for type-checking).

---

## CRITICAL: Migration timing — read this before Task 1

This redesign **replaces columns and a table that the currently-deployed production code still reads from on every page load.** Unlike the original Horarios migrations (which only ever *added* things), two migrations in this plan are destructive: dropping `company_schedule` and dropping `contacts.schedule_start_time`/`schedule_end_time`/`schedule_workdays`/`schedule_tolerance_minutes`.

**This exact mistake already caused two real production incidents earlier today** (SQL shown during design got pasted into Supabase before it should have been, once dropping those very columns while the live trigger still referenced them — breaking the home page's profile card and birthday widgets for every real user, until caught and reverted). Do not repeat it.

The rule for this plan: **Migration 1 (Task 1) is purely additive and safe to apply immediately** — it adds new tables/columns without touching anything the currently-deployed app reads. **Migration 2 (Task 8) is destructive and must NOT be applied until this entire branch has been merged to `main` and deployed to production, and the human has confirmed the new code is live.** Task 8 is placed after all the code-writing tasks specifically so there's no way to reach it before the code exists to replace what it removes. Every migration task ends with an explicit STOP instruction — follow it literally, do not paste any SQL into Supabase's SQL Editor except when a task's STOP instruction says the exact file is ready.

---

## Context for the implementer

- Work happens in the worktree at `.worktrees/feature/horarios-named-schedules` (branch `feature/horarios-named-schedules`). Dependencies are installed (`bun install`), `.env.local` is copied. Baseline: `bun run test` passes cleanly aside from known, pre-existing Supabase-auth rate-limit flakiness (`Error: failed to sign in as test user: Request rate limit reached`, scattered across unrelated RLS test files) — if you see ONLY that exact error message on files unrelated to your task, that's expected noise, not a regression to chase down.
- Approved spec: `docs/superpowers/specs/2026-08-11-horarios-named-schedules-design.md`. Read it for full rationale — this plan implements it exactly.
- This is a **replacement**, not an extension, of the original Horarios feature (`docs/superpowers/specs/2026-08-11-horarios-design.md`, already merged to `main`). Every file this plan touches already exists with the OLD implementation in it — read each file's current content before editing, don't assume it's empty or new.
- No validation library exists anywhere in this codebase — all validation is plain state + boolean conditions.
- Postgres `time` columns come back from `supabase-js` as `"HH:MM:SS"` strings. Day-of-week numbering is `0`=Sunday…`6`=Saturday, consistent with the rest of this codebase.
- Supabase CLI migrations are broken in this environment (`SUPABASE_DB_PASSWORD` unset) — every migration file must be manually pasted into the Supabase SQL Editor by the human. Never attempt `supabase db push`.

---

### Task 1: Migration 1 — schedule_templates, schedule_template_days, and additive columns

**Files:**
- Create: `supabase/migrations/20260811150000_schedule_templates.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tolerance_minutes integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index schedule_templates_single_default
  on public.schedule_templates (is_default) where is_default;

create table public.schedule_template_days (
  schedule_template_id uuid not null references public.schedule_templates(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (schedule_template_id, day_of_week)
);

alter table public.schedule_templates enable row level security;
alter table public.schedule_template_days enable row level security;

create policy "schedule_templates_select_any_authenticated" on public.schedule_templates
  for select using (auth.uid() is not null);
create policy "schedule_templates_insert_managers" on public.schedule_templates
  for insert with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
create policy "schedule_templates_update_managers" on public.schedule_templates
  for update
  using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
create policy "schedule_templates_delete_managers" on public.schedule_templates
  for delete using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));

create policy "schedule_template_days_select_any_authenticated" on public.schedule_template_days
  for select using (auth.uid() is not null);

with new_schedule as (
  insert into public.schedule_templates (name, tolerance_minutes, is_default)
  values ('General', 0, true)
  returning id
)
insert into public.schedule_template_days (schedule_template_id, day_of_week, start_time, end_time)
select id, day, '08:00', '17:00'
from new_schedule, unnest(array[1, 2, 3, 4, 5]) as day;

alter table public.departments add column default_schedule_id uuid references public.schedule_templates(id) on delete set null;
update public.departments set default_schedule_id = (select id from public.schedule_templates where is_default);

alter table public.contacts add column schedule_id uuid references public.schedule_templates(id) on delete set null;

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
  is_self boolean;
begin
  select * into flags from public.get_my_module_permissions('contacts');

  select exists (
    select 1 from public.app_users au
    where au.id = auth.uid() and au.email = old.email
  ) into is_self;

  if flags is null and not is_self then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.position, new.fleet_phone, new.extension, new.has_whatsapp
  ) is distinct from (
    old.position, old.fleet_phone, old.extension, old.has_whatsapp
  ) and not (is_self or coalesce(flags.can_edit, false)) then
    raise exception 'not authorized to edit contact fields';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.department_id, new.company_id,
    new.photo_url, new.reports_to_id, new.birth_date, new.hire_date, new.hikvision_employee_no,
    new.schedule_start_time, new.schedule_end_time, new.schedule_workdays, new.schedule_tolerance_minutes,
    new.schedule_id
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date, old.hire_date, old.hikvision_employee_no,
    old.schedule_start_time, old.schedule_end_time, old.schedule_workdays, old.schedule_tolerance_minutes,
    old.schedule_id
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;
```

This is purely additive: it creates two new tables and two new nullable columns, and the trigger change only ADDS `schedule_id` to the tuple — the four old `contacts.schedule_*` columns stay exactly where they are, so the currently-deployed production code (which still reads/writes them) is completely unaffected.

- [ ] **Step 2: STOP — human confirmation required**

Do not proceed to Task 2 until the human confirms they have pasted the exact contents of `supabase/migrations/20260811150000_schedule_templates.sql` into the Supabase SQL Editor for the production project and it ran successfully. Ask directly if this hasn't been confirmed yet.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260811150000_schedule_templates.sql
git commit -m "feat: add schedule_templates and schedule_template_days tables, additive columns"
```

---

### Task 2: `src/lib/schedules.ts` — rewrite for per-day templates

**Files:**
- Modify: `src/lib/schedules.ts`
- Modify: `src/lib/schedules.test.ts`

This completely replaces the current file's contents (the `CompanySchedule`/`ScheduleOverrideFields` types, `DEFAULT_COMPANY_SCHEDULE`, and `formatWorkdays` are all removed — nothing from the old shape survives).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  formatScheduleLine,
  formatScheduleTime,
  getEffectiveSchedule,
  resolveScheduleLine,
  FALLBACK_SCHEDULE,
  type ScheduleTemplate,
} from "./schedules";

const general: ScheduleTemplate = {
  id: "general-id",
  name: "General",
  tolerance_minutes: 0,
  days: [
    { day_of_week: 1, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 2, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 3, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 4, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 5, start_time: "08:00:00", end_time: "17:00:00" },
  ],
};

const ventas: ScheduleTemplate = {
  id: "ventas-id",
  name: "Ventas",
  tolerance_minutes: 0,
  days: [
    { day_of_week: 1, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 2, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 3, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 4, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 5, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 6, start_time: "10:00:00", end_time: "14:00:00" },
  ],
};

describe("getEffectiveSchedule", () => {
  const schedulesById = new Map([
    [general.id, general],
    [ventas.id, ventas],
  ]);

  it("uses the contact's own override when set", () => {
    const result = getEffectiveSchedule(ventas.id, general.id, schedulesById, general);
    expect(result).toBe(ventas);
  });

  it("uses the department default when the contact has no override", () => {
    const result = getEffectiveSchedule(null, ventas.id, schedulesById, general);
    expect(result).toBe(ventas);
  });

  it("uses the global default when neither the contact nor the department has one set", () => {
    const result = getEffectiveSchedule(null, null, schedulesById, general);
    expect(result).toBe(general);
  });

  it("falls back to the passed-in default schedule if a referenced id isn't in the map", () => {
    const result = getEffectiveSchedule("missing-id", null, schedulesById, general);
    expect(result).toBe(general);
  });
});

describe("formatScheduleTime", () => {
  it("formats a morning time with am", () => {
    expect(formatScheduleTime("08:00:00")).toBe("8:00 am");
  });

  it("formats an afternoon time with pm", () => {
    expect(formatScheduleTime("17:00:00")).toBe("5:00 pm");
  });

  it("formats midnight as 12:00 am", () => {
    expect(formatScheduleTime("00:00:00")).toBe("12:00 am");
  });

  it("formats noon as 12:00 pm", () => {
    expect(formatScheduleTime("12:00:00")).toBe("12:00 pm");
  });

  it("zero-pads the minute", () => {
    expect(formatScheduleTime("09:05:00")).toBe("9:05 am");
  });
});

describe("formatScheduleLine", () => {
  it("groups a uniform weekday range and a separate Saturday block", () => {
    expect(formatScheduleLine(ventas)).toBe("Lunes a viernes, 9:00 am – 6:00 pm · Sábado, 10:00 am – 2:00 pm");
  });

  it("formats a schedule with no Saturday as just the weekday range", () => {
    expect(formatScheduleLine(general)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });

  it("formats a single worked day", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [{ day_of_week: 3, start_time: "08:00:00", end_time: "17:00:00" }],
    };
    expect(formatScheduleLine(schedule)).toBe("Miércoles, 8:00 am – 5:00 pm");
  });

  it("groups all seven days into one range when every day shares identical hours", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
        day_of_week,
        start_time: "08:00:00",
        end_time: "17:00:00",
      })),
    };
    expect(formatScheduleLine(schedule)).toBe("Domingo a sábado, 8:00 am – 5:00 pm");
  });

  it("does not merge days whose hours differ, even if consecutive", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [
        { day_of_week: 1, start_time: "08:00:00", end_time: "12:00:00" },
        { day_of_week: 2, start_time: "13:00:00", end_time: "17:00:00" },
      ],
    };
    expect(formatScheduleLine(schedule)).toBe("Lunes, 8:00 am – 12:00 pm · Martes, 1:00 pm – 5:00 pm");
  });

  it("sorts out-of-order input before grouping", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [
        { day_of_week: 5, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 1, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 3, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 2, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 4, start_time: "08:00:00", end_time: "17:00:00" },
      ],
    };
    expect(formatScheduleLine(schedule)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });

  it("returns a placeholder for a schedule with no worked days at all", () => {
    const schedule: ScheduleTemplate = { id: "x", name: "x", tolerance_minutes: 0, days: [] };
    expect(formatScheduleLine(schedule)).toBe("Sin horario asignado");
  });
});

describe("resolveScheduleLine", () => {
  it("combines resolution and formatting in one call", () => {
    const schedulesById = new Map([[general.id, general]]);
    expect(resolveScheduleLine(null, null, schedulesById, general)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });
});

describe("FALLBACK_SCHEDULE", () => {
  it("is a plain Monday-Friday 8-5 schedule usable if the database query returns nothing", () => {
    expect(formatScheduleLine(FALLBACK_SCHEDULE)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/lib/schedules.test.ts`
Expected: FAIL — the current file doesn't export `ScheduleTemplate`, `resolveScheduleLine`, or `FALLBACK_SCHEDULE`, and `getEffectiveSchedule`/`formatScheduleLine`'s current signatures don't match

- [ ] **Step 3: Write the implementation**

```typescript
export interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  tolerance_minutes: number;
  days: ScheduleDay[];
}

export const FALLBACK_SCHEDULE: ScheduleTemplate = {
  id: "__fallback__",
  name: "General",
  tolerance_minutes: 0,
  days: [1, 2, 3, 4, 5].map((day_of_week) => ({
    day_of_week,
    start_time: "08:00:00",
    end_time: "17:00:00",
  })),
};

// Resolution order: the contact's own override wins; otherwise the
// department's default wins; otherwise the passed-in default schedule
// (the schedule_templates row with is_default = true) wins. If an id
// points at a schedule that isn't in the map (e.g. stale data), this also
// falls back to the default rather than returning undefined.
export function getEffectiveSchedule(
  contactScheduleId: string | null,
  departmentDefaultScheduleId: string | null | undefined,
  schedulesById: Map<string, ScheduleTemplate>,
  defaultSchedule: ScheduleTemplate,
): ScheduleTemplate {
  const effectiveId = contactScheduleId ?? departmentDefaultScheduleId ?? defaultSchedule.id;
  return schedulesById.get(effectiveId) ?? defaultSchedule;
}

export function formatScheduleTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

const DAY_NAMES_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Groups days into maximal runs of consecutive day numbers that ALSO share
// identical start/end times, then joins each group with " · ". A schedule
// whose worked days wrap across the week boundary (e.g. Friday-Saturday-
// Sunday-Monday) won't be recognized as one contiguous range - a known,
// pre-existing limitation carried over from the original per-workday
// formatter, not worth solving for the schedules this app actually needs.
export function formatScheduleLine(schedule: ScheduleTemplate): string {
  if (schedule.days.length === 0) {
    return "Sin horario asignado";
  }

  const sorted = [...schedule.days].sort((a, b) => a.day_of_week - b.day_of_week);
  const groups: ScheduleDay[][] = [];
  for (const day of sorted) {
    const currentGroup = groups[groups.length - 1];
    const previousDay = currentGroup?.[currentGroup.length - 1];
    const continuesGroup =
      previousDay !== undefined &&
      day.day_of_week === previousDay.day_of_week + 1 &&
      day.start_time === previousDay.start_time &&
      day.end_time === previousDay.end_time;

    if (continuesGroup && currentGroup) {
      currentGroup.push(day);
    } else {
      groups.push([day]);
    }
  }

  return groups
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      const dayLabel =
        group.length > 1
          ? `${DAY_NAMES_ES[first.day_of_week]} a ${DAY_NAMES_ES[last.day_of_week]}`
          : DAY_NAMES_ES[first.day_of_week];
      return `${capitalize(dayLabel)}, ${formatScheduleTime(first.start_time)} – ${formatScheduleTime(last.end_time)}`;
    })
    .join(" · ");
}

export function resolveScheduleLine(
  contactScheduleId: string | null,
  departmentDefaultScheduleId: string | null | undefined,
  schedulesById: Map<string, ScheduleTemplate>,
  defaultSchedule: ScheduleTemplate,
): string {
  return formatScheduleLine(
    getEffectiveSchedule(contactScheduleId, departmentDefaultScheduleId, schedulesById, defaultSchedule),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/lib/schedules.test.ts`
Expected: PASS, 17/17 tests

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: Errors are expected at this point — every file still importing the now-removed `CompanySchedule`/`ScheduleOverrideFields`/`DEFAULT_COMPANY_SCHEDULE`/`formatWorkdays` will fail to compile. Do not try to fix those other files in this task — later tasks rewrite them. Confirm the errors are ONLY import/type errors in other files referencing the old exports, not a mistake in `schedules.ts` itself (re-read `schedules.ts` against the code above if any error is inside that file).

- [ ] **Step 6: Commit**

```bash
git add src/lib/schedules.ts src/lib/schedules.test.ts
git commit -m "feat: rewrite schedules.ts for per-day-of-week schedule templates"
```

---

### Task 3: `src/lib/scheduleTemplates.ts` — server-only fetch helper

**Files:**
- Create: `src/lib/scheduleTemplates.ts`

- [ ] **Step 1: Write the helper**

```typescript
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_SCHEDULE, type ScheduleTemplate } from "./schedules";

export interface ScheduleTemplatesContext {
  schedulesById: Map<string, ScheduleTemplate>;
  defaultSchedule: ScheduleTemplate;
}

export async function getScheduleTemplatesContext(): Promise<ScheduleTemplatesContext> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_templates")
    .select("id, name, tolerance_minutes, is_default, schedule_template_days(day_of_week, start_time, end_time)");

  const templates: (ScheduleTemplate & { is_default: boolean })[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    tolerance_minutes: t.tolerance_minutes,
    is_default: t.is_default,
    days: (t.schedule_template_days ?? []).map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  }));

  const schedulesById = new Map<string, ScheduleTemplate>(templates.map((t) => [t.id, t]));
  const defaultSchedule = templates.find((t) => t.is_default) ?? FALLBACK_SCHEDULE;

  return { schedulesById, defaultSchedule };
}
```

This mirrors the existing `src/lib/platformSettings.ts` pattern (a thin `server-only` data-fetch helper). **Correction found during Task 3's own code review:** `platformSettings.ts` in fact HAS a paired `platformSettings.test.ts`, and so does every other server-only fetch helper in `src/lib/` — this file needs the same treatment, not an exception. Add `src/lib/scheduleTemplates.test.ts` mirroring `platformSettings.test.ts`'s exact `vi.mock("@/lib/supabase/server", ...)` pattern, covering: multiple templates with days (verify the map and that the correct `is_default` row is picked, and that `is_default` itself doesn't leak into the returned `ScheduleTemplate` shape), empty data (falls back to `FALLBACK_SCHEDULE`), and templates present but none marked `is_default` (still falls back to `FALLBACK_SCHEDULE` rather than picking an arbitrary one). Also don't silently discard the query's `error` — log it before falling back, since a real RLS/fetch failure should leave a trace rather than looking identical to "no schedules configured yet" (this feeds every contact's displayed schedule, so the stakes are higher than `platformSettings.ts`'s cosmetic logo fallback).

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: this specific new file should be clean; the pre-existing errors from Task 2 in other files are still expected at this point.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduleTemplates.ts
git commit -m "feat: add getScheduleTemplatesContext data-fetch helper"
```

---

### Task 4: "Horarios" admin page — rewrite as a named-schedule CRUD list

**Files:**
- Modify: `src/app/(app)/(admin)/schedules/page.tsx`
- Modify: `src/app/(app)/(admin)/schedules/actions.ts`
- Modify: `src/app/(app)/(admin)/schedules/ScheduleForm.tsx`
- Create: `src/app/(app)/(admin)/schedules/actions.test.ts`

This replaces the single-row-edit page with a dialog-based list, following the exact pattern already used by `src/app/(app)/(admin)/departments/` (`DepartmentForm.tsx`'s dialog + `DeleteIconButton`) and `src/app/(app)/(admin)/attendance-devices/` (`DeviceForm.tsx`'s dialog).

- [ ] **Step 1: Write the failing action tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteScheduleTemplate, saveScheduleTemplate } from "./actions";

function mockAuthorizedCaller() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [{ can_manage: true }] }),
  } as never);
}

function mockUnauthorizedCaller() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [{ can_manage: false }] }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveScheduleTemplate", () => {
  it("rejects a caller without schedules can_manage", async () => {
    mockUnauthorizedCaller();

    const result = await saveScheduleTemplate({
      name: "Ventas",
      tolerance_minutes: 0,
      is_default: false,
      days: [],
    });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("unsets the previous default before saving a new default, and replaces the day rows", async () => {
    mockAuthorizedCaller();
    const unsetDefaultEq = vi.fn().mockResolvedValue({ error: null });
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });
    const deleteDaysEq = vi.fn().mockResolvedValue({ error: null });
    const insertDays = vi.fn().mockResolvedValue({ error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "schedule_templates") {
          return {
            update: vi.fn().mockReturnValue({ eq: unsetDefaultEq }),
            insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: deleteDaysEq }),
          insert: insertDays,
        };
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveScheduleTemplate({
      name: "Ventas",
      tolerance_minutes: 0,
      is_default: true,
      days: [{ day_of_week: 1, start_time: "09:00", end_time: "18:00" }],
    });

    expect(result.error).toBeUndefined();
    expect(unsetDefaultEq).toHaveBeenCalledWith("is_default", true);
    expect(deleteDaysEq).toHaveBeenCalledWith("schedule_template_id", "new-id");
    expect(insertDays).toHaveBeenCalledWith([
      { schedule_template_id: "new-id", day_of_week: 1, start_time: "09:00", end_time: "18:00" },
    ]);
  });
});

describe("deleteScheduleTemplate", () => {
  it("blocks deleting the schedule currently marked as default", async () => {
    mockAuthorizedCaller();
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { is_default: true } }) }),
        }),
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await deleteScheduleTemplate("some-id");

    expect(result.error).toBe(
      "No se puede eliminar el horario marcado como predeterminado. Marca otro horario como predeterminado primero.",
    );
  });

  it("deletes a non-default schedule", async () => {
    mockAuthorizedCaller();
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "schedule_templates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { is_default: false } }) }),
            }),
            delete: vi.fn().mockReturnValue({ eq: deleteEq }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await deleteScheduleTemplate("some-id");

    expect(result.error).toBeUndefined();
    expect(deleteEq).toHaveBeenCalledWith("id", "some-id");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/app/\(app\)/\(admin\)/schedules/actions.test.ts`
Expected: FAIL — `saveScheduleTemplate`/`deleteScheduleTemplate` don't exist yet in `actions.ts`

- [ ] **Step 3: Write `actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ScheduleDayInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface SaveScheduleTemplateInput {
  id?: string;
  name: string;
  tolerance_minutes: number;
  is_default: boolean;
  days: ScheduleDayInput[];
}

interface ActionResult {
  error?: string;
}

async function callerCanManageSchedules(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "schedules" });
  return Boolean(data?.[0]?.can_manage);
}

export async function saveScheduleTemplate(input: SaveScheduleTemplateInput): Promise<ActionResult> {
  if (!(await callerCanManageSchedules())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();

  // Symmetric to deleteScheduleTemplate's guard below: without this, an
  // admin could uncheck "is_default" on the schedule that's currently the
  // only default without checking it on any other schedule, leaving zero
  // rows with is_default = true. getScheduleTemplatesContext would then
  // silently fall back to FALLBACK_SCHEDULE for every department/contact
  // relying on the default - a real behavior change with no visible error.
  if (!input.is_default) {
    const { count } = await admin
      .from("schedule_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_default", true)
      .neq("id", input.id ?? "");
    if (!count) {
      return { error: "No se puede quitar el horario predeterminado sin marcar otro primero." };
    }
  }

  if (input.is_default) {
    const { error: unsetError } = await admin
      .from("schedule_templates")
      .update({ is_default: false })
      .eq("is_default", true);
    if (unsetError) return { error: unsetError.message };
  }

  const payload = {
    name: input.name,
    tolerance_minutes: input.tolerance_minutes,
    is_default: input.is_default,
  };

  let scheduleId = input.id;
  if (scheduleId) {
    const { error } = await admin.from("schedule_templates").update(payload).eq("id", scheduleId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await admin.from("schedule_templates").insert(payload).select("id").single();
    if (error) return { error: error.message };
    scheduleId = data.id;
  }

  const { error: deleteDaysError } = await admin
    .from("schedule_template_days")
    .delete()
    .eq("schedule_template_id", scheduleId);
  if (deleteDaysError) return { error: deleteDaysError.message };

  if (input.days.length > 0) {
    const { error: insertDaysError } = await admin.from("schedule_template_days").insert(
      input.days.map((d) => ({
        schedule_template_id: scheduleId,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
      })),
    );
    if (insertDaysError) return { error: insertDaysError.message };
  }

  revalidatePath("/schedules");
  return {};
}

export async function deleteScheduleTemplate(id: string): Promise<ActionResult> {
  if (!(await callerCanManageSchedules())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { data: schedule } = await admin.from("schedule_templates").select("is_default").eq("id", id).single();
  if (schedule?.is_default) {
    return {
      error: "No se puede eliminar el horario marcado como predeterminado. Marca otro horario como predeterminado primero.",
    };
  }

  const { error } = await admin.from("schedule_templates").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/schedules");
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/app/\(app\)/\(admin\)/schedules/actions.test.ts`
Expected: PASS, 4/4 tests

- [ ] **Step 5: Write `ScheduleForm.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { saveScheduleTemplate, type ScheduleDayInput } from "./actions";

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface ScheduleTemplateInitial {
  id: string;
  name: string;
  tolerance_minutes: number;
  is_default: boolean;
  days: ScheduleDayInput[];
}

interface DayRowState {
  day_of_week: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
}

function buildInitialDayRows(days: ScheduleDayInput[]): DayRowState[] {
  return Array.from({ length: 7 }, (_, day_of_week) => {
    const existing = days.find((d) => d.day_of_week === day_of_week);
    return {
      day_of_week,
      enabled: Boolean(existing),
      start_time: existing?.start_time.slice(0, 5) ?? "08:00",
      end_time: existing?.end_time.slice(0, 5) ?? "17:00",
    };
  });
}

export function ScheduleForm({ initial }: { initial?: ScheduleTemplateInitial }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [toleranceMinutes, setToleranceMinutes] = useState(String(initial?.tolerance_minutes ?? 0));
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [days, setDays] = useState<DayRowState[]>(buildInitialDayRows(initial?.days ?? []));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateDay(day_of_week: number, patch: Partial<DayRowState>) {
    setDays((prev) => prev.map((d) => (d.day_of_week === day_of_week ? { ...d, ...patch } : d)));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveScheduleTemplate({
        id: initial?.id,
        name,
        tolerance_minutes: Number(toleranceMinutes) || 0,
        is_default: isDefault,
        days: days
          .filter((d) => d.enabled)
          .map((d) => ({ day_of_week: d.day_of_week, start_time: d.start_time, end_time: d.end_time })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!initial) {
        setName("");
        setToleranceMinutes("0");
        setIsDefault(false);
        setDays(buildInitialDayRows([]));
      }
      setError(null);
      setOpen(false);
    });
  }

  const canSubmit = name.trim() !== "" && days.some((d) => d.enabled);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nuevo horario</Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar horario" : "Nuevo horario"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input placeholder="Ej. Ventas" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Minutos de tolerancia</Label>
          <Input
            type="number"
            min={0}
            value={toleranceMinutes}
            onChange={(e) => setToleranceMinutes(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Usar como horario por defecto
        </label>
        <div className="space-y-2">
          <Label>Días laborables</Label>
          {days.map((day) => (
            <div key={day.day_of_week} className="flex items-center gap-2">
              <label className="flex w-28 shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(e) => updateDay(day.day_of_week, { enabled: e.target.checked })}
                />
                {DAY_LABELS[day.day_of_week]}
              </label>
              <Input
                type="time"
                disabled={!day.enabled}
                value={day.start_time}
                onChange={(e) => updateDay(day.day_of_week, { start_time: e.target.value })}
              />
              <Input
                type="time"
                disabled={!day.enabled}
                value={day.end_time}
                onChange={(e) => updateDay(day.day_of_week, { end_time: e.target.value })}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !canSubmit}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Write `page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatScheduleLine, type ScheduleTemplate } from "@/lib/schedules";
import { ScheduleForm } from "./ScheduleForm";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import { deleteScheduleTemplate } from "./actions";

export default async function SchedulesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "schedules",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: schedules } = await supabase
    .from("schedule_templates")
    .select("id, name, tolerance_minutes, is_default, schedule_template_days(day_of_week, start_time, end_time)")
    .order("name");

  const rows = (schedules ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    tolerance_minutes: s.tolerance_minutes,
    is_default: s.is_default,
    days: (s.schedule_template_days ?? []).map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Horarios</h1>
        <ScheduleForm />
      </div>
      <p className="text-sm text-muted-foreground">
        Crea horarios con nombre y asígnalos a departamentos (por defecto) o a contactos individuales
        (excepción).
      </p>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Clock className="size-8" />
          <p className="text-sm">No hay horarios todavía.</p>
          <p className="text-xs">Crea el primero con el botón &quot;Nuevo horario&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Tolerancia</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const scheduleForFormat: ScheduleTemplate = {
                id: s.id,
                name: s.name,
                tolerance_minutes: s.tolerance_minutes,
                days: s.days,
              };
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.is_default && (
                      <Badge variant="secondary" className="ml-2">
                        Por defecto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatScheduleLine(scheduleForFormat)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.tolerance_minutes} min</TableCell>
                  <TableCell>
                    <ScheduleForm initial={s} />
                  </TableCell>
                  <TableCell>
                    {!s.is_default && (
                      <DeleteIconButton
                        confirmMessage={`¿Eliminar el horario "${s.name}"? Los departamentos o contactos que lo usen pasarán a usar el horario por defecto.`}
                        action={deleteScheduleTemplate.bind(null, s.id)}
                      />
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

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit`
Expected: errors from other not-yet-updated files are still expected; no NEW errors in the `schedules/` admin directory itself.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/\(admin\)/schedules
git commit -m "feat: rewrite Horarios admin page as a named-schedule CRUD list"
```

---

### Task 5: Departments admin — assign a default schedule

**Files:**
- Modify: `src/app/(app)/(admin)/departments/DepartmentForm.tsx`
- Modify: `src/app/(app)/(admin)/departments/actions.ts`
- Modify: `src/app/(app)/(admin)/departments/page.tsx`

- [ ] **Step 1: Extend `actions.ts`'s `saveDepartment`**

In `src/app/(app)/(admin)/departments/actions.ts`, change `saveDepartment` to accept and persist a `defaultScheduleId`:

```typescript
export async function saveDepartment(
  id: string | undefined,
  name: string,
  companyId: string,
  defaultScheduleId: string | null,
) {
  const supabase = await createClient();
  const payload = { name, company_id: companyId, default_schedule_id: defaultScheduleId };
  const query = id
    ? supabase.from("departments").update(payload).eq("id", id)
    : supabase.from("departments").insert(payload);
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/departments");
  return {};
}
```

(`deleteDepartment` is unchanged.)

- [ ] **Step 2: Extend `DepartmentForm.tsx`**

Add a schedule dropdown. The form needs a list of available schedules passed in as a new `schedules` prop:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveDepartment } from "./actions";

interface Company {
  id: string;
  name: string;
}

interface ScheduleOption {
  id: string;
  name: string;
}

interface DepartmentInput {
  id: string;
  name: string;
  companyId: string;
  defaultScheduleId: string | null;
}

export function DepartmentForm({
  companies,
  schedules,
  initial,
}: {
  companies: Company[];
  schedules: ScheduleOption[];
  initial?: DepartmentInput;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? "");
  const [defaultScheduleId, setDefaultScheduleId] = useState(initial?.defaultScheduleId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveDepartment(initial?.id, name, companyId, defaultScheduleId || null);
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) {
          setName("");
          setDefaultScheduleId("");
        }
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nuevo departamento</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar departamento" : "Nuevo departamento"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre del departamento"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona una empresa">
              {(value: string) => companies.find((c) => c.id === value)?.name ?? "Selecciona una empresa"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={defaultScheduleId} onValueChange={(v) => setDefaultScheduleId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Horario por defecto (opcional)">
              {(value: string) => schedules.find((s) => s.id === value)?.name ?? "Horario por defecto (opcional)"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {schedules.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name || !companyId}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Update `page.tsx`**

In `src/app/(app)/(admin)/departments/page.tsx`, fetch schedules and pass them to every `DepartmentForm` call, and select `default_schedule_id` alongside the existing columns:

```typescript
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, company_id, default_schedule_id, companies(name)")
    .order("name");
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: schedules } = await supabase.from("schedule_templates").select("id, name").order("name");
```

And update both `DepartmentForm` call sites:

```typescript
        <DepartmentForm companies={companies ?? []} schedules={schedules ?? []} />
```

```typescript
                    <DepartmentForm
                      companies={companies ?? []}
                      schedules={schedules ?? []}
                      initial={{
                        id: d.id,
                        name: d.name,
                        companyId: d.company_id,
                        defaultScheduleId: d.default_schedule_id,
                      }}
                    />
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no NEW errors in the `departments/` directory (errors elsewhere from earlier tasks are still expected).

- [ ] **Step 5: Run the existing departments tests**

Run: `bun run test -- src/app/\(app\)/\(admin\)/departments/actions.test.ts`
Expected: PASS, 3/3 (unchanged — these tests only cover `deleteDepartment`, which this task didn't touch)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/\(admin\)/departments
git commit -m "feat: let departments have a default schedule template"
```

---

### Task 6: `ContactForm` — replace free-form override with a schedule dropdown

**Files:**
- Modify: `src/app/(app)/contacts/actions.ts`
- Modify: `src/app/(app)/contacts/ContactForm.tsx`
- Modify: `src/app/(app)/contacts/[id]/page.tsx`

- [ ] **Step 1: Update `ContactInput` and `saveContact` in `actions.ts`**

Replace the four `schedule_*` fields in `ContactInput` with a single `schedule_id`:

```typescript
export interface ContactInput {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  extension: string;
  fleet_phone: string;
  has_whatsapp: boolean;
  company_id: string;
  department_id: string;
  position: string;
  birth_date: string;
  hire_date: string;
  hikvision_employee_no: string;
  schedule_id: string;
  reports_to_id: string;
  photo_url: string;
}
```

Replace `saveContact`'s body — remove the all-or-nothing schedule validation entirely (there's nothing left to validate, a dropdown can't be half-filled), and change the payload's schedule handling:

```typescript
export async function saveContact(input: ContactInput) {
  const supabase = await createClient();
  const { id, ...fields } = input;

  const payload = {
    ...fields,
    email: fields.email || null,
    extension: fields.extension || null,
    fleet_phone: fields.fleet_phone || null,
    birth_date: fields.birth_date || null,
    hire_date: fields.hire_date || null,
    hikvision_employee_no: fields.hikvision_employee_no || null,
    schedule_id: fields.schedule_id || null,
    company_id: fields.company_id || null,
    department_id: fields.department_id || null,
    reports_to_id: fields.reports_to_id || null,
    photo_url: fields.photo_url || null,
  };

  const query = id
    ? supabase.from("contacts").update(payload).eq("id", id)
    : supabase.from("contacts").insert(payload);

  const { error } = await query;
  if (error) return { error: error.message };

  await provisionContactLogin(payload.email);

  revalidatePath("/contacts");
  redirect("/contacts");
}
```

- [ ] **Step 2: Update `ContactForm.tsx`**

Add a `schedules: { id: string; name: string }[]` prop, replace the default `useState` initializer's four schedule fields with `schedule_id: ""`, remove the `toggleWorkday` helper (no longer needed) and the all-or-nothing check at the top of `submit()`, and replace the JSX block for the four fields with a single dropdown:

```typescript
export function ContactForm({
  companies,
  departments,
  supervisors,
  schedules,
  initial,
}: {
  companies: Option[];
  departments: DepartmentOption[];
  supervisors: Option[];
  schedules: Option[];
  initial?: ContactInput;
}) {
  const [form, setForm] = useState<ContactInput>(
    initial ?? {
      first_name: "",
      last_name: "",
      email: "",
      extension: "",
      fleet_phone: "",
      has_whatsapp: false,
      company_id: "",
      department_id: "",
      position: "",
      birth_date: "",
      hire_date: "",
      hikvision_employee_no: "",
      schedule_id: "",
      reports_to_id: "",
      photo_url: "",
    },
  );
```

(`Option` is the existing `{ id: string; name: string }` interface already defined at the top of this file — reuse it for the `schedules` prop's type rather than defining a new one.)

```typescript
  function submit() {
    startTransition(async () => {
      let photoUrl = form.photo_url;

      if (photoFile) {
        const supabase = createBrowserClient();
        const path = `${crypto.randomUUID()}-${sanitizeFileName(photoFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("contact-photos")
          .upload(path, photoFile);
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        const { data } = supabase.storage.from("contact-photos").getPublicUrl(path);
        photoUrl = data.publicUrl;
      }

      const result = await saveContact({ ...form, photo_url: photoUrl });
      if (result?.error) setError(result.error);
    });
  }
```

Replace the JSX block that currently renders the "Horario personalizado" heading, the two time inputs, the day checkboxes, and the tolerance-minutes input (everything between the Hikvision field and the photo-upload field) with:

```typescript
      <div className="space-y-1">
        <Label>Horario (excepción)</Label>
        <Select value={form.schedule_id} onValueChange={(v) => field("schedule_id", v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Usar el horario de mi departamento">
              {(value: string) =>
                schedules.find((s) => s.id === value)?.name ?? "Usar el horario de mi departamento"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {schedules.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
```

Also remove the now-unused `toggleWorkday` function entirely (it's no longer referenced anywhere in this file).

- [ ] **Step 3: Update `[id]/page.tsx`**

Replace the four schedule fields in the `initial` object with `schedule_id`, and fetch schedules to pass into `ContactForm`:

```typescript
  const { data: schedules } = await supabase.from("schedule_templates").select("id, name").order("name");
```

```typescript
        <ContactForm
          companies={companies ?? []}
          departments={departments ?? []}
          supervisors={(existingContacts ?? []).map((c) => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
          }))}
          schedules={schedules ?? []}
          initial={{
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email ?? "",
            extension: contact.extension ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            has_whatsapp: contact.has_whatsapp,
            company_id: contact.company_id ?? "",
            department_id: contact.department_id ?? "",
            position: contact.position ?? "",
            birth_date: contact.birth_date ?? "",
            hire_date: contact.hire_date ?? "",
            hikvision_employee_no: contact.hikvision_employee_no ?? "",
            schedule_id: contact.schedule_id ?? "",
            reports_to_id: contact.reports_to_id ?? "",
            photo_url: contact.photo_url ?? "",
          }}
        />
```

`src/app/(app)/contacts/new/page.tsx` also renders `<ContactForm>` (with no `initial` prop). Its current full content is:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../ContactForm";

export default async function NewContactPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  if (!flagsRows?.[0]?.can_add) {
    redirect("/contacts");
  }

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, company_id")
    .order("name");
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .order("first_name");

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">Nuevo contacto</h1>
      <ContactForm
        companies={companies ?? []}
        departments={departments ?? []}
        supervisors={(existingContacts ?? []).map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
        }))}
      />
    </div>
  );
}
```

Add a `schedules` fetch (same query used in `[id]/page.tsx`) and pass it into `<ContactForm>`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../ContactForm";

export default async function NewContactPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  if (!flagsRows?.[0]?.can_add) {
    redirect("/contacts");
  }

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, company_id")
    .order("name");
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .order("first_name");
  const { data: schedules } = await supabase.from("schedule_templates").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">Nuevo contacto</h1>
      <ContactForm
        companies={companies ?? []}
        departments={departments ?? []}
        supervisors={(existingContacts ?? []).map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
        }))}
        schedules={schedules ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no NEW errors in `contacts/actions.ts`, `contacts/ContactForm.tsx`, `contacts/[id]/page.tsx`, or `contacts/new/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/contacts/actions.ts src/app/\(app\)/contacts/ContactForm.tsx "src/app/(app)/contacts/[id]/page.tsx" src/app/\(app\)/contacts/new/page.tsx
git commit -m "feat: replace free-form contact schedule override with a schedule dropdown"
```

---

### Task 7: Profile display — replace prop-threading with a pre-resolved `schedule_line`

**Files:**
- Modify: `src/lib/contacts.ts` (the `BirthdayContact` interface)
- Modify: `src/lib/contacts.test.ts` (fixture helper)
- Modify: `src/app/(app)/contacts/ContactsTable.tsx`
- Modify: `src/app/(app)/contacts/ContactsCards.tsx`
- Modify: `src/app/(app)/contacts/ContactsGrouped.tsx`
- Modify: `src/app/(app)/contacts/ContactsOrgChart.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`
- Modify: `src/app/(app)/contacts/ContactViewDialog.tsx`
- Modify: `src/app/(app)/contacts/MyProfileCard.tsx`
- Modify: `src/app/(app)/contacts/BirthdayContactModal.tsx`
- Modify: `src/app/(app)/contacts/BirthdaysWidget.tsx`
- Modify: `src/app/(app)/contacts/BirthdaysCoverflow.tsx`
- Modify: `src/app/(app)/contacts/TodayBirthdayCard.tsx`
- Modify: `src/app/(app)/page.tsx`

This is the mirror image of the original Horarios plan's profile-display task: instead of adding a `companySchedule` prop to every one of these files, this task REMOVES it — every one of these components currently has a `companySchedule: CompanySchedule` prop that needs to disappear, replaced by reading a plain `schedule_line: string` field directly off the contact/profile data it already receives.

- [ ] **Step 1: Update `ContactRow` and its query in `ContactsTable.tsx`/`page.tsx`**

In `src/app/(app)/contacts/ContactsTable.tsx`, replace the four `schedule_*` fields in `ContactRow` with `schedule_line: string`, and remove the `companySchedule` prop entirely from `ContactsTable`:

```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mail, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import { ContactViewDialog } from "./ContactViewDialog";

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  position: string | null;
  status: string;
  extension: string | null;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  photo_url: string | null;
  hire_date: string | null;
  schedule_line: string;
  reports_to_id: string | null;
  companies: { name: string } | null;
  departments: { name: string } | null;
}

export function ContactsTable({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
```

And its single `<ContactViewDialog>` call loses the `companySchedule` prop:

```typescript
                <ContactViewDialog contact={c} canEdit={canEdit}>
```

- [ ] **Step 2: Update `ContactsCards.tsx`, `ContactsGrouped.tsx`, `ContactsOrgChart.tsx`**

In `ContactsCards.tsx`, remove the `companySchedule` prop and its `CompanySchedule` import, and drop it from the `<ContactViewDialog>` call:

```typescript
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import { ContactViewDialog } from "./ContactViewDialog";
import type { ContactRow } from "./ContactsTable";

export function ContactsCards({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
```

```typescript
          <ContactViewDialog contact={c} canEdit={canEdit}>
```

In `ContactsGrouped.tsx`, same removal, and it stops forwarding the prop to `ContactsTable`:

```typescript
import { ContactsTable, type ContactRow } from "./ContactsTable";

export function ContactsGrouped({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
```

```typescript
            <ContactsTable contacts={groupContacts} canEdit={canEdit} />
```

In `ContactsOrgChart.tsx`, remove the `CompanySchedule` import and the prop from all three levels (`ContactsOrgChart`, `OrgBranch`, `OrgPerson`):

```typescript
function OrgPerson({
  contact,
  depth,
  canEdit,
}: {
  contact: OrgContact;
  depth: number;
  canEdit: boolean;
}) {
```

```typescript
    <ContactViewDialog contact={contact} canEdit={canEdit}>
```

```typescript
function OrgBranch({
  node,
  depth,
  canEdit,
  collapsed,
  onToggle,
}: {
  node: OrgTreeNode<OrgContact>;
  depth: number;
  canEdit: boolean;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
```

```typescript
      <OrgPerson contact={node.contact} depth={depth} canEdit={canEdit} />
```

```typescript
                      <OrgBranch
                        node={child}
                        depth={depth + 1}
                        canEdit={canEdit}
                        collapsed={collapsed}
                        onToggle={onToggle}
                      />
```

```typescript
export function ContactsOrgChart({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
```

```typescript
          {tree.map((node) => (
            <OrgBranch
              key={node.contact.id}
              node={node}
              depth={0}
              canEdit={canEdit}
              collapsed={collapsed}
              onToggle={toggle}
            />
          ))}
```

- [ ] **Step 3: Rewrite the data-fetching in `contacts/page.tsx`**

Replace the `company_schedule` fetch and the four schedule columns in the select/mapping with `getScheduleTemplatesContext()` and a per-row `resolveScheduleLine` call. Fetch departments' `default_schedule_id` alongside the existing department fetch, and select `department_id` from `contacts` (already selected for filtering — just also read it during mapping, then discard it, so `ContactRow` itself never needs a `department_id` field):

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookUser } from "lucide-react";
import { escapeIlikePattern } from "@/lib/contacts";
import { resolveScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import { SearchFilters } from "./SearchFilters";
import { ContactsTable, type ContactRow } from "./ContactsTable";
import { ContactsCards } from "./ContactsCards";
import { ContactsGrouped } from "./ContactsGrouped";
import { ContactsOrgChart } from "./ContactsOrgChart";
import { ExportContactsButton } from "./ExportContactsButton";
import { ImportContactsDialog } from "./ImportContactsDialog";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    company?: string;
    department?: string;
    showInactive?: string;
    view?: string;
  }>;
}) {
  const { q, company, department, showInactive, view } = await searchParams;

  const activeView =
    view === "cards" ? "cards" : view === "grouped" ? "grouped" : view === "org" ? "org" : "table";
  function viewHref(target: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (company) params.set("company", company);
    if (department) params.set("department", department);
    if (showInactive) params.set("showInactive", showInactive);
    params.set("view", target);
    return `/contacts?${params.toString()}`;
  }

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  let query = supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, position, company_id, department_id, status, extension, fleet_phone, has_whatsapp, birth_date, photo_url, hire_date, schedule_id, reports_to_id, companies(name), departments(name)",
    )
    .order("first_name");

  if (!showInactive || !(flags.can_deactivate || flags.can_delete)) {
    query = query.eq("status", "active");
  }
  if (q) {
    const pattern = escapeIlikePattern(q);
    query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }
  if (company) {
    query = query.eq("company_id", company);
  }
  if (department) {
    query = query.eq("department_id", department);
  }

  const { data: contacts } = await query;
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, company_id, default_schedule_id")
    .order("name");
  const { schedulesById, defaultSchedule } = await getScheduleTemplatesContext();
  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));

  const contactRows: ContactRow[] = (contacts ?? []).map((c) => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    position: c.position,
    status: c.status,
    extension: c.extension,
    fleet_phone: c.fleet_phone,
    has_whatsapp: c.has_whatsapp,
    photo_url: c.photo_url,
    hire_date: c.hire_date,
    schedule_line: resolveScheduleLine(
      c.schedule_id,
      c.department_id ? departmentDefaultById.get(c.department_id) : null,
      schedulesById,
      defaultSchedule,
    ),
    reports_to_id: c.reports_to_id,
    companies: (c.companies as unknown as { name: string } | null) ?? null,
    departments: (c.departments as unknown as { name: string } | null) ?? null,
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Agenda de contactos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ExportContactsButton />
          {flags.can_add && <ImportContactsDialog />}
          {flags.can_add && (
            <Link href="/contacts/new" className="text-sm underline">
              Nuevo contacto
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        <a
          href={viewHref("table")}
          className={`rounded-lg px-3 py-1 ${activeView === "table" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Tabla
        </a>
        <a
          href={viewHref("cards")}
          className={`rounded-lg px-3 py-1 ${activeView === "cards" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Tarjetas
        </a>
        <a
          href={viewHref("grouped")}
          className={`rounded-lg px-3 py-1 ${activeView === "grouped" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Agrupado
        </a>
        <a
          href={viewHref("org")}
          className={`rounded-lg px-3 py-1 ${activeView === "org" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Organigrama
        </a>
      </div>
      <SearchFilters
        companies={companies ?? []}
        departments={departments ?? []}
        canSeeInactiveToggle={Boolean(flags.can_deactivate || flags.can_delete)}
      />
      {contactRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <BookUser className="size-8" />
          <p className="text-sm">No hay contactos todavía.</p>
          {flags.can_add && (
            <p className="text-xs">Crea el primero con el botón &quot;Nuevo contacto&quot;.</p>
          )}
        </div>
      ) : activeView === "cards" ? (
        <ContactsCards contacts={contactRows} canEdit={Boolean(flags.can_edit)} />
      ) : activeView === "grouped" ? (
        <ContactsGrouped contacts={contactRows} canEdit={Boolean(flags.can_edit)} />
      ) : activeView === "org" ? (
        <ContactsOrgChart contacts={contactRows} canEdit={Boolean(flags.can_edit)} />
      ) : (
        <ContactsTable contacts={contactRows} canEdit={Boolean(flags.can_edit)} />
      )}
    </div>
  );
}
```

`SearchFilters`'s `departments` prop type only reads `id`/`name`/`company_id` today — passing the extra `default_schedule_id` field along is harmless (structurally compatible, TypeScript's object-literal excess-property checking doesn't apply to values passed through an already-typed array binding like this).

- [ ] **Step 4: Update `ContactViewDialog.tsx`**

Remove the `companySchedule` prop and the `getEffectiveSchedule`/`formatScheduleLine`/`CompanySchedule` imports; read `contact.schedule_line` directly:

```typescript
"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Clock, Mail, MessageCircle, Phone } from "lucide-react";
import { formatTenure, getBusinessToday, whatsappUrl } from "@/lib/contacts";
import type { ContactRow } from "./ContactsTable";

export function ContactViewDialog({
  contact,
  canEdit,
  children,
}: {
  contact: ContactRow;
  canEdit: boolean;
  children: ReactNode;
}) {
  const hasContactInfo = Boolean(
    contact.extension || contact.fleet_phone || contact.email || contact.hire_date,
  );
  const tenure = contact.hire_date ? formatTenure(contact.hire_date, getBusinessToday()) : null;
```

Everything else in the file is unchanged, including the JSX rendering `{scheduleLine}` — just replace that one identifier with `{contact.schedule_line}`.

- [ ] **Step 5: Update `MyProfileCard.tsx`**

```typescript
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatTenure, getInitials } from "@/lib/contacts";

export interface MyProfileCardData {
  name: string;
  position: string | null;
  photo_url: string | null;
  hire_date: string | null;
  schedule_line: string;
}

export function MyProfileCard({ data, today }: { data: MyProfileCardData; today: Date }) {
  const tenure = data.hire_date ? formatTenure(data.hire_date, today) : null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 flex w-full flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-6 text-center duration-700">
      <Avatar className="size-28 border-2 border-[#04B1AF] shadow-sm">
        <AvatarImage src={data.photo_url ?? undefined} alt="" />
        <AvatarFallback className="text-2xl">{getInitials(data.name)}</AvatarFallback>
      </Avatar>
      <p className="mt-3 max-w-[200px] truncate text-base font-semibold">{data.name}</p>
      {data.position && (
        <p className="max-w-[200px] truncate text-sm text-muted-foreground">{data.position}</p>
      )}
      {tenure && (
        <div className="mt-2 w-full border-t pt-2 text-xs">
          <span className="text-muted-foreground">Tiempo en la empresa</span>
          <p className="font-medium">{tenure}</p>
        </div>
      )}
      <div className="mt-2 w-full border-t pt-2 text-xs">
        <span className="text-muted-foreground">Horario</span>
        <p className="font-medium">{data.schedule_line}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `src/lib/contacts.ts`'s `BirthdayContact` and `BirthdayContactModal.tsx`**

In `src/lib/contacts.ts`, replace the four `schedule_*` fields with `schedule_line: string`:

```typescript
export interface BirthdayContact {
  id: string;
  name: string;
  birth_date: string | null;
  photo_url: string | null;
  position: string | null;
  email: string | null;
  extension: string | null;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  hire_date: string | null;
  schedule_line: string;
  company_name: string | null;
  department_name: string | null;
}
```

In `src/lib/contacts.test.ts`, update the `contact()` fixture helper's default object to match (replace the four `schedule_*: null` lines with `schedule_line: "Lunes a viernes, 8:00 am – 5:00 pm"`).

In `BirthdayContactModal.tsx`, remove the `companySchedule` prop and the `getEffectiveSchedule`/`formatScheduleLine`/`CompanySchedule` imports; read `contact.schedule_line` directly:

```typescript
"use client";

import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Cake, CalendarClock, Clock, Mail, Phone } from "lucide-react";
import {
  formatMonthDay,
  formatTenure,
  getBusinessToday,
  getInitials,
  whatsappUrl,
  type BirthdayContact,
} from "@/lib/contacts";

export function BirthdayContactModal({
  contact,
  trigger,
}: {
  contact: BirthdayContact;
  trigger: ReactElement;
}) {
  const tenure = contact.hire_date ? formatTenure(contact.hire_date, getBusinessToday()) : null;
```

Everything else is unchanged, including the JSX rendering `{scheduleLine}` — replace that identifier with `{contact.schedule_line}`.

- [ ] **Step 7: Update `BirthdaysWidget.tsx`, `BirthdaysCoverflow.tsx`, `TodayBirthdayCard.tsx`**

In `BirthdaysWidget.tsx`, remove the `companySchedule` prop and its import, and drop it from all three forwarding calls:

```typescript
import { Cake } from "lucide-react";
import type { BirthdayContact } from "@/lib/contacts";
import { BirthdaysCoverflow } from "./BirthdaysCoverflow";
import { TodayBirthdayCard } from "./TodayBirthdayCard";
import { EventsWidget, type CompanyEvent } from "./EventsWidget";
import { NewsWidget, type NewsItem } from "./NewsWidget";
import { MyProfileCard, type MyProfileCardData } from "./MyProfileCard";

export function BirthdaysWidget({
  myProfile,
  today,
  todayContacts,
  upcomingContacts,
  events,
  news,
}: {
  myProfile: MyProfileCardData | null;
  today: Date;
  todayContacts: BirthdayContact[];
  upcomingContacts: BirthdayContact[];
  events: CompanyEvent[];
  news: NewsItem[];
}) {
```

```typescript
        {myProfile && <MyProfileCard data={myProfile} today={today} />}
```

```typescript
          <TodayBirthdayCard contacts={todayContacts} />
```

```typescript
          <BirthdaysCoverflow contacts={upcomingContacts} />
```

In `TodayBirthdayCard.tsx`, remove the prop and its import:

```typescript
export function TodayBirthdayCard({ contacts }: { contacts: BirthdayContact[] }) {
```

```typescript
      <BirthdayContactModal
        contact={contact}
        trigger={
```

In `BirthdaysCoverflow.tsx`, same removal:

```typescript
export function BirthdaysCoverflow({
  contacts,
  compact = false,
}: {
  contacts: BirthdayContact[];
  compact?: boolean;
}) {
```

```typescript
              <BirthdayContactModal
                key={c.id}
                contact={c}
                trigger={
```

- [ ] **Step 8: Rewrite the data-fetching in `src/app/(app)/page.tsx`**

```typescript
import { createClient } from "@/lib/supabase/server";
import { getBusinessToday, getUpcomingBirthdays, splitTodayBirthdays, type BirthdayContact } from "@/lib/contacts";
import { resolveScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";
import type { MyProfileCardData } from "./contacts/MyProfileCard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });

  const today = getBusinessToday();
  const todayIso = today.toISOString().slice(0, 10);
  const { data: upcomingEvents } = await supabase
    .from("company_events")
    .select("id, name, event_date")
    .gte("event_date", todayIso)
    .order("event_date")
    .limit(5);

  const { data: activeNews } = await supabase
    .from("company_news")
    .select("id, title, description, image_url, link_url, start_date, end_date")
    .lte("start_date", todayIso)
    .gte("end_date", todayIso)
    .order("start_date")
    .limit(5);

  const { schedulesById, defaultSchedule } = await getScheduleTemplatesContext();
  const { data: departments } = await supabase.from("departments").select("id, default_schedule_id");
  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));

  let myProfile: MyProfileCardData | null = null;
  if (user?.email) {
    const { data: myContact } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date, schedule_id, department_id")
      .eq("email", user.email)
      .maybeSingle();

    if (myContact) {
      myProfile = {
        name: `${myContact.first_name} ${myContact.last_name}`,
        position: myContact.position,
        photo_url: myContact.photo_url,
        hire_date: myContact.hire_date,
        schedule_line: resolveScheduleLine(
          myContact.schedule_id,
          myContact.department_id ? departmentDefaultById.get(myContact.department_id) : null,
          schedulesById,
          defaultSchedule,
        ),
      };
    }
  }

  let todayBirthdays: BirthdayContact[] = [];
  let upcomingBirthdays: BirthdayContact[] = [];
  if (flagsRows?.[0]?.can_view) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, birth_date, photo_url, position, email, extension, fleet_phone, has_whatsapp, hire_date, schedule_id, department_id, companies(name), departments(name)",
      )
      .eq("status", "active");

    const allBirthdayContacts: BirthdayContact[] = (contacts ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      birth_date: c.birth_date,
      photo_url: c.photo_url,
      position: c.position,
      email: c.email,
      extension: c.extension,
      fleet_phone: c.fleet_phone,
      has_whatsapp: c.has_whatsapp,
      hire_date: c.hire_date,
      schedule_line: resolveScheduleLine(
        c.schedule_id,
        c.department_id ? departmentDefaultById.get(c.department_id) : null,
        schedulesById,
        defaultSchedule,
      ),
      company_name: (c.companies as unknown as { name: string } | null)?.name ?? null,
      department_name: (c.departments as unknown as { name: string } | null)?.name ?? null,
    }));

    const split = splitTodayBirthdays(allBirthdayContacts, today);
    todayBirthdays = split.todayBirthdays;
    upcomingBirthdays = getUpcomingBirthdays(split.rest, today, 7);
  }

  return (
    <div className="space-y-4 p-6">
      {!myProfile && (
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Bienvenido</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      )}
      <BirthdaysWidget
        myProfile={myProfile}
        today={today}
        todayContacts={todayBirthdays}
        upcomingContacts={upcomingBirthdays}
        events={upcomingEvents ?? []}
        news={activeNews ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 9: Run tests and type-check**

Run: `bun run test -- src/lib/contacts.test.ts`
Expected: PASS, all tests green (the fixture update from Step 6 should be the only change needed)

Run: `bunx tsc --noEmit`
Expected: clean — this is the task that resolves every remaining error introduced back in Task 2. If any error remains, it means a `companySchedule`/`CompanySchedule`/`getEffectiveSchedule`/`formatScheduleLine` reference was missed in one of the 13 files this task touches — grep for `companySchedule` and `CompanySchedule` across `src/app/(app)/contacts/` and `src/app/(app)/page.tsx` to confirm zero remaining matches.

- [ ] **Step 10: Commit**

```bash
git add src/lib/contacts.ts src/lib/contacts.test.ts "src/app/(app)/contacts/ContactsTable.tsx" "src/app/(app)/contacts/ContactsCards.tsx" "src/app/(app)/contacts/ContactsGrouped.tsx" "src/app/(app)/contacts/ContactsOrgChart.tsx" "src/app/(app)/contacts/page.tsx" "src/app/(app)/contacts/ContactViewDialog.tsx" "src/app/(app)/contacts/MyProfileCard.tsx" "src/app/(app)/contacts/BirthdayContactModal.tsx" "src/app/(app)/contacts/BirthdaysWidget.tsx" "src/app/(app)/contacts/BirthdaysCoverflow.tsx" "src/app/(app)/contacts/TodayBirthdayCard.tsx" "src/app/(app)/page.tsx"
git commit -m "feat: resolve effective schedule once per contact instead of threading it through every component"
```

---

### Task 8: Integration tests — RLS, single-default constraint, cascade behavior

**Files:**
- Create: `src/test/integration/scheduleTemplatesRls.test.ts`

This requires Task 1's migration to be live (it already is, from Task 1's STOP checkpoint). It does NOT require Task 9 (the destructive migration) — these tests only exercise `schedule_templates`/`schedule_template_days`, which exist independently of whether the old columns have been dropped yet.

- [ ] **Step 1: Write the tests**

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("schedule_templates / schedule_template_days RLS and constraints", () => {
  let viewer: TestUser | undefined;
  let admin: TestUser | undefined;
  let createdScheduleId: string | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    admin = undefined;

    if (createdScheduleId) {
      const adminClient = createAdminClient();
      await adminClient.from("schedule_templates").delete().eq("id", createdScheduleId);
      createdScheduleId = undefined;
    }
  });

  it("lets any authenticated user read schedule_templates and schedule_template_days", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.from("schedule_templates").select("*");
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const { error: daysError } = await viewer.client.from("schedule_template_days").select("*");
    expect(daysError).toBeNull();
  });

  it("blocks a Viewer from inserting a schedule template", async () => {
    viewer = await createTestUser("Viewer");

    const { error } = await viewer.client
      .from("schedule_templates")
      .insert({ name: `Should Fail ${crypto.randomUUID()}`, tolerance_minutes: 0 });

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin insert a schedule template", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("schedule_templates")
      .insert({ name: `Test Schedule ${admin.id}`, tolerance_minutes: 0 })
      .select()
      .single();

    expect(error).toBeNull();
    createdScheduleId = data?.id;
  });

  it("rejects a second row with is_default = true", async () => {
    const adminClient = createAdminClient();
    const { data: created, error: createError } = await adminClient
      .from("schedule_templates")
      .insert({ name: `Test Second Default ${crypto.randomUUID()}`, tolerance_minutes: 0, is_default: true })
      .select()
      .single();

    expect(createError).not.toBeNull();
    createdScheduleId = created?.id;
  });

  it("deleting a schedule that a department references sets that department's default_schedule_id to null", async () => {
    const adminClient = createAdminClient();
    const { data: schedule } = await adminClient
      .from("schedule_templates")
      .insert({ name: `Test Cascade ${crypto.randomUUID()}`, tolerance_minutes: 0 })
      .select()
      .single();
    createdScheduleId = schedule!.id;

    const { data: company } = await adminClient
      .from("companies")
      .insert({ name: `Test Co ${crypto.randomUUID()}` })
      .select()
      .single();
    const { data: department } = await adminClient
      .from("departments")
      .insert({ name: `Test Dept ${crypto.randomUUID()}`, company_id: company!.id, default_schedule_id: schedule!.id })
      .select()
      .single();

    await adminClient.from("schedule_templates").delete().eq("id", schedule!.id);
    createdScheduleId = undefined;

    const { data: reloadedDepartment } = await adminClient
      .from("departments")
      .select("default_schedule_id")
      .eq("id", department!.id)
      .single();
    expect(reloadedDepartment?.default_schedule_id).toBeNull();

    await adminClient.from("departments").delete().eq("id", department!.id);
    await adminClient.from("companies").delete().eq("id", company!.id);
  });

  it("deleting a schedule also deletes its schedule_template_days rows (cascade)", async () => {
    const adminClient = createAdminClient();
    const { data: schedule } = await adminClient
      .from("schedule_templates")
      .insert({ name: `Test Days Cascade ${crypto.randomUUID()}`, tolerance_minutes: 0 })
      .select()
      .single();
    const scheduleId = schedule!.id;

    await adminClient
      .from("schedule_template_days")
      .insert({ schedule_template_id: scheduleId, day_of_week: 1, start_time: "08:00", end_time: "17:00" });

    await adminClient.from("schedule_templates").delete().eq("id", scheduleId);

    const { data: remainingDays } = await adminClient
      .from("schedule_template_days")
      .select("*")
      .eq("schedule_template_id", scheduleId);
    expect(remainingDays).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `bun run test -- src/test/integration/scheduleTemplatesRls.test.ts`
Expected: PASS, 6/6

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/scheduleTemplatesRls.test.ts
git commit -m "test: add integration coverage for schedule_templates RLS and constraints"
```

---

### Task 9: Migration 2 — drop the legacy schedule columns (destructive, deploy-gated)

**Files:**
- Create: `supabase/migrations/20260811160000_drop_legacy_schedule_columns.sql`

**Do not write this file's content into the Supabase SQL Editor as part of this task.** This task only creates the migration FILE (for the repository's record) — actually applying it is a separate, explicitly-gated action described in Step 3.

- [ ] **Step 1: Write the migration file**

```sql
drop table public.company_schedule;

alter table public.contacts drop column schedule_start_time;
alter table public.contacts drop column schedule_end_time;
alter table public.contacts drop column schedule_workdays;
alter table public.contacts drop column schedule_tolerance_minutes;

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
  is_self boolean;
begin
  select * into flags from public.get_my_module_permissions('contacts');

  select exists (
    select 1 from public.app_users au
    where au.id = auth.uid() and au.email = old.email
  ) into is_self;

  if flags is null and not is_self then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.position, new.fleet_phone, new.extension, new.has_whatsapp
  ) is distinct from (
    old.position, old.fleet_phone, old.extension, old.has_whatsapp
  ) and not (is_self or coalesce(flags.can_edit, false)) then
    raise exception 'not authorized to edit contact fields';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.department_id, new.company_id,
    new.photo_url, new.reports_to_id, new.birth_date, new.hire_date, new.hikvision_employee_no,
    new.schedule_id
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date, old.hire_date, old.hikvision_employee_no,
    old.schedule_id
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;
```

- [ ] **Step 2: Commit the file (without applying it)**

```bash
git add supabase/migrations/20260811160000_drop_legacy_schedule_columns.sql
git commit -m "chore: add (not yet applied) migration to drop legacy schedule columns"
```

- [ ] **Step 3: STOP — this is the deploy-gated checkpoint**

Do not paste this migration into Supabase's SQL Editor yet, even after this commit. This is the destructive migration described in the "CRITICAL: Migration timing" section at the top of this plan.

Report to the human, verbatim: *"All code is written and tested. Before this migration can be safely applied, this branch needs to be merged to `main` and deployed to production, and you need to confirm the new deployment is live. Once you've confirmed that, tell me, and I'll give you this exact migration file to paste into the Supabase SQL Editor."*

This plan's remaining "final checkpoint" section happens BEFORE this migration is applied — merging and deploying comes first, then this migration, in that order.

---

## Final checkpoint (before merge)

Run the full verification pass:

```bash
bun run test
bunx tsc --noEmit
```

Both must be clean (aside from the known pre-existing Supabase-auth rate-limit flakiness in unrelated files). Then hand off to `superpowers:finishing-a-development-branch` as usual — but remember: this branch's merge-and-deploy has to happen, and be confirmed live, BEFORE Task 9's migration file gets pasted into Supabase. Don't let "finish the branch" and "apply the last migration" collapse into the same moment — there must be a real gap between deploy and that final SQL paste.
