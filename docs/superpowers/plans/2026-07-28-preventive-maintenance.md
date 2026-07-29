# Módulo de Mantenimiento Preventivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitize the paper "Formulario de Mantenimiento Preventivo": a technician creates a maintenance record from an existing Agenda contact, shares a token link that both the technician and the user fill in and sign (in person or remotely), and on completion the app generates a PDF, emails it to `acusesdeti@sanchezbusinesscorp.com`, and emails a 5-question NPS satisfaction survey to the user.

**Architecture:** Two new Postgres tables (`maintenance_records`, `maintenance_surveys`) gated by the existing per-module RLS pattern (`get_my_module_permissions('maintenance')`) for the authenticated technician side. Two new public, token-authenticated routes (`/mantenimiento/[token]`, `/encuesta/[token]`) sit outside the `(app)` route group and access data exclusively through the service-role admin client after validating the token server-side — never through user-session RLS. A from-scratch PDF report is built with `pdf-lib` (new usage pattern for this repo — existing code only stamps images onto uploaded PDFs). Email is sent with a newly-added `nodemailer` dependency, configured from a new `email_settings` table populated by extending the existing SMTP form in Ajustes (Supabase's own SMTP config API doesn't expose credentials back for reuse).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Storage + Auth, no ORM, hand-written SQL migrations), `pdf-lib` 1.17.1, `nodemailer` (new), Vitest 4, TypeScript, Tailwind + shadcn-style components (`@/components/ui/*`).

**Spec:** `docs/superpowers/specs/2026-07-28-preventive-maintenance-design.md`

---

## Conventions used throughout this plan

- Module key: `maintenance`, label `"Mantenimientos"`. Uses only `can_view` (see list/detail, see Encuestas), `can_add` (create records, resend email, retry completion — there is no `can_edit` for this module since content is only ever edited through the public token link, never re-edited from the authenticated app), and `can_delete` (cancel a pending record).
- Signature/PDF storage columns store **storage paths**, not public URLs (matching the `user_signatures.storage_path` / `company_seals.storage_path` convention) — `technician_signature_path`, `user_signature_path`, `pdf_path`. Signed URLs are generated on demand server-side when needed for display/download.
- Checklist item keys/labels are defined once in `src/lib/maintenanceChecklist.ts` and imported everywhere else that needs them (migration comment, public form, PDF builder, detail view) to avoid the 10 labels drifting out of sync.
- All new Supabase migration timestamps continue after the latest existing one (`20260723190000_app_users_status.sql`), dated today.
- Apply each migration locally with `supabase db reset` (rebuilds the local DB from all migrations) and verify no errors before moving on.

---

## Task 1: Register the `maintenance` module

**Files:**
- Create: `supabase/migrations/20260728100000_maintenance_module.sql`

- [ ] **Step 1: Write the migration**

```sql
insert into public.modules (key, label) values ('maintenance', 'Mantenimientos');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select
  rp.id,
  m.id,
  (rp.name = 'Super Admin'),
  (rp.name = 'Super Admin'),
  false,
  (rp.name = 'Super Admin'),
  false,
  false,
  false
from public.role_profiles rp
cross join public.modules m
where m.key = 'maintenance';
```

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset`
Expected: migration applies with no errors. Then run `supabase db execute --sql "select * from public.modules where key = 'maintenance';"` (or check via the Supabase Studio local UI) and confirm one row with `label = 'Mantenimientos'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728100000_maintenance_module.sql
git commit -m "feat: register the maintenance module and permissions"
```

---

## Task 2: `maintenance_records` table + RLS

**Files:**
- Create: `supabase/migrations/20260728100100_maintenance_records.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  contact_id uuid not null references public.contacts (id),
  created_by uuid not null references public.app_users (id),

  -- Snapshot of the contact at creation time (see design spec: the signed
  -- report must reflect the contact's state on the day of the visit, not
  -- whatever it is later).
  first_name text not null,
  last_name text not null,
  position text,
  company_name text,
  department_name text,
  email text,

  host_name text,
  ram text,
  os text,
  storage_total text,
  storage_used text,
  storage_free text,

  -- Checklist — keep in sync with src/lib/maintenanceChecklist.ts.
  restore_point_created boolean,
  temp_files_cleaned boolean,
  disk_defragmented boolean,
  antivirus_updated boolean,
  windows_updated boolean,
  agenda_installed boolean,
  apps_match_profile boolean,
  wallpaper_installed boolean,
  keyboard_cleaned boolean,
  screen_cleaned boolean,

  findings text,
  observations text,

  technician_signature_path text,
  technician_signed_at timestamptz,
  user_signature_path text,
  user_signed_at timestamptz,

  status text not null default 'pendiente' check (status in ('pendiente', 'completado', 'expirado')),
  pdf_path text,
  email_error text,

  expires_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.maintenance_records enable row level security;

-- No update policy: authenticated technicians never edit a record's content
-- from inside the app. All content/signature writes to this table happen
-- through the public token routes via the service-role admin client, which
-- bypasses RLS entirely (the token itself is the credential there).
create policy "maintenance_records_select" on public.maintenance_records
for select
using ( coalesce((select can_view from public.get_my_module_permissions('maintenance')), false) );

create policy "maintenance_records_insert" on public.maintenance_records
for insert
with check ( coalesce((select can_add from public.get_my_module_permissions('maintenance')), false) );

create policy "maintenance_records_delete" on public.maintenance_records
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('maintenance')), false) );
```

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728100100_maintenance_records.sql
git commit -m "feat: add maintenance_records table with per-module RLS"
```

---

## Task 3: `maintenance_surveys` table + RLS

**Files:**
- Create: `supabase/migrations/20260728100200_maintenance_surveys.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.maintenance_surveys (
  id uuid primary key default gen_random_uuid(),
  maintenance_record_id uuid not null unique references public.maintenance_records (id),
  technician_id uuid not null references public.app_users (id),
  token text not null unique,

  nps_score smallint check (nps_score between 0 and 10),
  quality_score smallint check (quality_score between 1 and 5),
  punctuality_score smallint check (punctuality_score between 1 and 5),
  professionalism_score smallint check (professionalism_score between 1 and 5),
  clarity_score smallint check (clarity_score between 1 and 5),
  comments text,

  status text not null default 'pendiente' check (status in ('pendiente', 'respondida')),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

alter table public.maintenance_surveys enable row level security;

-- Same reasoning as maintenance_records: insert/update happen exclusively
-- through the public /encuesta/[token] route via the admin client.
create policy "maintenance_surveys_select" on public.maintenance_surveys
for select
using ( coalesce((select can_view from public.get_my_module_permissions('maintenance')), false) );
```

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728100200_maintenance_surveys.sql
git commit -m "feat: add maintenance_surveys table with per-module RLS"
```

---

## Task 4: Storage buckets for signatures and PDF reports

**Files:**
- Create: `supabase/migrations/20260728100300_maintenance_storage_buckets.sql`

- [ ] **Step 1: Write the migration**

```sql
insert into storage.buckets (id, name, public)
values ('maintenance-signatures', 'maintenance-signatures', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('maintenance-reports', 'maintenance-reports', false)
on conflict (id) do nothing;

-- Deliberately no storage.objects policies for these two buckets: every read
-- and write goes through the service-role admin client from Server Actions
-- (technician-side downloads use signed URLs generated server-side; the
-- public token routes upload/download directly with the admin client). RLS
-- is enabled by default on storage.objects with zero policies, which denies
-- all access to the anon/authenticated roles — exactly what we want here.
```

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset`
Expected: no errors. Confirm both buckets exist via Supabase Studio's Storage section (or `supabase db execute --sql "select id from storage.buckets where id like 'maintenance-%';"`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728100300_maintenance_storage_buckets.sql
git commit -m "feat: add private storage buckets for maintenance signatures and reports"
```

---

## Task 5: `email_settings` table + extend the Ajustes SMTP form + add nodemailer

**Files:**
- Create: `supabase/migrations/20260728100400_email_settings.sql`
- Modify: `src/app/(app)/(admin)/settings/actions.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the migration**

```sql
create table public.email_settings (
  id boolean primary key default true,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_pass text,
  smtp_sender_name text,
  smtp_admin_email text,
  updated_at timestamptz not null default now(),
  constraint email_settings_singleton check (id)
);

insert into public.email_settings (id) values (true);

alter table public.email_settings enable row level security;
-- No policies: this table holds an SMTP password. It is written only by
-- saveSmtpSettings (via the admin client, after an explicit
-- get_my_module_permissions('settings').can_manage check in application
-- code) and read only by the maintenance email-sending code (also via the
-- admin client). RLS enabled with zero policies denies the anon and
-- authenticated roles entirely.
```

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset`
Expected: no errors. Confirm the singleton row exists: `select * from public.email_settings;` returns exactly one row with `id = true`.

- [ ] **Step 3: Add nodemailer**

Run: `npm install nodemailer` and `npm install --save-dev @types/nodemailer`
Expected: both added to `package.json` (`dependencies` and `devDependencies` respectively).

- [ ] **Step 4: Extend `saveSmtpSettings` to also persist to `email_settings`**

Replace the full contents of `src/app/(app)/(admin)/settings/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAuthConfig } from "@/lib/supabase/managementApi";

export interface SaveSmtpSettingsInput {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_sender_name: string;
  smtp_admin_email: string;
}

interface ActionResult {
  error?: string;
}

async function callerCanManageSettings(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "settings" });
  return Boolean(data?.[0]?.can_manage);
}

export async function saveSmtpSettings(input: SaveSmtpSettingsInput): Promise<ActionResult> {
  if (!(await callerCanManageSettings())) {
    return { error: "No autorizado" };
  }

  try {
    await updateAuthConfig({
      smtp_host: input.smtp_host,
      smtp_port: input.smtp_port,
      smtp_user: input.smtp_user,
      smtp_pass: input.smtp_pass,
      smtp_sender_name: input.smtp_sender_name,
      smtp_admin_email: input.smtp_admin_email,
      // Supabase's default email rate limit (2/hour) is meant for the
      // built-in test mailer; raise it now that real SMTP is configured.
      rate_limit_email_sent: 30,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar la configuración" };
  }

  // Mirror the same credentials into our own table so the maintenance
  // module's nodemailer transport can read them back — Supabase's Auth
  // config API doesn't expose the password on a GET, only on write.
  const admin = createAdminClient();
  const { error: mirrorError } = await admin
    .from("email_settings")
    .update({
      smtp_host: input.smtp_host,
      smtp_port: Number(input.smtp_port),
      smtp_user: input.smtp_user,
      smtp_pass: input.smtp_pass,
      smtp_sender_name: input.smtp_sender_name,
      smtp_admin_email: input.smtp_admin_email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (mirrorError) {
    return { error: `Configuración guardada en Supabase Auth, pero falló el guardado local: ${mirrorError.message}` };
  }

  revalidatePath("/settings");
  return {};
}
```

- [ ] **Step 5: Manually verify**

Start the dev server (`npm run dev`), sign in as a Super Admin, go to `/settings`, save the SMTP form, and confirm via `supabase db execute --sql "select smtp_host, smtp_port, smtp_user from public.email_settings;"` that the row now has your values.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260728100400_email_settings.sql src/app/\(app\)/\(admin\)/settings/actions.ts package.json package-lock.json
git commit -m "feat: mirror SMTP credentials into email_settings for nodemailer"
```

---

## Task 6: Shared checklist definition

**Files:**
- Create: `src/lib/maintenanceChecklist.ts`
- Test: `src/lib/maintenanceChecklist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { MAINTENANCE_CHECKLIST_ITEMS } from "./maintenanceChecklist";

describe("MAINTENANCE_CHECKLIST_ITEMS", () => {
  it("has exactly the 10 items from the paper form, in order", () => {
    expect(MAINTENANCE_CHECKLIST_ITEMS.map((i) => i.key)).toEqual([
      "restore_point_created",
      "temp_files_cleaned",
      "disk_defragmented",
      "antivirus_updated",
      "windows_updated",
      "agenda_installed",
      "apps_match_profile",
      "wallpaper_installed",
      "keyboard_cleaned",
      "screen_cleaned",
    ]);
  });

  it("has a non-empty Spanish label for every item", () => {
    for (const item of MAINTENANCE_CHECKLIST_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceChecklist.test.ts`
Expected: FAIL — cannot find module `./maintenanceChecklist`.

- [ ] **Step 3: Write the implementation**

```ts
export const MAINTENANCE_CHECKLIST_ITEMS = [
  { key: "restore_point_created", label: "Punto de restauración creado" },
  { key: "temp_files_cleaned", label: "Limpieza de archivos temporales" },
  { key: "disk_defragmented", label: "Desfragmentación de disco" },
  { key: "antivirus_updated", label: "Antivirus actualizado" },
  { key: "windows_updated", label: "Actualización de Windows" },
  { key: "agenda_installed", label: "Instalación de Gente Sánchez Business (Agenda)" },
  { key: "apps_match_profile", label: "Aplicaciones corresponden al perfil del usuario" },
  { key: "wallpaper_installed", label: "Fondo de pantalla corporativo instalado" },
  { key: "keyboard_cleaned", label: "Limpieza física de teclado" },
  { key: "screen_cleaned", label: "Limpieza física de pantalla" },
] as const;

export type MaintenanceChecklistKey = (typeof MAINTENANCE_CHECKLIST_ITEMS)[number]["key"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceChecklist.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceChecklist.ts src/lib/maintenanceChecklist.test.ts
git commit -m "feat: add shared maintenance checklist definition"
```

---

## Task 7: Token generation helper

**Files:**
- Create: `src/lib/maintenanceToken.ts`
- Test: `src/lib/maintenanceToken.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { generateMaintenanceToken } from "./maintenanceToken";

describe("generateMaintenanceToken", () => {
  it("returns a url-safe string long enough to resist guessing", () => {
    const token = generateMaintenanceToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(30);
  });

  it("returns a different value on each call", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateMaintenanceToken()));
    expect(tokens.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceToken.test.ts`
Expected: FAIL — cannot find module `./maintenanceToken`.

- [ ] **Step 3: Write the implementation**

```ts
import { randomBytes } from "crypto";

export function generateMaintenanceToken(): string {
  return randomBytes(24).toString("base64url");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceToken.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceToken.ts src/lib/maintenanceToken.test.ts
git commit -m "feat: add maintenance token generator"
```

---

## Task 8: Token expiry helper

**Files:**
- Create: `src/lib/maintenanceAccess.ts`
- Test: `src/lib/maintenanceAccess.test.ts`

This task only covers the pure, unit-testable expiry check. The DB-backed lookup (`loadMaintenanceRecordByToken`) is added in Task 17 once the public route that needs it exists.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isMaintenanceLinkExpired } from "./maintenanceAccess";

describe("isMaintenanceLinkExpired", () => {
  it("returns false when now is before expiresAt", () => {
    const expiresAt = new Date("2026-08-27T00:00:00Z").toISOString();
    const now = new Date("2026-07-28T00:00:00Z");
    expect(isMaintenanceLinkExpired(expiresAt, now)).toBe(false);
  });

  it("returns true when now is after expiresAt", () => {
    const expiresAt = new Date("2026-07-01T00:00:00Z").toISOString();
    const now = new Date("2026-07-28T00:00:00Z");
    expect(isMaintenanceLinkExpired(expiresAt, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceAccess.test.ts`
Expected: FAIL — cannot find module `./maintenanceAccess`.

- [ ] **Step 3: Write the implementation**

```ts
export function isMaintenanceLinkExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() < now.getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceAccess.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceAccess.ts src/lib/maintenanceAccess.test.ts
git commit -m "feat: add maintenance link expiry check"
```

---

## Task 9: Sidebar / layout permission plumbing

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Add the module flags in `layout.tsx`**

In `src/app/(app)/layout.tsx`, add `canViewMaintenance` to the `<AppShell>` props:

```tsx
    <AppShell
      email={user?.email}
      canViewContacts={Boolean(permissions.get("contacts")?.can_view)}
      canManageUsers={Boolean(permissions.get("users")?.can_manage)}
      canManageRoleProfiles={Boolean(permissions.get("role_profiles")?.can_manage)}
      canManageCompanies={Boolean(permissions.get("companies")?.can_manage)}
      canManageDepartments={Boolean(permissions.get("departments")?.can_manage)}
      canManageActivities={Boolean(permissions.get("activities")?.can_manage)}
      canManageSettings={Boolean(permissions.get("settings")?.can_manage)}
      canUseDocumentStamps={Boolean(permissions.get("document_stamps")?.can_add)}
      canViewMaintenance={Boolean(permissions.get("maintenance")?.can_view)}
      onLogout={logout}
    >
```

- [ ] **Step 2: Add the nav entry in `Sidebar.tsx`**

In `src/app/(app)/Sidebar.tsx`, add `Wrench` to the `lucide-react` import, add `canViewMaintenance` to the props type and destructuring, and add an entry to `mainLinks`:

```tsx
import {
  BookUser,
  Building2,
  FileSignature,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PartyPopper,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
```

```tsx
export function Sidebar({
  email,
  canViewContacts,
  canManageUsers,
  canManageRoleProfiles,
  canManageCompanies,
  canManageDepartments,
  canManageActivities,
  canManageSettings,
  canUseDocumentStamps,
  canViewMaintenance,
  onLogout,
  onNavigate,
}: {
  email?: string;
  canViewContacts: boolean;
  canManageUsers: boolean;
  canManageRoleProfiles: boolean;
  canManageCompanies: boolean;
  canManageDepartments: boolean;
  canManageActivities: boolean;
  canManageSettings: boolean;
  canUseDocumentStamps: boolean;
  canViewMaintenance: boolean;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
}) {
```

```tsx
  const mainLinks: NavLink[] = [
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canUseDocumentStamps ? [{ href: "/document-stamps", label: "Sellos y Firmas", icon: FileSignature }] : []),
    ...(canViewMaintenance ? [{ href: "/maintenance", label: "Mantenimientos", icon: Wrench }] : []),
    ...(canManageUsers ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, sign in as a Super Admin, and confirm a "Mantenimientos" link with a wrench icon appears in the sidebar (it will 404 until Task 10, which is expected at this point).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/app/\(app\)/Sidebar.tsx
git commit -m "feat: add Mantenimientos entry to sidebar navigation"
```

---

## Task 10: `createMaintenanceRecord` server action

**Files:**
- Create: `src/app/(app)/(admin)/maintenance/actions.ts`
- Test: `src/app/(app)/(admin)/maintenance/actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/maintenanceToken", () => ({
  generateMaintenanceToken: vi.fn().mockReturnValue("fixed-test-token"),
}));

import { createClient } from "@/lib/supabase/server";
import { createMaintenanceRecord } from "./actions";

function mockSupabase({
  userId = "tech-1",
  contact = {
    first_name: "Ana",
    last_name: "García",
    position: "Analista",
    email: "ana@example.com",
    companies: { name: "Sanchez Business Corp" },
    departments: { name: "TI" },
  },
  contactError = null,
  insertError = null,
}: {
  userId?: string | null;
  contact?: unknown;
  contactError?: { message: string } | null;
  insertError?: { message: string } | null;
} = {}) {
  const singleMock = vi.fn().mockResolvedValue({ data: contact, error: contactError });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const insertMock = vi.fn().mockResolvedValue({ error: insertError });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
    from: vi.fn().mockReturnValue({ select: selectMock, insert: insertMock }),
    _mocks: { singleMock, eqMock, selectMock, insertMock },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMaintenanceRecord", () => {
  it("rejects when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ userId: null }) as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBe("No autorizado");
  });

  it("rejects when the contact is not found", async () => {
    const supabase = mockSupabase({ contact: null, contactError: { message: "not found" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBe("Contacto no encontrado");
  });

  it("creates a snapshot record and returns the generated token", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBeUndefined();
    expect(result.token).toBe("fixed-test-token");
    expect(supabase.from).toHaveBeenCalledWith("maintenance_records");
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "fixed-test-token",
        contact_id: "contact-1",
        created_by: "tech-1",
        first_name: "Ana",
        last_name: "García",
        position: "Analista",
        email: "ana@example.com",
        company_name: "Sanchez Business Corp",
        department_name: "TI",
      }),
    );
  });

  it("surfaces the insert error", async () => {
    const supabase = mockSupabase({ insertError: { message: "insert failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBe("insert failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(app)/(admin)/maintenance/actions.test.ts"`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Write the implementation**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateMaintenanceToken } from "@/lib/maintenanceToken";

interface ActionResult {
  error?: string;
  token?: string;
}

export async function createMaintenanceRecord(contactId: string): Promise<ActionResult> {
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

export async function deleteMaintenanceRecord(recordId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_records").delete().eq("id", recordId);
  if (error) return { error: error.message };

  revalidatePath("/maintenance");
  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/(app)/(admin)/maintenance/actions.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/(admin)/maintenance/actions.ts" "src/app/(app)/(admin)/maintenance/actions.test.ts"
git commit -m "feat: add createMaintenanceRecord and deleteMaintenanceRecord actions"
```

---

## Task 11: Mantenimientos list page + contact picker dialog

**Files:**
- Create: `src/app/(app)/(admin)/maintenance/page.tsx`
- Create: `src/app/(app)/(admin)/maintenance/NewMaintenanceDialog.tsx`
- Create: `src/app/(app)/(admin)/maintenance/DeleteMaintenanceRecordButton.tsx`

No test in this task — it's a server component page and two small client components wired to already-tested actions; verified manually per Step 4/5, matching how `ContactsPage`/`InviteFromContactDialog` are untested in this codebase.

- [ ] **Step 1: Write the contact picker dialog**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMaintenanceRecord } from "./actions";

interface ContactOption {
  id: string;
  name: string;
  email: string;
  company: string;
}

export function NewMaintenanceDialog({ contacts }: { contacts: ContactOption[] }) {
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
      const result = await createMaintenanceRecord(contactId);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button>Nuevo mantenimiento</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo mantenimiento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Busca el contacto que recibirá el mantenimiento. Se generará un enlace para
          completar el formulario y firmar.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Buscar por nombre, correo o empresa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron contactos.
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pendingId === c.id}
                onClick={() => pick(c.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.company} · {c.email}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the delete button**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteMaintenanceRecord } from "./actions";

export function DeleteMaintenanceRecordButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("¿Cancelar este mantenimiento pendiente?")) return;
    startTransition(async () => {
      await deleteMaintenanceRecord(recordId);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDelete} disabled={isPending}>
      Cancelar
    </Button>
  );
}
```

- [ ] **Step 3: Write the list page**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Wrench } from "lucide-react";
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

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  const { data: records } = await supabase
    .from("maintenance_records")
    .select("id, first_name, last_name, company_name, status, created_at, app_users(full_name, email)")
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mantenimientos</h1>
          <p className="text-sm text-muted-foreground">
            Registros de mantenimiento preventivo por contacto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/maintenance/surveys" className="text-sm underline">
            Encuestas
          </Link>
          {flags.can_add && <NewMaintenanceDialog contacts={contactOptions} />}
        </div>
      </div>
      {(records ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Wrench className="size-8" />
          <p className="text-sm">No hay registros de mantenimiento todavía.</p>
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
                        {flags.can_delete && r.status === "pendiente" && (
                          <DeleteMaintenanceRecordButton recordId={r.id} />
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

- [ ] **Step 4: Run the existing test suite**

Run: `npm run test`
Expected: PASS (no regressions — this task adds no new automated tests, `NewMaintenanceDialog`/`DeleteMaintenanceRecordButton` call already-tested actions).

- [ ] **Step 5: Manually verify**

Run `npm run dev`, go to `/maintenance` as a Super Admin, click "Nuevo mantenimiento", search for a contact, and confirm a new row appears in the list with status "Pendiente" (its "Ver" link 404s until Task 12).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/(admin)/maintenance/page.tsx" "src/app/(app)/(admin)/maintenance/NewMaintenanceDialog.tsx" "src/app/(app)/(admin)/maintenance/DeleteMaintenanceRecordButton.tsx"
git commit -m "feat: add Mantenimientos list page with contact picker"
```

---

## Task 12: Maintenance detail page (technician side)

**Files:**
- Create: `src/app/(app)/(admin)/maintenance/[id]/page.tsx`
- Create: `src/app/(app)/(admin)/maintenance/[id]/CopyLinkButton.tsx`

- [ ] **Step 1: Write the copy-link button**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? "¡Copiado!" : "Copiar enlace"}
    </Button>
  );
}
```

- [ ] **Step 2: Write the detail page**

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";
import { Badge } from "@/components/ui/badge";
import { CopyLinkButton } from "./CopyLinkButton";

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

export default async function MaintenanceRecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const { data: record } = await supabase.from("maintenance_records").select("*").eq("id", id).single();
  if (!record) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const linkUrl = `${siteUrl}/mantenimiento/${record.token}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {record.first_name} {record.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {record.company_name} · {record.department_name}
          </p>
        </div>
        <Badge variant={record.status === "completado" ? "default" : "secondary"}>
          {STATUS_LABEL[record.status] ?? record.status}
        </Badge>
      </div>

      {record.status === "pendiente" && (
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm text-muted-foreground">
            Comparte este enlace con el técnico y/o el usuario para completar el formulario y firmar.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{linkUrl}</code>
            <CopyLinkButton url={linkUrl} />
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Información del equipo</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Nombre del Host</dt>
          <dd>{record.host_name ?? "-"}</dd>
          <dt className="text-muted-foreground">Memoria RAM</dt>
          <dd>{record.ram ?? "-"}</dd>
          <dt className="text-muted-foreground">Sistema Operativo</dt>
          <dd>{record.os ?? "-"}</dd>
          <dt className="text-muted-foreground">Almacenamiento Total</dt>
          <dd>{record.storage_total ?? "-"}</dd>
          <dt className="text-muted-foreground">Almacenamiento Utilizado</dt>
          <dd>{record.storage_used ?? "-"}</dd>
          <dt className="text-muted-foreground">Almacenamiento Libre</dt>
          <dd>{record.storage_free ?? "-"}</dd>
        </dl>
      </section>

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

      <section className="space-y-1">
        <h2 className="font-medium">Hallazgos</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{record.findings || "—"}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-medium">Observaciones</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{record.observations || "—"}</p>
      </section>

      {record.status === "completado" && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <a href={`/maintenance/${record.id}/pdf`} className="text-sm underline">
            Descargar PDF
          </a>
          {record.email_error && (
            <form action={`/maintenance/${record.id}/resend-email`} method="post">
              <button type="submit" className="text-sm text-red-600 underline">
                Reenviar correo (falló: {record.email_error})
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, click "Ver" on a pending record from `/maintenance`, and confirm the detail page renders with the copy-link box and all checklist items showing "◻" (unanswered).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/(admin)/maintenance/[id]/page.tsx" "src/app/(app)/(admin)/maintenance/[id]/CopyLinkButton.tsx"
git commit -m "feat: add maintenance record detail page"
```

Note: the "Descargar PDF" and "Reenviar correo" links point at routes added in Task 21 (`/maintenance/[id]/pdf`) and Task 22 (`/maintenance/[id]/resend-email`) — they 404 until those tasks land, which is fine since no record reaches `completado` before Task 20 exists.

---

## Task 13: Middleware — allow the two public token routes through

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add the new path prefixes**

```ts
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/auth/confirm") ||
    request.nextUrl.pathname.startsWith("/mantenimiento") ||
    request.nextUrl.pathname.startsWith("/encuesta");
```

(This is the only change to the file — `isAuthRoute` is otherwise used exactly as before, and `config.matcher` doesn't need to change since it already covers all non-static paths.)

- [ ] **Step 2: Manually verify**

Run `npm run dev`, open a fresh private/incognito browser window (no session), and navigate to `http://localhost:3000/mantenimiento/anything`. Confirm you are **not** redirected to `/login` (you'll see a 404 or an error until Task 16 adds the actual page — that's expected; the point is confirming no redirect happens).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: allow public maintenance and survey token routes through middleware"
```

---

## Task 14: PDF report builder

**Files:**
- Create: `src/lib/maintenancePdfReport.ts`
- Test: `src/lib/maintenancePdfReport.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { wrapText, buildMaintenancePdfBytes, formatDateForFilename } from "./maintenancePdfReport";

describe("wrapText", () => {
  it("keeps short text on a single line", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(wrapText("Hola mundo", font, 10, 200)).toEqual(["Hola mundo"]);
  });

  it("wraps long text across multiple lines within maxWidth", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const longText =
      "Esta es una observación muy larga que debería dividirse en varias líneas dentro del ancho máximo permitido para la columna del reporte.";
    const lines = wrapText(longText, font, 10, 150);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(150);
    }
  });
});

describe("formatDateForFilename", () => {
  it("formats as DD-MM-YYYY", () => {
    expect(formatDateForFilename(new Date("2026-07-28T15:00:00Z"))).toBe("28-07-2026");
  });
});

describe("buildMaintenancePdfBytes", () => {
  it("produces a valid single-page PDF containing the user's name", async () => {
    const onePxPng = await (await PDFDocument.create()).embedPng(
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      ),
    );
    const pngBytes = await onePxPng.embed();

    const bytes = await buildMaintenancePdfBytes(
      {
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
        findings: "Ninguno",
        observations: "Ninguna",
        completedAt: new Date("2026-07-28T15:00:00Z"),
      },
      { technicianPng: pngBytes as unknown as Uint8Array, userPng: pngBytes as unknown as Uint8Array },
    );

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
```

Note: the inline base64 in the test is a real 1x1 transparent PNG (used only as a stand-in signature image so `embedPng` has valid bytes to work with).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenancePdfReport.test.ts`
Expected: FAIL — cannot find module `./maintenancePdfReport`.

- [ ] **Step 3: Write the implementation**

```ts
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface MaintenanceRecordForPdf {
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
  findings: string | null;
  observations: string | null;
  completedAt: Date;
}

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function formatDateForFilename(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export async function buildMaintenancePdfBytes(
  record: MaintenanceRecordForPdf,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;
  page.drawText("FORMULARIO DE MANTENIMIENTO PREVENTIVO", { x: MARGIN, y, size: 14, font: bold });
  y -= 30;

  y = drawSection(page, bold, font, y, "Información del Usuario", [
    ["Nombre", `${record.firstName} ${record.lastName}`],
    ["Posición", record.position ?? "-"],
    ["Empresa", record.companyName ?? "-"],
    ["Departamento", record.departmentName ?? "-"],
    ["Correo", record.email ?? "-"],
    ["Nombre del Host", record.hostName ?? "-"],
  ]);

  y = drawSection(page, bold, font, y, "Información del Equipo", [
    ["Memoria RAM", record.ram ?? "-"],
    ["Sistema Operativo", record.os ?? "-"],
    ["Almacenamiento Total", record.storageTotal ?? "-"],
    ["Almacenamiento Utilizado", record.storageUsed ?? "-"],
    ["Almacenamiento Libre", record.storageFree ?? "-"],
  ]);

  y = drawChecklist(page, bold, font, y, record.checklist);
  y = drawParagraph(page, bold, font, y, "Hallazgos", record.findings || "Ninguno");
  y = drawParagraph(page, bold, font, y, "Observaciones", record.observations || "Ninguna");
  await drawSignatures(doc, page, bold, font, y, signatures, record.completedAt);

  return doc.save();
}

function drawSection(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  title: string,
  rows: [string, string][],
): number {
  let y = startY;
  page.drawText(title, { x: MARGIN, y, size: 12, font: bold, color: rgb(0, 0, 0) });
  y -= 18;
  for (const [label, value] of rows) {
    page.drawText(`${label}:`, { x: MARGIN, y, size: 10, font: bold });
    page.drawText(value, { x: MARGIN + 160, y, size: 10, font });
    y -= 16;
  }
  return y - 10;
}

function drawChecklist(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  checklist: { label: string; value: boolean | null }[],
): number {
  let y = startY;
  page.drawText("Checklist de Mantenimiento", { x: MARGIN, y, size: 12, font: bold });
  y -= 18;
  for (const item of checklist) {
    page.drawText(item.value ? "[X]" : "[ ]", { x: MARGIN, y, size: 10, font });
    page.drawText(item.label, { x: MARGIN + 30, y, size: 10, font });
    y -= 16;
  }
  return y - 10;
}

function drawParagraph(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  title: string,
  text: string,
): number {
  let y = startY;
  page.drawText(title, { x: MARGIN, y, size: 12, font: bold });
  y -= 16;
  for (const line of wrapText(text, font, 10, PAGE_WIDTH - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y, size: 10, font });
    y -= 14;
  }
  return y - 10;
}

async function drawSignatures(
  doc: PDFDocument,
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  signatures: { technicianPng: Uint8Array; userPng: Uint8Array },
  completedAt: Date,
): Promise<void> {
  const y = startY - 80;
  const techImage = await doc.embedPng(signatures.technicianPng);
  const userImage = await doc.embedPng(signatures.userPng);
  page.drawImage(techImage, { x: MARGIN, y, width: 140, height: 60 });
  page.drawImage(userImage, { x: MARGIN + 260, y, width: 140, height: 60 });
  page.drawText("Técnico", { x: MARGIN, y: y - 14, size: 10, font: bold });
  page.drawText("Usuario", { x: MARGIN + 260, y: y - 14, size: 10, font: bold });
  page.drawText(`Fecha: ${completedAt.toLocaleDateString("es-MX")}`, { x: MARGIN, y: y - 34, size: 10, font });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenancePdfReport.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenancePdfReport.ts src/lib/maintenancePdfReport.test.ts
git commit -m "feat: add from-scratch maintenance PDF report builder"
```

---

## Task 15: Email sending module

**Files:**
- Create: `src/lib/sendMaintenanceEmail.ts`
- Test: `src/lib/sendMaintenanceEmail.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn().mockResolvedValue({});
const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaintenanceReportEmail, sendSurveyEmail } from "./sendMaintenanceEmail";

function mockAdmin(settings: Record<string, unknown> | null) {
  const singleMock = vi.fn().mockResolvedValue({ data: settings, error: settings ? null : { message: "no row" } });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock }) };
}

const VALID_SETTINGS = {
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "user@example.com",
  smtp_pass: "secret",
  smtp_sender_name: "Gente Sánchez Business",
  smtp_admin_email: "notificaciones@sanchezbusinesscorp.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendMaintenanceReportEmail", () => {
  it("throws when SMTP settings are not configured", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(null) as never);

    await expect(
      sendMaintenanceReportEmail({ userName: "Ana García", completedDate: "28-07-2026", pdfBytes: new Uint8Array([1]) }),
    ).rejects.toThrow("Configuración SMTP incompleta");
  });

  it("sends the PDF as an attachment to acusesdeti@sanchezbusinesscorp.com", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendMaintenanceReportEmail({ userName: "Ana García", completedDate: "28-07-2026", pdfBytes: new Uint8Array([1, 2, 3]) });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "acusesdeti@sanchezbusinesscorp.com",
        subject: "Mantenimiento - Ana García - 28-07-2026",
        attachments: [expect.objectContaining({ filename: "Mantenimiento - Ana García - 28-07-2026.pdf" })],
      }),
    );
  });
});

describe("sendSurveyEmail", () => {
  it("sends the survey link to the user's email", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendSurveyEmail({ userEmail: "ana@example.com", userName: "Ana", surveyUrl: "https://example.com/encuesta/abc" });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        text: expect.stringContaining("https://example.com/encuesta/abc"),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sendMaintenanceEmail.test.ts`
Expected: FAIL — cannot find module `./sendMaintenanceEmail`.

- [ ] **Step 3: Write the implementation**

```ts
import "server-only";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_sender_name: string | null;
  smtp_admin_email: string | null;
}

async function getEmailSettings(): Promise<EmailSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("email_settings").select("*").eq("id", true).single();
  if (error || !data || !data.smtp_host) {
    throw new Error("Configuración SMTP incompleta");
  }
  return data as EmailSettings;
}

function buildTransport(settings: EmailSettings) {
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
  });
}

function fromAddress(settings: EmailSettings): string {
  const name = settings.smtp_sender_name ?? "Gente Sánchez Business";
  const address = settings.smtp_admin_email ?? settings.smtp_user;
  return `${name} <${address}>`;
}

export async function sendMaintenanceReportEmail(input: {
  userName: string;
  completedDate: string;
  pdfBytes: Uint8Array;
}): Promise<void> {
  const settings = await getEmailSettings();
  const transport = buildTransport(settings);
  await transport.sendMail({
    from: fromAddress(settings),
    to: "acusesdeti@sanchezbusinesscorp.com",
    subject: `Mantenimiento - ${input.userName} - ${input.completedDate}`,
    text: "Se adjunta el formulario de mantenimiento preventivo completado.",
    attachments: [
      {
        filename: `Mantenimiento - ${input.userName} - ${input.completedDate}.pdf`,
        content: Buffer.from(input.pdfBytes),
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendSurveyEmail(input: {
  userEmail: string;
  userName: string;
  surveyUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const transport = buildTransport(settings);
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.userEmail,
    subject: "Encuesta de satisfacción - Mantenimiento preventivo",
    text: `Hola ${input.userName}, nos gustaría conocer tu opinión sobre el servicio de mantenimiento recibido: ${input.surveyUrl}`,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sendMaintenanceEmail.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sendMaintenanceEmail.ts src/lib/sendMaintenanceEmail.test.ts
git commit -m "feat: add nodemailer-based maintenance email sending"
```

---

## Task 16: Completion orchestration (`completeMaintenanceRecord`)

**Files:**
- Create: `src/lib/completeMaintenanceRecord.ts`
- Test: `src/lib/completeMaintenanceRecord.test.ts`

This is the function that runs once both signatures exist: builds the PDF, uploads it, emails it, creates the survey row, emails the survey link, and marks the record `completado`. It's the piece that most needs unit coverage since it coordinates several side effects with a specific error-handling order (spec: PDF failure blocks completion; email failure does not).

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/maintenancePdfReport", () => ({
  buildMaintenancePdfBytes: vi.fn(),
  formatDateForFilename: vi.fn().mockReturnValue("28-07-2026"),
}));
vi.mock("@/lib/sendMaintenanceEmail", () => ({
  sendMaintenanceReportEmail: vi.fn(),
  sendSurveyEmail: vi.fn(),
}));
vi.mock("@/lib/maintenanceToken", () => ({
  generateMaintenanceToken: vi.fn().mockReturnValue("survey-test-token"),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { buildMaintenancePdfBytes } from "@/lib/maintenancePdfReport";
import { sendMaintenanceReportEmail, sendSurveyEmail } from "@/lib/sendMaintenanceEmail";
import { completeMaintenanceRecord } from "./completeMaintenanceRecord";

const BASE_RECORD = {
  id: "record-1",
  created_by: "tech-1",
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

function mockAdmin({
  downloadError = null,
  updateError = null,
  surveyInsertError = null,
}: { downloadError?: { message: string } | null; updateError?: { message: string } | null; surveyInsertError?: { message: string } | null } = {}) {
  const downloadMock = vi.fn().mockResolvedValue({
    data: downloadError ? null : new Blob([new Uint8Array([1, 2, 3])]),
    error: downloadError,
  });
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  const insertMock = vi.fn().mockResolvedValue({ error: surveyInsertError });

  return {
    storage: { from: vi.fn().mockReturnValue({ download: downloadMock, upload: uploadMock }) },
    from: vi.fn((table: string) => {
      if (table === "maintenance_records") return { update: updateMock };
      if (table === "maintenance_surveys") return { insert: insertMock };
      throw new Error(`unexpected table ${table}`);
    }),
    _mocks: { downloadMock, uploadMock, updateMock, updateEqMock, insertMock },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildMaintenancePdfBytes).mockResolvedValue(new Uint8Array([9, 9, 9]));
});

describe("completeMaintenanceRecord", () => {
  it("does not mark the record completed if PDF generation fails", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
    vi.mocked(buildMaintenancePdfBytes).mockRejectedValue(new Error("pdf boom"));

    await expect(completeMaintenanceRecord(BASE_RECORD as never)).rejects.toThrow("pdf boom");

    const admin = vi.mocked(createAdminClient).mock.results[0]!.value;
    expect(admin._mocks.updateMock).not.toHaveBeenCalled();
  });

  it("uploads the PDF, marks the record completed, creates the survey, and emails both", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await completeMaintenanceRecord(BASE_RECORD as never);

    expect(admin._mocks.uploadMock).toHaveBeenCalledWith(
      "record-1.pdf",
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completado", pdf_path: "record-1.pdf" }),
    );
    expect(admin._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ maintenance_record_id: "record-1", technician_id: "tech-1", token: "survey-test-token" }),
    );
    expect(sendMaintenanceReportEmail).toHaveBeenCalled();
    expect(sendSurveyEmail).toHaveBeenCalled();
  });

  it("still marks the record completed if sending email fails, recording the error instead", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(sendMaintenanceReportEmail).mockRejectedValue(new Error("smtp down"));

    await completeMaintenanceRecord(BASE_RECORD as never);

    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completado", email_error: "smtp down" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/completeMaintenanceRecord.test.ts`
Expected: FAIL — cannot find module `./completeMaintenanceRecord`.

- [ ] **Step 3: Write the implementation**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMaintenancePdfBytes, formatDateForFilename } from "@/lib/maintenancePdfReport";
import { sendMaintenanceReportEmail, sendSurveyEmail } from "@/lib/sendMaintenanceEmail";
import { generateMaintenanceToken } from "@/lib/maintenanceToken";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";

export interface MaintenanceRecordForCompletion {
  id: string;
  created_by: string;
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
  findings: string | null;
  observations: string | null;
  technician_signature_path: string;
  user_signature_path: string;
  [checklistKey: string]: unknown;
}

async function downloadSignature(admin: ReturnType<typeof createAdminClient>, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from("maintenance-signatures").download(path);
  if (error || !data) throw new Error(`No se pudo leer la firma en ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function completeMaintenanceRecord(record: MaintenanceRecordForCompletion): Promise<void> {
  const admin = createAdminClient();
  const completedAt = new Date();

  const [technicianPng, userPng] = await Promise.all([
    downloadSignature(admin, record.technician_signature_path),
    downloadSignature(admin, record.user_signature_path),
  ]);

  // Generation failures throw here and intentionally leave the record
  // untouched — status stays "pendiente" so the caller can retry without
  // losing already-saved signatures/data.
  const pdfBytes = await buildMaintenancePdfBytes(
    {
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
      checklist: MAINTENANCE_CHECKLIST_ITEMS.map((item) => ({
        label: item.label,
        value: (record[item.key] as boolean | null) ?? null,
      })),
      findings: record.findings,
      observations: record.observations,
      completedAt,
    },
    { technicianPng, userPng },
  );

  const pdfPath = `${record.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("maintenance-reports")
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf" });
  if (uploadError) throw new Error(uploadError.message);

  const surveyToken = generateMaintenanceToken();
  const { error: surveyError } = await admin.from("maintenance_surveys").insert({
    maintenance_record_id: record.id,
    technician_id: record.created_by,
    token: surveyToken,
  });
  if (surveyError) throw new Error(surveyError.message);

  const userName = `${record.first_name} ${record.last_name}`;
  const completedDate = formatDateForFilename(completedAt);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  let emailError: string | null = null;
  try {
    await sendMaintenanceReportEmail({ userName, completedDate, pdfBytes });
    if (record.email) {
      await sendSurveyEmail({
        userEmail: record.email,
        userName: record.first_name,
        surveyUrl: `${siteUrl}/encuesta/${surveyToken}`,
      });
    }
  } catch (err) {
    // Signatures and the PDF are already valid and saved — a mail outage
    // must not block completion. Surface the error for a manual resend.
    emailError = err instanceof Error ? err.message : "Error al enviar el correo";
  }

  const { error: updateError } = await admin
    .from("maintenance_records")
    .update({
      status: "completado",
      pdf_path: pdfPath,
      completed_at: completedAt.toISOString(),
      email_error: emailError,
    })
    .eq("id", record.id);
  if (updateError) throw new Error(updateError.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/completeMaintenanceRecord.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/completeMaintenanceRecord.ts src/lib/completeMaintenanceRecord.test.ts
git commit -m "feat: add maintenance completion orchestration (PDF, survey, emails)"
```

---

## Task 17: Public token lookup helper

**Files:**
- Modify: `src/lib/maintenanceAccess.ts`
- Modify: `src/lib/maintenanceAccess.test.ts`

Extends Task 8's pure expiry check with the DB-backed lookup used by the public page/actions.

- [ ] **Step 1: Add the failing test**

Append to `src/lib/maintenanceAccess.test.ts`:

```ts
import { beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { loadMaintenanceRecordByToken } from "./maintenanceAccess";

function mockAdmin(record: Record<string, unknown> | null, updateError: { message: string } | null = null) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: record, error: record ? null : { message: "not found" } });
  const eqSelectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock });
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock, update: updateMock }), _mocks: { updateMock, updateEqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadMaintenanceRecordByToken", () => {
  it("returns not_found when no record matches the token", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(null) as never);

    const result = await loadMaintenanceRecordByToken("missing-token");

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns expired and flips status when a pendiente record is past expires_at", async () => {
    const admin = mockAdmin({
      id: "record-1",
      status: "pendiente",
      expires_at: new Date(Date.now() - 1000 * 60).toISOString(),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await loadMaintenanceRecordByToken("old-token");

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ status: "expirado" });
  });

  it("returns the record when it is pendiente and not expired", async () => {
    const record = {
      id: "record-1",
      status: "pendiente",
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(record) as never);

    const result = await loadMaintenanceRecordByToken("good-token");

    expect(result).toEqual({ ok: true, record });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceAccess.test.ts`
Expected: FAIL — `loadMaintenanceRecordByToken` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/lib/maintenanceAccess.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type MaintenanceAccessResult<T> = { ok: true; record: T } | { ok: false; reason: "not_found" | "expired" };

export async function loadMaintenanceRecordByToken<T extends { id: string; status: string; expires_at: string }>(
  token: string,
): Promise<MaintenanceAccessResult<T>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("maintenance_records").select("*").eq("token", token).maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };

  const record = data as T;
  if (record.status === "expirado") return { ok: false, reason: "expired" };
  if (record.status === "pendiente" && isMaintenanceLinkExpired(record.expires_at, new Date())) {
    await admin.from("maintenance_records").update({ status: "expirado" }).eq("id", record.id);
    return { ok: false, reason: "expired" };
  }

  return { ok: true, record };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceAccess.test.ts`
Expected: PASS (5 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceAccess.ts src/lib/maintenanceAccess.test.ts
git commit -m "feat: add token-based maintenance record lookup"
```

---

## Task 18: Public form actions (`/mantenimiento/[token]`)

**Files:**
- Create: `src/app/mantenimiento/[token]/actions.ts`
- Test: `src/app/mantenimiento/[token]/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/maintenanceAccess", () => ({ loadMaintenanceRecordByToken: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/completeMaintenanceRecord", () => ({ completeMaintenanceRecord: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { loadMaintenanceRecordByToken } from "@/lib/maintenanceAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeMaintenanceRecord } from "@/lib/completeMaintenanceRecord";
import { saveMaintenanceProgress, saveMaintenanceSignature } from "./actions";

function mockAdmin({ updateError = null, record = null }: { updateError?: { message: string } | null; record?: Record<string, unknown> | null } = {}) {
  const singleMock = vi.fn().mockResolvedValue({ data: record, error: updateError });
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock = vi.fn().mockReturnValue({ error: updateError, select: selectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({ update: updateMock }),
    storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
    _mocks: { updateMock, eqMock, uploadMock },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveMaintenanceProgress", () => {
  it("rejects an invalid token", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({ ok: false, reason: "not_found" });

    const result = await saveMaintenanceProgress("bad-token", { host_name: "PC-1" });

    expect(result.error).toBe("Enlace inválido o expirado");
  });

  it("rejects a completed record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "completado" } as never,
    });

    const result = await saveMaintenanceProgress("token-1", { host_name: "PC-1" });

    expect(result.error).toBe("Este mantenimiento ya fue completado");
  });

  it("updates the record fields for a pendiente record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente" } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveMaintenanceProgress("token-1", { host_name: "PC-1", ram: "16 GB" });

    expect(result.error).toBeUndefined();
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ host_name: "PC-1", ram: "16 GB" });
    expect(admin._mocks.eqMock).toHaveBeenCalledWith("id", "record-1");
  });
});

describe("saveMaintenanceSignature", () => {
  it("uploads the signature and, once both are present, completes the record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente", technician_signature_path: "record-1/tecnico.png" } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveMaintenanceSignature("token-1", "user", "data:image/png;base64,AAAA");

    expect(result.error).toBeUndefined();
    expect(admin._mocks.uploadMock).toHaveBeenCalledWith(
      "record-1/usuario.png",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(completeMaintenanceRecord).toHaveBeenCalled();
  });

  it("does not attempt completion when only one signature is present", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente", technician_signature_path: null } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await saveMaintenanceSignature("token-1", "user", "data:image/png;base64,AAAA");

    expect(completeMaintenanceRecord).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/mantenimiento/[token]/actions.test.ts"`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Write the implementation**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { loadMaintenanceRecordByToken } from "@/lib/maintenanceAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeMaintenanceRecord, type MaintenanceRecordForCompletion } from "@/lib/completeMaintenanceRecord";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";

interface ActionResult {
  error?: string;
}

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
}

interface PendingRecordLookup {
  id: string;
  status: string;
}

async function loadPendingRecord(token: string): Promise<{ record: PendingRecordLookup } | { error: string }> {
  const result = await loadMaintenanceRecordByToken<PendingRecordLookup>(token);
  if (!result.ok) return { error: "Enlace inválido o expirado" };
  if (result.record.status === "completado") return { error: "Este mantenimiento ya fue completado" };
  return { record: result.record };
}

export async function saveMaintenanceProgress(
  token: string,
  input: MaintenanceProgressInput,
): Promise<ActionResult> {
  const lookup = await loadPendingRecord(token);
  if ("error" in lookup) return { error: lookup.error };

  const admin = createAdminClient();
  const { error } = await admin.from("maintenance_records").update(input).eq("id", lookup.record.id);
  if (error) return { error: error.message };

  revalidatePath(`/mantenimiento/${token}`);
  return {};
}

export async function saveMaintenanceSignature(
  token: string,
  role: "technician" | "user",
  dataUrl: string,
): Promise<ActionResult> {
  const result = await loadMaintenanceRecordByToken<
    MaintenanceRecordForCompletion & { status: string; technician_signature_path: string | null; user_signature_path: string | null }
  >(token);
  if (!result.ok) return { error: "Enlace inválido o expirado" };
  if (result.record.status === "completado") return { error: "Este mantenimiento ya fue completado" };

  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { error: "Firma inválida" };

  const admin = createAdminClient();
  const fileName = role === "technician" ? "tecnico.png" : "usuario.png";
  const path = `${result.record.id}/${fileName}`;

  const { error: uploadError } = await admin.storage
    .from("maintenance-signatures")
    .upload(path, bytes, { contentType: "image/png" });
  if (uploadError) return { error: uploadError.message };

  const pathColumn = role === "technician" ? "technician_signature_path" : "user_signature_path";
  const signedAtColumn = role === "technician" ? "technician_signed_at" : "user_signed_at";
  const { error: updateError } = await admin
    .from("maintenance_records")
    .update({ [pathColumn]: path, [signedAtColumn]: new Date().toISOString() })
    .eq("id", result.record.id);
  if (updateError) return { error: updateError.message };

  const otherPathPresent =
    role === "technician" ? Boolean(result.record.user_signature_path) : Boolean(result.record.technician_signature_path);
  if (otherPathPresent) {
    await completeMaintenanceRecord({
      ...result.record,
      technician_signature_path: role === "technician" ? path : (result.record.technician_signature_path as string),
      user_signature_path: role === "user" ? path : (result.record.user_signature_path as string),
    });
  }

  revalidatePath(`/mantenimiento/${token}`);
  return {};
}

export { MAINTENANCE_CHECKLIST_ITEMS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/mantenimiento/[token]/actions.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/mantenimiento/[token]/actions.ts" "src/app/mantenimiento/[token]/actions.test.ts"
git commit -m "feat: add public maintenance form save and signature actions"
```

---

## Task 19: Signature pad component

**Files:**
- Create: `src/app/mantenimiento/[token]/SignaturePad.tsx`

No dedicated test — this is a canvas-drawing client component with no pure logic to extract (mirrors `SignatureDialog.tsx`, which is also untested in this codebase); verified manually in Task 20.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveMaintenanceSignature } from "./actions";

export function SignaturePad({
  token,
  role,
  label,
  alreadySigned,
}: {
  token: string;
  role: "technician" | "user";
  label: string;
  alreadySigned: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointCountRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(alreadySigned);
  const [isPending, startTransition] = useTransition();

  function getPos(canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function onDown(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const p = getPos(canvas, e);
    drawingRef.current = true;
    pointCountRef.current = 1;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const p = getPos(canvas, e);
    pointCountRef.current += 1;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onUp() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    pointCountRef.current = 0;
  }

  function submit() {
    const canvas = canvasRef.current;
    if (!canvas || pointCountRef.current < 3) {
      setError("Dibuja tu firma antes de continuar");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    startTransition(async () => {
      const result = await saveMaintenanceSignature(token, role, dataUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
    });
  }

  if (saved) {
    return <p className="text-sm text-green-700">{label}: firmado ✓</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="w-full rounded border bg-white"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Borrar
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={isPending}>
          Guardar firma
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/mantenimiento/[token]/SignaturePad.tsx"
git commit -m "feat: add public signature pad component"
```

---

## Task 20: Public maintenance form page

**Files:**
- Create: `src/app/mantenimiento/[token]/page.tsx`
- Create: `src/app/mantenimiento/[token]/MaintenanceForm.tsx`

- [ ] **Step 1: Write the client form (equipment info + checklist + findings/observations, with a "Guardar progreso" button)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";
import { saveMaintenanceProgress, type MaintenanceProgressInput } from "./actions";

export interface MaintenanceFormRecord extends MaintenanceProgressInput {
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
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function setText(key: keyof MaintenanceProgressInput, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function setChecklist(key: string, value: boolean) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveMaintenanceProgress(token, fields);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-medium">Información del Usuario</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Nombre</dt>
          <dd>
            {record.first_name} {record.last_name}
          </dd>
          <dt className="text-muted-foreground">Posición</dt>
          <dd>{record.position ?? "-"}</dd>
          <dt className="text-muted-foreground">Empresa</dt>
          <dd>{record.company_name ?? "-"}</dd>
          <dt className="text-muted-foreground">Departamento</dt>
          <dd>{record.department_name ?? "-"}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd>{record.email ?? "-"}</dd>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Información del Equipo</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input placeholder="Nombre del Host" value={fields.host_name} onChange={(e) => setText("host_name", e.target.value)} />
          <Input placeholder="Memoria RAM" value={fields.ram} onChange={(e) => setText("ram", e.target.value)} />
          <Input placeholder="Sistema Operativo" value={fields.os} onChange={(e) => setText("os", e.target.value)} />
          <Input placeholder="Almacenamiento Total" value={fields.storage_total} onChange={(e) => setText("storage_total", e.target.value)} />
          <Input placeholder="Almacenamiento Utilizado" value={fields.storage_used} onChange={(e) => setText("storage_used", e.target.value)} />
          <Input placeholder="Almacenamiento Libre" value={fields.storage_free} onChange={(e) => setText("storage_free", e.target.value)} />
        </div>
      </section>

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

      <section className="space-y-2">
        <h2 className="font-medium">Hallazgos</h2>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          value={fields.findings}
          onChange={(e) => setText("findings", e.target.value)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Observaciones</h2>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          value={fields.observations}
          onChange={(e) => setText("observations", e.target.value)}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Progreso guardado</p>}
      <Button type="button" onClick={save} disabled={isPending}>
        Guardar progreso
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Write the page (status states + form + signature pads)**

```tsx
import { notFound } from "next/navigation";
import { loadMaintenanceRecordByToken } from "@/lib/maintenanceAccess";
import { MaintenanceForm, type MaintenanceFormRecord } from "./MaintenanceForm";
import { SignaturePad } from "./SignaturePad";

export const runtime = "nodejs";

interface FullRecord extends MaintenanceFormRecord {
  id: string;
  status: string;
  technician_signature_path: string | null;
  user_signature_path: string | null;
}

export default async function MaintenancePublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadMaintenanceRecordByToken<FullRecord>(token);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Enlace no disponible</h1>
        <p className="text-sm text-muted-foreground">
          Este enlace ya no es válido. Solicita uno nuevo al técnico.
        </p>
      </div>
    );
  }

  const record = result.record;

  if (record.status === "completado") {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Mantenimiento completado</h1>
        <p className="text-sm text-muted-foreground">
          Este formulario ya fue firmado por ambas partes. Gracias.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Formulario de Mantenimiento Preventivo</h1>
        <p className="text-sm text-muted-foreground">
          Completa la información y firma para finalizar.
        </p>
      </div>
      <MaintenanceForm token={token} record={record} />
      <section className="space-y-4 border-t pt-4">
        <h2 className="font-medium">Firmas</h2>
        <SignaturePad
          token={token}
          role="technician"
          label="Firma del Técnico"
          alreadySigned={Boolean(record.technician_signature_path)}
        />
        <SignaturePad
          token={token}
          role="user"
          label="Firma del Usuario"
          alreadySigned={Boolean(record.user_signature_path)}
        />
      </section>
    </div>
  );
}
```

`export const runtime = "nodejs"` is set here (rather than in the lib files) because Next.js runtime configuration is a route-segment concept — this page's Server Actions (`saveMaintenanceSignature` → `completeMaintenanceRecord` → `pdf-lib`/`Buffer`) execute in this segment's runtime, and pdf-lib/Buffer usage assumes Node.

- [ ] **Step 3: Manually verify**

Run `npm run dev`. From `/maintenance`, copy a pending record's link and open it in an incognito window. Fill in equipment info, check a few checklist items, click "Guardar progreso" and confirm "Progreso guardado" appears. Draw and save the technician signature, then the user signature, and confirm the page transitions to "Mantenimiento completado" after the second one (this will error at the PDF/email step until Tasks 14–16 are also in place — if running this task in isolation before those, expect an error toast/console error at that point, which is expected).

- [ ] **Step 4: Commit**

```bash
git add "src/app/mantenimiento/[token]/page.tsx" "src/app/mantenimiento/[token]/MaintenanceForm.tsx"
git commit -m "feat: add public maintenance form and signature page"
```

---

## Task 21: PDF download + resend-email routes (technician side)

**Files:**
- Create: `src/app/(app)/(admin)/maintenance/[id]/pdf/route.ts`
- Create: `src/app/(app)/(admin)/maintenance/[id]/resend-email/route.ts`

- [ ] **Step 1: Write the PDF download route**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: record } = await supabase.from("maintenance_records").select("pdf_path, first_name, last_name").eq("id", id).single();
  if (!record?.pdf_path) {
    return NextResponse.json({ error: "PDF no disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from("maintenance-reports").download(record.pdf_path);
  if (error || !file) {
    return NextResponse.json({ error: "No se pudo leer el PDF" }, { status: 500 });
  }

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Mantenimiento - ${record.first_name} ${record.last_name}.pdf"`,
    },
  });
}
```

- [ ] **Step 2: Write the resend-email route**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaintenanceReportEmail } from "@/lib/sendMaintenanceEmail";
import { formatDateForFilename } from "@/lib/maintenancePdfReport";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_add) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: record } = await supabase
    .from("maintenance_records")
    .select("pdf_path, first_name, last_name, completed_at")
    .eq("id", id)
    .single();
  if (!record?.pdf_path) {
    return NextResponse.json({ error: "PDF no disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: file, error: downloadError } = await admin.storage.from("maintenance-reports").download(record.pdf_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "No se pudo leer el PDF" }, { status: 500 });
  }

  try {
    await sendMaintenanceReportEmail({
      userName: `${record.first_name} ${record.last_name}`,
      completedDate: formatDateForFilename(new Date(record.completed_at ?? Date.now())),
      pdfBytes: new Uint8Array(await file.arrayBuffer()),
    });
    await admin.from("maintenance_records").update({ email_error: null }).eq("id", id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al enviar el correo";
    await admin.from("maintenance_records").update({ email_error: message }).eq("id", id);
    return NextResponse.redirect(new URL(`/maintenance/${id}`, _request.url));
  }

  return NextResponse.redirect(new URL(`/maintenance/${id}`, _request.url));
}
```

- [ ] **Step 3: Manually verify**

With a completed test record (from Task 20's end-to-end flow), visit `/maintenance/[id]`, click "Descargar PDF" and confirm the browser downloads a valid PDF; if `email_error` is set, click "Reenviar correo" and confirm the error clears after a successful resend.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/(admin)/maintenance/[id]/pdf/route.ts" "src/app/(app)/(admin)/maintenance/[id]/resend-email/route.ts"
git commit -m "feat: add PDF download and resend-email routes"
```

---

## Task 22: NPS survey computation helper

**Files:**
- Create: `src/lib/maintenanceSurveys.ts`
- Test: `src/lib/maintenanceSurveys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { computeAverageNpsByTechnician } from "./maintenanceSurveys";

describe("computeAverageNpsByTechnician", () => {
  it("averages scores per technician and ignores unanswered surveys", () => {
    const result = computeAverageNpsByTechnician([
      { technician_id: "t1", technician_name: "Luis", nps_score: 9 },
      { technician_id: "t1", technician_name: "Luis", nps_score: 7 },
      { technician_id: "t2", technician_name: "María", nps_score: 10 },
      { technician_id: "t2", technician_name: "María", nps_score: null },
    ]);

    expect(result).toEqual([
      { technician_id: "t2", technician_name: "María", average: 10, responses: 1 },
      { technician_id: "t1", technician_name: "Luis", average: 8, responses: 2 },
    ]);
  });

  it("returns an empty array when there are no answered surveys", () => {
    expect(computeAverageNpsByTechnician([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenanceSurveys.test.ts`
Expected: FAIL — cannot find module `./maintenanceSurveys`.

- [ ] **Step 3: Write the implementation**

```ts
export interface SurveyForAverage {
  technician_id: string;
  technician_name: string;
  nps_score: number | null;
}

export interface TechnicianNpsAverage {
  technician_id: string;
  technician_name: string;
  average: number;
  responses: number;
}

export function computeAverageNpsByTechnician(surveys: SurveyForAverage[]): TechnicianNpsAverage[] {
  const groups = new Map<string, { name: string; total: number; count: number }>();
  for (const s of surveys) {
    if (s.nps_score === null) continue;
    const entry = groups.get(s.technician_id) ?? { name: s.technician_name, total: 0, count: 0 };
    entry.total += s.nps_score;
    entry.count += 1;
    groups.set(s.technician_id, entry);
  }
  return Array.from(groups.entries())
    .map(([technician_id, { name, total, count }]) => ({
      technician_id,
      technician_name: name,
      average: Math.round((total / count) * 10) / 10,
      responses: count,
    }))
    .sort((a, b) => b.average - a.average);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenanceSurveys.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenanceSurveys.ts src/lib/maintenanceSurveys.test.ts
git commit -m "feat: add per-technician NPS average computation"
```

---

## Task 23: Encuestas page (technician side)

**Files:**
- Create: `src/app/(app)/(admin)/maintenance/surveys/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeAverageNpsByTechnician } from "@/lib/maintenanceSurveys";

export default async function MaintenanceSurveysPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const { data: surveys } = await supabase
    .from("maintenance_surveys")
    .select(
      "id, status, nps_score, quality_score, punctuality_score, professionalism_score, clarity_score, comments, responded_at, maintenance_record_id, app_users(id, full_name, email), maintenance_records(first_name, last_name)",
    )
    .order("responded_at", { ascending: false, nullsFirst: false });

  const answered = (surveys ?? []).filter((s) => s.status === "respondida");
  const averages = computeAverageNpsByTechnician(
    answered.map((s) => {
      const tech = s.app_users as unknown as { id: string; full_name: string | null; email: string } | null;
      return {
        technician_id: tech?.id ?? "desconocido",
        technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
        nps_score: s.nps_score,
      };
    }),
  );

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Encuestas de satisfacción</h1>
        <Link href="/maintenance" className="text-sm underline">
          Volver a Mantenimientos
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Promedio de NPS por técnico</h2>
        {averages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="py-3">Técnico</TableHead>
                  <TableHead className="py-3">Promedio NPS</TableHead>
                  <TableHead className="py-3">Respuestas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {averages.map((a) => (
                  <TableRow key={a.technician_id}>
                    <TableCell className="py-3">{a.technician_name}</TableCell>
                    <TableCell className="py-3">{a.average}</TableCell>
                    <TableCell className="py-3">{a.responses}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Respuestas individuales</h2>
        {answered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="py-3">Usuario</TableHead>
                  <TableHead className="py-3">NPS</TableHead>
                  <TableHead className="py-3">Calidad</TableHead>
                  <TableHead className="py-3">Puntualidad</TableHead>
                  <TableHead className="py-3">Profesionalismo</TableHead>
                  <TableHead className="py-3">Claridad</TableHead>
                  <TableHead className="py-3">Comentarios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {answered.map((s) => {
                  const record = s.maintenance_records as unknown as { first_name: string; last_name: string } | null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="py-3">
                        {record ? `${record.first_name} ${record.last_name}` : "-"}
                      </TableCell>
                      <TableCell className="py-3">{s.nps_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.quality_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.punctuality_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.professionalism_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.clarity_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.comments ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/maintenance/surveys` as a Super Admin. Before any survey response exists it should show the two "Todavía no hay respuestas" messages; after completing Task 24's public survey flow, confirm the row and average appear.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/maintenance/surveys/page.tsx"
git commit -m "feat: add Encuestas page with per-technician NPS averages"
```

---

## Task 24: Public survey actions and page (`/encuesta/[token]`)

**Files:**
- Create: `src/app/encuesta/[token]/actions.ts`
- Test: `src/app/encuesta/[token]/actions.test.ts`
- Create: `src/app/encuesta/[token]/page.tsx`
- Create: `src/app/encuesta/[token]/SurveyForm.tsx`

- [ ] **Step 1: Write the failing test for the submit action**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { submitSurveyResponse } from "./actions";

function mockAdmin({ record = null, updateError = null }: { record?: Record<string, unknown> | null; updateError?: { message: string } | null } = {}) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: record, error: record ? null : { message: "not found" } });
  const eqSelectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock });
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock, update: updateMock }), _mocks: { updateMock, updateEqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitSurveyResponse", () => {
  it("rejects an unknown token", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);

    const result = await submitSurveyResponse("bad-token", {
      nps_score: 9,
      quality_score: 5,
      punctuality_score: 5,
      professionalism_score: 5,
      clarity_score: 5,
      comments: "",
    });

    expect(result.error).toBe("Enlace inválido o expirado");
  });

  it("rejects a survey that was already answered", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin({ record: { id: "s1", status: "respondida" } }) as never);

    const result = await submitSurveyResponse("token-1", {
      nps_score: 9,
      quality_score: 5,
      punctuality_score: 5,
      professionalism_score: 5,
      clarity_score: 5,
      comments: "",
    });

    expect(result.error).toBe("Esta encuesta ya fue respondida");
  });

  it("saves the responses and marks the survey as respondida", async () => {
    const admin = mockAdmin({ record: { id: "s1", status: "pendiente" } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await submitSurveyResponse("token-1", {
      nps_score: 9,
      quality_score: 5,
      punctuality_score: 4,
      professionalism_score: 5,
      clarity_score: 4,
      comments: "Muy buen servicio",
    });

    expect(result.error).toBeUndefined();
    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "respondida",
        nps_score: 9,
        quality_score: 5,
        punctuality_score: 4,
        professionalism_score: 5,
        clarity_score: 4,
        comments: "Muy buen servicio",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/encuesta/[token]/actions.test.ts"`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Write the action implementation**

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";

interface ActionResult {
  error?: string;
}

export interface SurveyResponseInput {
  nps_score: number;
  quality_score: number;
  punctuality_score: number;
  professionalism_score: number;
  clarity_score: number;
  comments: string;
}

export async function submitSurveyResponse(token: string, input: SurveyResponseInput): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("maintenance_surveys")
    .select("id, status")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return { error: "Enlace inválido o expirado" };
  if (data.status === "respondida") return { error: "Esta encuesta ya fue respondida" };

  const { error: updateError } = await admin
    .from("maintenance_surveys")
    .update({
      status: "respondida",
      responded_at: new Date().toISOString(),
      nps_score: input.nps_score,
      quality_score: input.quality_score,
      punctuality_score: input.punctuality_score,
      professionalism_score: input.professionalism_score,
      clarity_score: input.clarity_score,
      comments: input.comments || null,
    })
    .eq("id", data.id);
  if (updateError) return { error: updateError.message };

  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/encuesta/[token]/actions.test.ts"`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the survey form component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitSurveyResponse, type SurveyResponseInput } from "./actions";

const RATING_QUESTIONS: { key: keyof Omit<SurveyResponseInput, "nps_score" | "comments">; label: string }[] = [
  { key: "quality_score", label: "¿Cómo calificaría la calidad del trabajo realizado?" },
  { key: "punctuality_score", label: "¿Cómo calificaría la puntualidad del técnico?" },
  { key: "professionalism_score", label: "¿Cómo calificaría la amabilidad y profesionalismo del técnico?" },
  { key: "clarity_score", label: "¿Qué tan clara fue la explicación del trabajo realizado?" },
];

export function SurveyForm({ token }: { token: string }) {
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number | null>>({
    quality_score: null,
    punctuality_score: null,
    professionalism_score: null,
    clarity_score: null,
  });
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (npsScore === null || Object.values(ratings).some((v) => v === null)) {
      setError("Responde todas las preguntas antes de enviar");
      return;
    }
    startTransition(async () => {
      const result = await submitSurveyResponse(token, {
        nps_score: npsScore,
        quality_score: ratings.quality_score!,
        punctuality_score: ratings.punctuality_score!,
        professionalism_score: ratings.professionalism_score!,
        clarity_score: ratings.clarity_score!,
        comments,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return <p className="text-sm text-green-700">¡Gracias por tu respuesta!</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          ¿Qué tan probable es que recomiende nuestro servicio técnico a un colega? (0 = nada probable, 10 = muy probable)
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNpsScore(n)}
              className={`size-8 rounded border text-sm ${npsScore === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {RATING_QUESTIONS.map((q) => (
        <div key={q.key} className="space-y-2">
          <p className="text-sm font-medium">{q.label}</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatings((prev) => ({ ...prev, [q.key]: n }))}
                className={`size-8 rounded border text-sm ${ratings[q.key] === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-sm font-medium">Comentarios (opcional)</p>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </div>
      <Button type="button" onClick={submit} disabled={isPending}>
        Enviar
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { SurveyForm } from "./SurveyForm";

export default async function SurveyPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: survey } = await admin.from("maintenance_surveys").select("status").eq("token", token).maybeSingle();

  if (!survey) {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Enlace no disponible</h1>
        <p className="text-sm text-muted-foreground">Este enlace de encuesta no es válido.</p>
      </div>
    );
  }

  if (survey.status === "respondida") {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Ya respondiste esta encuesta</h1>
        <p className="text-sm text-muted-foreground">Gracias por tu tiempo.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Encuesta de satisfacción</h1>
        <p className="text-sm text-muted-foreground">
          Nos ayudaría mucho conocer tu opinión sobre el mantenimiento recibido.
        </p>
      </div>
      <SurveyForm token={token} />
    </div>
  );
}
```

- [ ] **Step 7: Manually verify**

Complete a maintenance record end-to-end (Task 20's flow through both signatures), find the survey link emailed to the test user's mailbox (or read `surveyToken` off the `maintenance_surveys` row directly in the DB during dev), open `/encuesta/[token]`, answer all 5 questions, submit, and confirm the response appears on `/maintenance/surveys`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/encuesta/[token]"
git commit -m "feat: add public NPS satisfaction survey page"
```

---

## Task 25: Integration RLS tests

**Files:**
- Create: `src/test/integration/maintenanceRls.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function createMaintenanceProfile(overrides: { can_view?: boolean; can_add?: boolean; can_delete?: boolean }) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("role_profiles")
    .insert({ name: `Maintenance Test ${Date.now()}-${Math.random().toString(36).slice(2)}` })
    .select()
    .single();
  const profileId = profile!.id as string;

  const { data: moduleRow } = await admin.from("modules").select("id").eq("key", "maintenance").single();

  await admin.from("role_profile_permissions").insert({
    role_profile_id: profileId,
    module_id: moduleRow!.id,
    can_view: overrides.can_view ?? false,
    can_add: overrides.can_add ?? false,
    can_edit: false,
    can_delete: overrides.can_delete ?? false,
    can_deactivate: false,
    can_manage: false,
    can_authorize: false,
  });

  return profileId;
}

async function assignProfile(userId: string, profileId: string) {
  const admin = createAdminClient();
  await admin.from("app_users").update({ role_profile_id: profileId }).eq("id", userId);
}

async function makeContact() {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").insert({ name: "Maintenance Test Co" }).select().single();
  const { data: contact } = await admin
    .from("contacts")
    .insert({ first_name: "Test", last_name: "Contact", company_id: company!.id })
    .select()
    .single();
  return { companyId: company!.id as string, contactId: contact!.id as string };
}

describe("maintenance_records RLS", () => {
  let user: TestUser | undefined;
  let profileId: string;
  let contactId: string;
  let companyId: string;
  let recordId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (recordId) await admin.from("maintenance_records").delete().eq("id", recordId);
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (user) await deleteTestUser(user.id);
    if (profileId) await admin.from("role_profiles").delete().eq("id", profileId);
    user = undefined;
    recordId = "";
    contactId = "";
    companyId = "";
    profileId = "";
  });

  it("blocks a user without can_add from creating a record", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: false });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { error } = await user.client.from("maintenance_records").insert({
      token: `test-${Date.now()}`,
      contact_id: contactId,
      created_by: user.id,
      first_name: "Test",
      last_name: "Contact",
    });

    expect(error).not.toBeNull();
  });

  it("lets a user with can_add create a record and read it back", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: true });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data, error } = await user.client
      .from("maintenance_records")
      .insert({
        token: `test-${Date.now()}`,
        contact_id: contactId,
        created_by: user.id,
        first_name: "Test",
        last_name: "Contact",
      })
      .select()
      .single();

    expect(error).toBeNull();
    recordId = data!.id;
  });

  it("blocks a user without can_view from reading records", async () => {
    ({ contactId, companyId } = await makeContact());
    const admin = createAdminClient();
    const { data: created } = await admin
      .from("maintenance_records")
      .insert({ token: `test-${Date.now()}`, contact_id: contactId, created_by: (await createTestUser("Viewer")).id, first_name: "Test", last_name: "Contact" })
      .select()
      .single();
    recordId = created!.id;

    profileId = await createMaintenanceProfile({ can_view: false });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data } = await user.client.from("maintenance_records").select("*").eq("id", recordId);

    expect(data).toEqual([]);
  });

  it("blocks a user without can_delete from deleting a record", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: true, can_delete: false });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data: created } = await user.client
      .from("maintenance_records")
      .insert({ token: `test-${Date.now()}`, contact_id: contactId, created_by: user.id, first_name: "Test", last_name: "Contact" })
      .select()
      .single();
    recordId = created!.id;

    const { error } = await user.client.from("maintenance_records").delete().eq("id", recordId);
    // RLS blocks silently (0 rows affected) rather than returning a Postgres error.
    expect(error).toBeNull();
    const admin = createAdminClient();
    const { data: stillThere } = await admin.from("maintenance_records").select("id").eq("id", recordId);
    expect(stillThere).toHaveLength(1);
  });

  it("blocks any authenticated user from updating a record directly (content only changes via the admin client)", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: true, can_delete: true });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data: created } = await user.client
      .from("maintenance_records")
      .insert({ token: `test-${Date.now()}`, contact_id: contactId, created_by: user.id, first_name: "Test", last_name: "Contact" })
      .select()
      .single();
    recordId = created!.id;

    const { data: updated } = await user.client
      .from("maintenance_records")
      .update({ host_name: "should-not-work" })
      .eq("id", recordId)
      .select();

    expect(updated).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes against the real local Supabase instance**

Run: `npm run test -- src/test/integration/maintenanceRls.test.ts`
Expected: PASS (5 tests). Requires the local Supabase stack running (`supabase start`) with `.env.local` pointed at it, matching how the other `*Rls.test.ts` files in this repo are run.

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/maintenanceRls.test.ts
git commit -m "test: add maintenance_records RLS integration coverage"
```

---

## Task 26: Full manual end-to-end verification

**Files:** none (manual QA pass — no code changes)

- [ ] **Step 1: Run the full automated suite once**

Run: `npm run test`
Expected: all tests pass, including every test added in Tasks 6–8, 10, 14–19, 22, 24, 25.

- [ ] **Step 2: Manual walkthrough — in-person scenario**

1. Sign in as a Super Admin (or a role with `maintenance` view/add). Go to `/maintenance`.
2. Click "Nuevo mantenimiento", pick a real contact, confirm the row appears with status "Pendiente".
3. Click "Ver", copy the link, open it in an incognito window (simulating the shared-device in-person flow).
4. Fill in equipment info and all 10 checklist items, add findings/observations, click "Guardar progreso" — confirm "Progreso guardado".
5. Draw and save the technician signature, then the user signature.
6. Confirm the page shows "Mantenimiento completado" after the second signature.
7. Confirm the real email arrives (using the SMTP configured in `/settings`) at `acusesdeti@sanchezbusinesscorp.com` with subject `Mantenimiento - {nombre} - {fecha}` and the PDF attached; open the PDF and confirm all sections (user info, equipment, checklist, hallazgos, observaciones, both signatures) render correctly.
8. Confirm a second email with the survey link arrives at the test contact's email address.
9. Back in the app, confirm `/maintenance` shows the record as "Completado" and `/maintenance/[id]` shows "Descargar PDF" with no "Reenviar correo" button (no `email_error`).

- [ ] **Step 3: Manual walkthrough — remote / partial-completion scenario**

1. Create a second maintenance record and copy its link.
2. As the "technician", open the link, fill in equipment info and the checklist, sign only the technician signature, and close the tab (simulating the technician finishing on-site before the user is available).
3. Reopen the same link (simulating the user opening it later from the emailed/shared link) and confirm the previously entered equipment info/checklist/technician signature are still present and only the user's signature is missing.
4. Sign as the user and confirm completion triggers exactly as in the in-person scenario.

- [ ] **Step 4: Manual walkthrough — error and expiry paths**

1. Open `/mantenimiento/does-not-exist` and confirm the generic "Enlace no disponible" message (not a stack trace or Next.js error page).
2. In the local DB, manually set a pending test record's `expires_at` to a past timestamp (`update maintenance_records set expires_at = now() - interval '1 day' where id = '...';`), reload its link, and confirm it now shows the same "Enlace no disponible" message and that the row's `status` flipped to `expirado` in the DB.
3. Temporarily break the SMTP settings in `/settings` (wrong password), complete a maintenance record end-to-end, and confirm: the record still reaches `completado`, the PDF is still downloadable from `/maintenance/[id]`, and a "Reenviar correo" button appears with the error message. Restore the correct SMTP settings and click "Reenviar correo"; confirm the email arrives and the button disappears on reload.

- [ ] **Step 5: Manual walkthrough — permissions**

1. As a Viewer-profile user with no `maintenance` permissions granted, confirm "Mantenimientos" does not appear in the sidebar and `/maintenance` redirects to `/`.
2. Grant only `can_view` on the `maintenance` module (via `/role-profiles`) and confirm the user can see `/maintenance` and open record details, but has no "Nuevo mantenimiento" button and no "Cancelar" buttons.

No commit for this task — it's verification only. If any step fails, fix the underlying task and re-run this checklist before considering the feature done.

---

## Self-review notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-28-preventive-maintenance-design.md` maps to a task — data model (Tasks 2–5), permissions (Tasks 1, 9), technician UI (Tasks 10–13, 21, 23), public form/signatures (Tasks 14–20), PDF/email (Tasks 14–16, 21), survey (Tasks 3, 22–24), error handling (retry-safe completion in Task 16, resend in Task 21, expiry in Tasks 8/17), and testing (Tasks 6–8, 10, 14–19, 22, 24, 25 automated; Task 26 manual).
- **Type consistency check:** `MaintenanceRecordForCompletion` (Task 16) is built from the same field names used in the migration (Task 2) and consumed identically in `actions.ts` (Task 18) and `completeMaintenanceRecord.test.ts`; `MAINTENANCE_CHECKLIST_ITEMS` keys (Task 6) are the single source referenced by the migration comment, the PDF builder input (Task 16), the technician detail view (Task 12), and the public form (Task 20) — no separate hand-typed checklist list exists anywhere else.
- **No placeholders:** every step above contains complete, real code — no "TODO"/"similar to Task N" placeholders remain.
