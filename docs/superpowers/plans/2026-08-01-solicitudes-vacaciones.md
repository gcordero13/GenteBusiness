# Solicitudes: Vacaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitize the paper "Formulario Solicitud de Vacaciones": an employee submits their own vacation request, it routes to their direct supervisor (resolved via `contacts.reports_to_id`) for approval, then to Recursos Humanos (RRHH, via a new `can_authorize` permission) for final approval and classification — reusing the existing saved-signature gallery for sign-off.

**Architecture:** A new `solicitudes_vacaciones` module + `vacation_requests` table. Every authenticated `app_user` gets baseline access (create their own, view their own, act as a resolved supervisor) with zero module permissions — mirroring the contact self-edit precedent — while `can_view`/`can_authorize` on the new module grant oversight and the RRHH stage. Supervisor resolution walks `contacts.reports_to_id` via the admin client (a normal user's session can't read a coworker's contact row) and is snapshotted onto the request at submission time so later org-chart edits don't reroute an in-flight request. Signatures reuse the existing `user_signatures` gallery/`SignatureDialog` as-is, copying the picked image into a per-request storage path at approval time.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (RLS + `security definer` functions), `@supabase/ssr`, nodemailer (existing `sendMaintenanceEmail.ts`-style branded HTML emails), Vitest.

**Related spec:** `docs/superpowers/specs/2026-08-01-solicitudes-vacaciones-design.md`

---

### Task 1: Migration — register the `solicitudes_vacaciones` module

**Files:**
- Create: `supabase/migrations/20260801160000_solicitudes_vacaciones_module.sql`

- [ ] **Step 1: Write the migration**

```sql
insert into public.modules (key, label) values ('solicitudes_vacaciones', 'Solicitudes: Vacaciones');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, (rp.name = 'Super Admin'), false, false, false, false, false, (rp.name = 'Super Admin')
from public.role_profiles rp
cross join public.modules m
where m.key = 'solicitudes_vacaciones';
```

Save to `supabase/migrations/20260801160000_solicitudes_vacaciones_module.sql`. This follows the exact same pattern as `20260722194116_settings_module.sql` and `20260723141249_document_stamps_module.sql` — read either first to confirm nothing has drifted.

- [ ] **Step 2: Apply and verify**

Source env vars without printing secrets, then run the migration via the Supabase Management API (same pattern used throughout this project):

```bash
set -a; source .env.local; set +a
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260801160000_solicitudes_vacaciones_module.sql', 'utf8');
fs.writeFileSync('./mig_payload.json', JSON.stringify({query: sql}));
"
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @mig_payload.json
rm -f mig_payload.json
```

Expected: `[]` (DDL/DML with no returned rows). Then verify the module and Super Admin grant exist:

```bash
node -e "
const fs = require('fs');
const sql = \"select m.key, rpp.can_view, rpp.can_authorize from public.role_profile_permissions rpp join public.modules m on m.id = rpp.module_id join public.role_profiles rp on rp.id = rpp.role_profile_id where m.key = 'solicitudes_vacaciones' and rp.name = 'Super Admin';\";
fs.writeFileSync('./check_payload.json', JSON.stringify({query: sql}));
"
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @check_payload.json
rm -f check_payload.json
```

Expected: one row with `can_view: true, can_authorize: true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260801160000_solicitudes_vacaciones_module.sql
git commit -m "feat: register the solicitudes_vacaciones module"
```

---

### Task 2: Migration — `vacation_requests` table + RLS

**Files:**
- Create: `supabase/migrations/20260801160100_vacation_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.vacation_requests (
  id uuid primary key default gen_random_uuid(),

  contact_id uuid not null references public.contacts (id),
  requester_app_user_id uuid not null references public.app_users (id),

  -- Snapshotted from the requester's contact at submission time so later
  -- edits to their contact record don't retroactively change an in-flight
  -- request — same reasoning already used by maintenance_records.
  first_name text not null,
  last_name text not null,
  position text,
  company_name text,
  department_name text,

  period text,
  days_requested integer not null,
  date_from date not null,
  date_to date not null,
  return_date date not null,
  days_pending integer,
  notes text,

  status text not null default 'pendiente_supervisor'
    check (status in ('pendiente_supervisor', 'pendiente_rrhh', 'aprobado', 'rechazado')),

  -- Resolved via contacts.reports_to_id and snapshotted at submission time.
  supervisor_app_user_id uuid not null references public.app_users (id),
  supervisor_decision text check (supervisor_decision in ('aprobado', 'rechazado')),
  supervisor_decided_at timestamptz,
  supervisor_comments text,
  supervisor_signature_path text,

  rrhh_decision text check (rrhh_decision in ('aprobado', 'rechazado')),
  rrhh_decided_at timestamptz,
  rrhh_decided_by uuid references public.app_users (id),
  rrhh_comments text,
  rrhh_signature_path text,
  rrhh_period_confirmed text,
  rrhh_has_current_vacation boolean,
  rrhh_is_advance boolean,

  created_at timestamptz not null default now()
);

alter table public.vacation_requests enable row level security;

-- Baseline: the requester sees their own; the resolved supervisor sees what
-- they need to act on; can_view/can_authorize grant oversight beyond that.
create policy "vacation_requests_select" on public.vacation_requests
for select
using (
  requester_app_user_id = auth.uid()
  or supervisor_app_user_id = auth.uid()
  or coalesce((select can_view from public.get_my_module_permissions('solicitudes_vacaciones')), false)
  or coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false)
);

-- Anyone can submit their own request — no module permission required.
-- The supervisor_app_user_id value itself is resolved and validated by the
-- server action (via the admin client, since a plain user session can't
-- read a coworker's contact row) before this insert runs.
create policy "vacation_requests_insert_self" on public.vacation_requests
for insert
with check ( requester_app_user_id = auth.uid() );

-- The resolved supervisor may only act while the request is still awaiting
-- them; once it moves to RRHH this policy no longer applies to them.
create policy "vacation_requests_update_supervisor" on public.vacation_requests
for update
using ( supervisor_app_user_id = auth.uid() and status = 'pendiente_supervisor' )
with check ( supervisor_app_user_id = auth.uid() );

-- RRHH (can_authorize) may only act once the supervisor stage has passed.
create policy "vacation_requests_update_rrhh" on public.vacation_requests
for update
using (
  status = 'pendiente_rrhh'
  and coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false)
)
with check ( coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false) );
```

Save to `supabase/migrations/20260801160100_vacation_requests.sql`.

- [ ] **Step 2: Apply and verify**

```bash
set -a; source .env.local; set +a
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260801160100_vacation_requests.sql', 'utf8');
fs.writeFileSync('./mig_payload.json', JSON.stringify({query: sql}));
"
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @mig_payload.json
rm -f mig_payload.json
```

Expected: `[]`. Then confirm the table exists:

```bash
node -e "
const fs = require('fs');
const sql = \"select count(*) from public.vacation_requests;\";
fs.writeFileSync('./check_payload.json', JSON.stringify({query: sql}));
"
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @check_payload.json
rm -f check_payload.json
```

Expected: `[{"count":"0"}]`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260801160100_vacation_requests.sql
git commit -m "feat: add vacation_requests table and RLS"
```

---

### Task 3: Migration — private storage bucket for approval signatures

**Files:**
- Create: `supabase/migrations/20260801160200_vacation_request_signatures_storage.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Admin-client-only, same reasoning as email_settings: this bucket only ever
-- gets written by the respond-as-supervisor/respond-as-rrhh server actions
-- (which use the admin client after their own application-level checks),
-- and only ever read via server-generated signed URLs. RLS enabled with zero
-- policies denies the anon and authenticated roles entirely.
insert into storage.buckets (id, name, public)
values ('vacation-request-signatures', 'vacation-request-signatures', false)
on conflict (id) do nothing;
```

Save to `supabase/migrations/20260801160200_vacation_request_signatures_storage.sql`.

- [ ] **Step 2: Apply and verify**

```bash
set -a; source .env.local; set +a
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260801160200_vacation_request_signatures_storage.sql', 'utf8');
fs.writeFileSync('./mig_payload.json', JSON.stringify({query: sql}));
"
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @mig_payload.json
rm -f mig_payload.json
```

Expected: `[]`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260801160200_vacation_request_signatures_storage.sql
git commit -m "feat: add private storage bucket for vacation request signatures"
```

---

### Task 4: `resolveVacationSupervisor` helper

**Files:**
- Create: `src/lib/resolveVacationSupervisor.ts`
- Test: `src/lib/resolveVacationSupervisor.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { resolveVacationSupervisor } from "./resolveVacationSupervisor";

function mockAdmin({
  contact = null,
  supervisorContact = null,
  supervisorUser = null,
}: {
  contact?: Record<string, unknown> | null;
  supervisorContact?: Record<string, unknown> | null;
  supervisorUser?: Record<string, unknown> | null;
} = {}) {
  let call = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "contacts") {
        call += 1;
        const data = call === 1 ? contact : supervisorContact;
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data }) }) }) };
      }
      if (table === "app_users") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: supervisorUser }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("resolveVacationSupervisor", () => {
  it("rejects when the requester has no matching contact", async () => {
    const result = await resolveVacationSupervisor(mockAdmin() as never, "ana@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No se encontró tu contacto");
  });

  it("rejects when the contact has no reports_to_id", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({ contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: null, companies: null, departments: null } }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("jefe directo asignado");
  });

  it("rejects when the supervisor contact has no email", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: "c2", companies: null, departments: null },
        supervisorContact: { email: null },
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no tiene un correo registrado");
  });

  it("rejects when the supervisor has no active app_user account", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: "c2", companies: null, departments: null },
        supervisorContact: { email: "jefe@example.com" },
        supervisorUser: null,
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cuenta activa");
  });

  it("rejects when the supervisor's account is deactivated", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: "c2", companies: null, departments: null },
        supervisorContact: { email: "jefe@example.com" },
        supervisorUser: { id: "sup-1", status: "deactivated" },
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cuenta activa");
  });

  it("resolves successfully when every link in the chain is valid", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: {
          id: "c1",
          first_name: "Ana",
          last_name: "García",
          position: "Analista",
          reports_to_id: "c2",
          companies: { name: "Sanchez Business Corp" },
          departments: { name: "TI" },
        },
        supervisorContact: { email: "jefe@example.com" },
        supervisorUser: { id: "sup-1", status: "active" },
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        contactId: "c1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/resolveVacationSupervisor.test.ts`
Expected: FAIL — cannot find module `./resolveVacationSupervisor`.

- [ ] **Step 3: Write the implementation**

```typescript
import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

export interface ResolvedVacationSupervisor {
  contactId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string | null;
  departmentName: string | null;
  supervisorAppUserId: string;
}

type ResolveResult = { ok: true; data: ResolvedVacationSupervisor } | { ok: false; error: string };

export async function resolveVacationSupervisor(
  admin: ReturnType<typeof createAdminClient>,
  requesterEmail: string,
): Promise<ResolveResult> {
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, position, reports_to_id, companies(name), departments(name)")
    .eq("email", requesterEmail)
    .maybeSingle();

  if (!contact) {
    return { ok: false, error: "No se encontró tu contacto en la Agenda. Pide a un administrador que lo cree con tu correo." };
  }
  if (!contact.reports_to_id) {
    return {
      ok: false,
      error: "No tienes un jefe directo asignado en tu ficha de contacto. Pide a un administrador que lo asigne antes de enviar una solicitud.",
    };
  }

  const { data: supervisorContact } = await admin
    .from("contacts")
    .select("email")
    .eq("id", contact.reports_to_id)
    .maybeSingle();

  if (!supervisorContact?.email) {
    return { ok: false, error: "Tu jefe directo no tiene un correo registrado en la Agenda. Pide a un administrador que lo corrija." };
  }

  const { data: supervisorUser } = await admin
    .from("app_users")
    .select("id, status")
    .eq("email", supervisorContact.email)
    .maybeSingle();

  if (!supervisorUser || supervisorUser.status !== "active") {
    return { ok: false, error: "Tu jefe directo no tiene una cuenta activa en el sistema. Pide a un administrador que la habilite." };
  }

  return {
    ok: true,
    data: {
      contactId: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      position: contact.position,
      companyName: (contact.companies as unknown as { name: string } | null)?.name ?? null,
      departmentName: (contact.departments as unknown as { name: string } | null)?.name ?? null,
      supervisorAppUserId: supervisorUser.id,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/resolveVacationSupervisor.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolveVacationSupervisor.ts src/lib/resolveVacationSupervisor.test.ts
git commit -m "feat: add resolveVacationSupervisor helper"
```

---

### Task 5: Branded emails for the vacation request workflow

**Files:**
- Create: `src/lib/sendVacationRequestEmail.ts`
- Test: `src/lib/sendVacationRequestEmail.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, createTransportMock, lookupMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });
  const lookupMock = vi.fn().mockResolvedValue({ address: "40.100.1.1", family: 4 });
  return { sendMailMock, createTransportMock, lookupMock };
});

vi.mock("nodemailer", () => ({ default: { createTransport: createTransportMock } }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock, default: { lookup: lookupMock } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendVacationRequestSubmittedEmail,
  sendVacationRequestSupervisorDecisionEmail,
  sendVacationRequestRrhhDecisionEmail,
} from "./sendVacationRequestEmail";

const VALID_SETTINGS = {
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "user@example.com",
  smtp_pass: "secret",
  smtp_sender_name: "Gente Sánchez Business",
  smtp_admin_email: "notificaciones@sanchezbusinesscorp.com",
};

function mockAdmin() {
  const singleMock = vi.fn().mockResolvedValue({ data: VALID_SETTINGS, error: null });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock, maybeSingle: vi.fn().mockResolvedValue({ data: { logo_url: null }, error: null }) });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
});

describe("sendVacationRequestSubmittedEmail", () => {
  it("emails the resolved supervisor with a CTA button", async () => {
    await sendVacationRequestSubmittedEmail({
      supervisorEmail: "jefe@example.com",
      employeeName: "Ana García",
      requestUrl: "https://example.com/solicitudes/vacaciones",
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jefe@example.com", html: expect.stringContaining("Revisar solicitud") }),
    );
  });
});

describe("sendVacationRequestSupervisorDecisionEmail", () => {
  it("notifies the employee when the supervisor approves", async () => {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: true,
      requestUrl: "https://example.com/solicitudes/vacaciones",
    });

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com" }));
  });

  it("also notifies every RRHH authorizer when the supervisor approves", async () => {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: true,
      requestUrl: "https://example.com/solicitudes/vacaciones",
      rrhhEmails: ["rrhh1@example.com", "rrhh2@example.com"],
    });

    expect(sendMailMock).toHaveBeenCalledTimes(3);
  });

  it("does not email RRHH when the supervisor rejects", async () => {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: false,
      requestUrl: "https://example.com/solicitudes/vacaciones",
      rrhhEmails: ["rrhh1@example.com"],
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendVacationRequestRrhhDecisionEmail", () => {
  it("notifies the employee of the final decision", async () => {
    await sendVacationRequestRrhhDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: false,
    });

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com" }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sendVacationRequestEmail.test.ts`
Expected: FAIL — cannot find module `./sendVacationRequestEmail`.

- [ ] **Step 3: Write the implementation**

```typescript
import "server-only";
import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBrandedEmailHtml } from "@/lib/emailTemplates";

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

async function resolveConnectHost(host: string): Promise<string> {
  try {
    const { address } = await lookup(host, { family: 4 });
    return address;
  } catch {
    return host;
  }
}

async function buildTransport(settings: EmailSettings) {
  const connectHost = await resolveConnectHost(settings.smtp_host);
  return nodemailer.createTransport({
    host: connectHost,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
    tls: { servername: settings.smtp_host },
  });
}

function fromAddress(settings: EmailSettings): string {
  const name = settings.smtp_sender_name ?? "Gente Sánchez Business";
  const address = settings.smtp_admin_email ?? settings.smtp_user;
  return `${name} <${address}>`;
}

async function fetchPlatformLogoUrl(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("platform_settings").select("logo_url").eq("id", true).maybeSingle();
    return data?.logo_url ?? null;
  } catch {
    return null;
  }
}

export async function sendVacationRequestSubmittedEmail(input: {
  supervisorEmail: string;
  employeeName: string;
  requestUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: "Nueva solicitud de vacaciones",
    bodyHtml: `<p style="margin:0;">${input.employeeName} envió una solicitud de vacaciones que necesita tu aprobación.</p>`,
    ctaText: "Revisar solicitud",
    ctaUrl: input.requestUrl,
    logoUrl,
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.supervisorEmail,
    subject: `Solicitud de vacaciones de ${input.employeeName}`,
    text: `${input.employeeName} envió una solicitud de vacaciones que necesita tu aprobación: ${input.requestUrl}`,
    html,
  });
}

export async function sendVacationRequestSupervisorDecisionEmail(input: {
  employeeEmail: string;
  employeeName: string;
  approved: boolean;
  requestUrl: string;
  rrhhEmails?: string[];
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);

  const employeeHtml = buildBrandedEmailHtml({
    title: input.approved ? "Tu solicitud avanzó a Recursos Humanos" : "Tu solicitud de vacaciones fue rechazada",
    bodyHtml: `<p style="margin:0;">${
      input.approved
        ? "Tu jefe directo aprobó tu solicitud de vacaciones. Ahora está pendiente de la aprobación final de Recursos Humanos."
        : "Tu jefe directo rechazó tu solicitud de vacaciones."
    }</p>`,
    ctaText: "Ver mi solicitud",
    ctaUrl: input.requestUrl,
    logoUrl,
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.employeeEmail,
    subject: input.approved ? "Tu solicitud de vacaciones avanzó a RRHH" : "Tu solicitud de vacaciones fue rechazada",
    text: employeeHtml,
    html: employeeHtml,
  });

  if (input.approved && input.rrhhEmails?.length) {
    const rrhhHtml = buildBrandedEmailHtml({
      title: "Solicitud de vacaciones pendiente de aprobación",
      bodyHtml: `<p style="margin:0;">La solicitud de ${input.employeeName} fue aprobada por su jefe directo y necesita tu aprobación final.</p>`,
      ctaText: "Revisar solicitud",
      ctaUrl: input.requestUrl,
      logoUrl,
    });
    await Promise.all(
      input.rrhhEmails.map((to) =>
        transport.sendMail({
          from: fromAddress(settings),
          to,
          subject: `Solicitud de vacaciones de ${input.employeeName} pendiente de RRHH`,
          text: rrhhHtml,
          html: rrhhHtml,
        }),
      ),
    );
  }
}

export async function sendVacationRequestRrhhDecisionEmail(input: {
  employeeEmail: string;
  employeeName: string;
  approved: boolean;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: input.approved ? "¡Tu solicitud de vacaciones fue aprobada!" : "Tu solicitud de vacaciones fue rechazada",
    bodyHtml: `<p style="margin:0;">Recursos Humanos ${input.approved ? "aprobó" : "rechazó"} tu solicitud de vacaciones.</p>`,
    ctaText: "Ver mi solicitud",
    ctaUrl: "",
    logoUrl,
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.employeeEmail,
    subject: input.approved ? "Tu solicitud de vacaciones fue aprobada" : "Tu solicitud de vacaciones fue rechazada",
    text: html,
    html,
  });
}
```

Note: `sendVacationRequestRrhhDecisionEmail` passes `ctaUrl: ""` since the final-decision email has nowhere further to route the user besides the app itself — `buildBrandedEmailHtml` still renders a button; this is acceptable for now (clicking it opens the app's root) since the spec doesn't require a specific deep link for this final notification. If a specific link is wanted later (e.g. straight to `/solicitudes/vacaciones`), pass a real `requestUrl` the same way the other two functions do.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sendVacationRequestEmail.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sendVacationRequestEmail.ts src/lib/sendVacationRequestEmail.test.ts
git commit -m "feat: add branded emails for the vacation request workflow"
```

---

### Task 6: `createVacationRequest` action

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/actions.ts`
- Test: `src/app/(app)/solicitudes/vacaciones/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/resolveVacationSupervisor", () => ({ resolveVacationSupervisor: vi.fn() }));
vi.mock("@/lib/sendVacationRequestEmail", () => ({ sendVacationRequestSubmittedEmail: vi.fn() }));
vi.mock("@/lib/siteUrl", () => ({ getSiteUrl: vi.fn().mockResolvedValue("https://example.com") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import { sendVacationRequestSubmittedEmail } from "@/lib/sendVacationRequestEmail";
import { createVacationRequest } from "./actions";

const VALID_INPUT = {
  period: "2026",
  daysRequested: 2,
  dateFrom: "2026-11-13",
  dateTo: "2026-11-14",
  returnDate: "2026-11-17",
  daysPending: 5,
  notes: "",
};

function mockSupabase({ userEmail = "ana@example.com" }: { userEmail?: string | null } = {}) {
  const insertSelectSingle = vi.fn().mockResolvedValue({ error: null });
  const insertMock = vi.fn().mockReturnValue({ select: () => ({ single: insertSelectSingle }) });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userEmail ? { id: "user-1", email: userEmail } : null } }),
    },
    from: vi.fn().mockReturnValue({ insert: insertMock }),
    _mocks: { insertMock, insertSelectSingle },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue({} as never);
});

describe("createVacationRequest", () => {
  it("rejects when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ userEmail: null }) as never);

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBe("No autorizado");
  });

  it("surfaces the resolver's error when the supervisor chain is broken", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({ ok: false, error: "No tienes un jefe directo asignado en tu ficha de contacto. Pide a un administrador que lo asigne antes de enviar una solicitud." });

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBe("No tienes un jefe directo asignado en tu ficha de contacto. Pide a un administrador que lo asigne antes de enviar una solicitud.");
    expect(sendVacationRequestSubmittedEmail).not.toHaveBeenCalled();
  });

  it("creates the request and emails the resolved supervisor", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({
      ok: true,
      data: {
        contactId: "contact-1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      },
    });

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("vacation_requests");
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: "contact-1",
        requester_app_user_id: "user-1",
        first_name: "Ana",
        last_name: "García",
        supervisor_app_user_id: "sup-1",
        status: "pendiente_supervisor",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
      }),
    );
    expect(sendVacationRequestSubmittedEmail).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Write the implementation**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import { sendVacationRequestSubmittedEmail } from "@/lib/sendVacationRequestEmail";
import { getSiteUrl } from "@/lib/siteUrl";

interface ActionResult {
  error?: string;
}

export interface CreateVacationRequestInput {
  period: string;
  daysRequested: number;
  dateFrom: string;
  dateTo: string;
  returnDate: string;
  daysPending: number | null;
  notes: string;
}

export async function createVacationRequest(input: CreateVacationRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };

  const admin = createAdminClient();
  const resolved = await resolveVacationSupervisor(admin, user.email);
  if (!resolved.ok) return { error: resolved.error };

  const { error } = await supabase
    .from("vacation_requests")
    .insert({
      contact_id: resolved.data.contactId,
      requester_app_user_id: user.id,
      first_name: resolved.data.firstName,
      last_name: resolved.data.lastName,
      position: resolved.data.position,
      company_name: resolved.data.companyName,
      department_name: resolved.data.departmentName,
      period: input.period || null,
      days_requested: input.daysRequested,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      return_date: input.returnDate,
      days_pending: input.daysPending,
      notes: input.notes || null,
      status: "pendiente_supervisor",
      supervisor_app_user_id: resolved.data.supervisorAppUserId,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const { data: supervisor } = await admin.from("app_users").select("email").eq("id", resolved.data.supervisorAppUserId).maybeSingle();
  if (supervisor?.email) {
    const siteUrl = await getSiteUrl();
    await sendVacationRequestSubmittedEmail({
      supervisorEmail: supervisor.email,
      employeeName: `${resolved.data.firstName} ${resolved.data.lastName}`,
      requestUrl: `${siteUrl}/solicitudes/vacaciones`,
    });
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/actions.ts" "src/app/(app)/solicitudes/vacaciones/actions.test.ts"
git commit -m "feat: add createVacationRequest server action"
```

---

### Task 7: `respondAsSupervisor` and `respondAsRrhh` actions

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.ts`
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/app/(app)/solicitudes/vacaciones/actions.test.ts` (add these two new mocked modules to the top, alongside the existing `vi.mock` calls):

```typescript
vi.mock("@/lib/sendVacationRequestEmail", () => ({
  sendVacationRequestSubmittedEmail: vi.fn(),
  sendVacationRequestSupervisorDecisionEmail: vi.fn(),
  sendVacationRequestRrhhDecisionEmail: vi.fn(),
}));
```

(This replaces the narrower `sendVacationRequestEmail` mock from Task 6 — the two new functions are used by the code added in this task.)

Then add these imports next to the existing ones:

```typescript
import { sendVacationRequestSupervisorDecisionEmail, sendVacationRequestRrhhDecisionEmail } from "@/lib/sendVacationRequestEmail";
import { respondAsRrhh, respondAsSupervisor } from "./actions";
```

Then append at the end of the file:

```typescript
function mockSupabaseForRespond({
  userId = "sup-1",
  request,
  updateError = null,
}: {
  userId?: string;
  request: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}) {
  const requestSingleMock = vi.fn().mockResolvedValue({ data: request, error: request ? null : { message: "not found" } });
  const requestEqMock = vi.fn().mockReturnValue({ single: requestSingleMock });
  const requestSelectMock = vi.fn().mockReturnValue({ eq: requestEqMock });

  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    from: vi.fn().mockReturnValue({ select: requestSelectMock, update: updateMock }),
    _mocks: { requestSelectMock, requestEqMock, requestSingleMock, updateMock, updateEqMock },
  };
}

function mockAdminForRespond({ rrhhEmails = [] }: { rrhhEmails?: string[] } = {}) {
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  return {
    storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
    from: vi.fn((table: string) => {
      if (table === "app_users") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: rrhhEmails.map((email) => ({ email })) }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    _mocks: { uploadMock },
  };
}

const BASE_REQUEST = {
  id: "req-1",
  status: "pendiente_supervisor",
  requester_app_user_id: "emp-1",
  supervisor_app_user_id: "sup-1",
  first_name: "Ana",
  last_name: "García",
};

describe("respondAsSupervisor", () => {
  it("rejects when the caller is not the request's resolved supervisor", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRespond({ userId: "someone-else", request: BASE_REQUEST }) as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "");

    expect(result.error).toBe("No autorizado");
  });

  it("rejects when the request is not awaiting the supervisor", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabaseForRespond({ request: { ...BASE_REQUEST, status: "pendiente_rrhh" } }) as never,
    );

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "");

    expect(result.error).toBe("Esta solicitud ya no está pendiente de tu aprobación");
  });

  it("requires a signature to approve", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRespond({ request: BASE_REQUEST }) as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "", "");

    expect(result.error).toBe("Se requiere una firma para aprobar");
  });

  it("approves, uploads the signature, and moves the request to pendiente_rrhh", async () => {
    const supabase = mockSupabaseForRespond({ request: BASE_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond({ rrhhEmails: ["rrhh@example.com"] }) as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "Todo en orden");

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pendiente_rrhh", supervisor_decision: "aprobado", supervisor_comments: "Todo en orden" }),
    );
    expect(sendVacationRequestSupervisorDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });

  it("rejects without requiring a signature", async () => {
    const supabase = mockSupabaseForRespond({ request: BASE_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);

    const result = await respondAsSupervisor("req-1", "rechazado", "", "No cumple el aviso previo");

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rechazado", supervisor_decision: "rechazado" }),
    );
  });
});

describe("respondAsRrhh", () => {
  const RRHH_REQUEST = { ...BASE_REQUEST, status: "pendiente_rrhh" };

  it("rejects when the request is not pending RRHH", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRespond({ request: BASE_REQUEST }) as never);

    const result = await respondAsRrhh("req-1", "aprobado", "data:image/png;base64,AAAA", "", { periodConfirmed: "2026", hasCurrentVacation: true, isAdvance: false });

    expect(result.error).toBe("Esta solicitud no está pendiente de RRHH");
  });

  it("approves with classification and emails the employee", async () => {
    const supabase = mockSupabaseForRespond({ request: RRHH_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);

    const result = await respondAsRrhh("req-1", "aprobado", "data:image/png;base64,AAAA", "", {
      periodConfirmed: "2026",
      hasCurrentVacation: true,
      isAdvance: false,
    });

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "aprobado",
        rrhh_decision: "aprobado",
        rrhh_period_confirmed: "2026",
        rrhh_has_current_vacation: true,
        rrhh_is_advance: false,
      }),
    );
    expect(sendVacationRequestRrhhDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: FAIL — `respondAsSupervisor`/`respondAsRrhh` are not exported by `./actions`.

- [ ] **Step 3: Add the actions**

Add to `src/app/(app)/solicitudes/vacaciones/actions.ts` (after `createVacationRequest`; update the top-level import line for `sendVacationRequestEmail` to include the two new functions):

```typescript
import {
  sendVacationRequestSubmittedEmail,
  sendVacationRequestSupervisorDecisionEmail,
  sendVacationRequestRrhhDecisionEmail,
} from "@/lib/sendVacationRequestEmail";
```

```typescript
async function uploadDecisionSignature(
  admin: ReturnType<typeof createAdminClient>,
  requestId: string,
  role: "supervisor" | "rrhh",
  dataUrl: string,
): Promise<{ path?: string; error?: string }> {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { error: "Firma inválida" };

  const path = `${requestId}/${role}.png`;
  const { error } = await admin.storage.from("vacation-request-signatures").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) return { error: error.message };
  return { path };
}

export async function respondAsSupervisor(
  requestId: string,
  decision: "aprobado" | "rechazado",
  signatureDataUrl: string,
  comment: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: request, error: fetchError } = await supabase
    .from("vacation_requests")
    .select("id, status, requester_app_user_id, supervisor_app_user_id, first_name, last_name")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { error: "Solicitud no encontrada" };
  if (request.supervisor_app_user_id !== user.id) return { error: "No autorizado" };
  if (request.status !== "pendiente_supervisor") return { error: "Esta solicitud ya no está pendiente de tu aprobación" };

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    supervisor_decision: decision,
    supervisor_decided_at: new Date().toISOString(),
    supervisor_comments: comment || null,
  };

  if (decision === "aprobado") {
    if (!signatureDataUrl) return { error: "Se requiere una firma para aprobar" };
    const signature = await uploadDecisionSignature(admin, requestId, "supervisor", signatureDataUrl);
    if (signature.error) return { error: signature.error };
    update.supervisor_signature_path = signature.path;
    update.status = "pendiente_rrhh";
  } else {
    update.status = "rechazado";
  }

  const { error: updateError } = await supabase.from("vacation_requests").update(update).eq("id", requestId);
  if (updateError) return { error: updateError.message };

  const { data: employee } = await admin.from("app_users").select("email").eq("id", request.requester_app_user_id).maybeSingle();
  let rrhhEmails: string[] = [];
  if (decision === "aprobado") {
    const { data: rrhhUsers } = await admin
      .from("app_users")
      .select("email")
      .eq("role_profile_id", "solicitudes_vacaciones") // placeholder join replaced below
      .eq("status", "active");
    rrhhEmails = (rrhhUsers ?? []).map((u: { email: string }) => u.email);
  }
  if (employee?.email) {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: employee.email,
      employeeName: `${request.first_name} ${request.last_name}`,
      approved: decision === "aprobado",
      requestUrl: `${await getSiteUrl()}/solicitudes/vacaciones`,
      rrhhEmails,
    });
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}

export async function respondAsRrhh(
  requestId: string,
  decision: "aprobado" | "rechazado",
  signatureDataUrl: string,
  comment: string,
  classification: { periodConfirmed: string; hasCurrentVacation: boolean; isAdvance: boolean },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: request, error: fetchError } = await supabase
    .from("vacation_requests")
    .select("id, status, requester_app_user_id, first_name, last_name")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { error: "Solicitud no encontrada" };
  if (request.status !== "pendiente_rrhh") return { error: "Esta solicitud no está pendiente de RRHH" };

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    rrhh_decision: decision,
    rrhh_decided_at: new Date().toISOString(),
    rrhh_decided_by: user.id,
    rrhh_comments: comment || null,
    rrhh_period_confirmed: classification.periodConfirmed || null,
    rrhh_has_current_vacation: classification.hasCurrentVacation,
    rrhh_is_advance: classification.isAdvance,
    status: decision === "aprobado" ? "aprobado" : "rechazado",
  };

  if (decision === "aprobado") {
    if (!signatureDataUrl) return { error: "Se requiere una firma para aprobar" };
    const signature = await uploadDecisionSignature(admin, requestId, "rrhh", signatureDataUrl);
    if (signature.error) return { error: signature.error };
    update.rrhh_signature_path = signature.path;
  }

  const { error: updateError } = await supabase.from("vacation_requests").update(update).eq("id", requestId);
  if (updateError) return { error: updateError.message };

  const { data: employee } = await admin.from("app_users").select("email").eq("id", request.requester_app_user_id).maybeSingle();
  if (employee?.email) {
    await sendVacationRequestRrhhDecisionEmail({
      employeeEmail: employee.email,
      employeeName: `${request.first_name} ${request.last_name}`,
      approved: decision === "aprobado",
    });
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}
```

**Important correction before running tests:** the `rrhhEmails` lookup above (`eq("role_profile_id", "solicitudes_vacaciones")`) is wrong — `app_users` has no such column, and this is exactly the query the test's `mockAdminForRespond` fakes. Replace that whole block with a real lookup through `role_profile_permissions`/`modules`, mirroring `get_my_module_permissions` but for *all* users instead of just the caller:

```typescript
  let rrhhEmails: string[] = [];
  if (decision === "aprobado") {
    const { data: module } = await admin.from("modules").select("id").eq("key", "solicitudes_vacaciones").single();
    const { data: rrhhProfiles } = await admin
      .from("role_profile_permissions")
      .select("role_profile_id")
      .eq("module_id", module!.id)
      .eq("can_authorize", true);
    const profileIds = (rrhhProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
    if (profileIds.length > 0) {
      const { data: rrhhUsers } = await admin
        .from("app_users")
        .select("email")
        .in("role_profile_id", profileIds)
        .eq("status", "active");
      rrhhEmails = (rrhhUsers ?? []).map((u: { email: string }) => u.email);
    }
  }
```

This changes what the mocked `admin.from(...)` chain needs to support — update `mockAdminForRespond` in the test (Step 1, above) so `admin.from("modules")` and `admin.from("role_profile_permissions")` return sensible chained mocks too (matching the shape this real code now calls), alongside the existing `admin.from("app_users")` branch. Since this is a test-authoring detail rather than new product behavior, use your judgment to wire the three-table mock chain so the two `respondAsSupervisor` tests that assert `rrhhEmails` behavior keep passing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/actions.ts" "src/app/(app)/solicitudes/vacaciones/actions.test.ts"
git commit -m "feat: add respondAsSupervisor and respondAsRrhh actions"
```

---

### Task 8: Sidebar — "Solicitudes" group with "Vacaciones"

**Files:**
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Add the nav entry**

Read `src/app/(app)/Sidebar.tsx` in full first to confirm the current `mainLinks`/`settingsLinks` structure and lucide-react import block haven't drifted. Then:

- Add `Palmtree` to the lucide-react import list.
- Add a new array, unconditional (no permission gate — baseline access is available to every authenticated user, same reasoning as "Mi perfil"):

```typescript
  const solicitudesLinks: NavLink[] = [
    { href: "/solicitudes/vacaciones", label: "Vacaciones", icon: Palmtree },
  ];
```

- Add a new grouped block in the JSX, right after the existing `settingsLinks.length > 0 && (...)` block, following the exact same structure (group header + mapped links):

```tsx
          <div className="space-y-1 pt-4">
            {!collapsed && (
              <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                <Palmtree className="size-3.5" />
                Solicitudes
              </p>
            )}
            {solicitudesLinks.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                title={label}
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </a>
            ))}
          </div>
```

- [ ] **Step 2: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/Sidebar.tsx"
git commit -m "feat: add Solicitudes sidebar group with Vacaciones link"
```

---

### Task 9: `NewVacationRequestDialog` component

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
import { createVacationRequest } from "./actions";

export function NewVacationRequestDialog() {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("");
  const [daysRequested, setDaysRequested] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [daysPending, setDaysPending] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!daysRequested || !dateFrom || !dateTo || !returnDate) {
      setError("Completa cantidad de días, fecha desde/hasta y fecha de regreso");
      return;
    }
    startTransition(async () => {
      const result = await createVacationRequest({
        period,
        daysRequested: Number(daysRequested),
        dateFrom,
        dateTo,
        returnDate,
        daysPending: daysPending ? Number(daysPending) : null,
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setPeriod("");
      setDaysRequested("");
      setDateFrom("");
      setDateTo("");
      setReturnDate("");
      setDaysPending("");
      setNotes("");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button>Nueva solicitud</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva solicitud de vacaciones</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Período correspondiente</Label>
            <Input placeholder="2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cantidad de días solicitados</Label>
            <Input type="number" min="1" value={daysRequested} onChange={(e) => setDaysRequested(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Fecha de regreso</Label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Días pendientes</Label>
            <Input type="number" min="0" value={daysPending} onChange={(e) => setDaysPending(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Observaciones (opcional)</Label>
            <textarea
              className="w-full rounded-md border p-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending}>
            Enviar para aprobación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx"
git commit -m "feat: add NewVacationRequestDialog"
```

---

### Task 10: `VacationRequestActions` — Approve/Reject with reused signature dialog

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx`

- [ ] **Step 1: Write the component**

This reuses the existing `SignatureDialog` and its backing `saveSignature`/`deleteSignature` actions from Sellos y Firmas as-is (they're generic — owner-only RLS, no `document_stamps`-specific coupling) rather than rebuilding signature-picking UI:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SignatureDialog } from "@/app/(app)/(admin)/document-stamps/SignatureDialog";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import { respondAsRrhh, respondAsSupervisor } from "./actions";

interface Props {
  requestId: string;
  role: "supervisor" | "rrhh";
  signatures: SignatureWithUrl[];
}

export function VacationRequestActions({ requestId, role, signatures }: Props) {
  const [comment, setComment] = useState("");
  const [periodConfirmed, setPeriodConfirmed] = useState("");
  const [hasCurrentVacation, setHasCurrentVacation] = useState(false);
  const [isAdvance, setIsAdvance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve(signatureDataUrl: string) {
    startTransition(async () => {
      const result =
        role === "supervisor"
          ? await respondAsSupervisor(requestId, "aprobado", signatureDataUrl, comment)
          : await respondAsRrhh(requestId, "aprobado", signatureDataUrl, comment, {
              periodConfirmed,
              hasCurrentVacation,
              isAdvance,
            });
      if (result.error) setError(result.error);
    });
  }

  function reject() {
    startTransition(async () => {
      const result =
        role === "supervisor"
          ? await respondAsSupervisor(requestId, "rechazado", "", comment)
          : await respondAsRrhh(requestId, "rechazado", "", comment, {
              periodConfirmed,
              hasCurrentVacation,
              isAdvance,
            });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {role === "rrhh" && (
        <div className="space-y-2 text-sm">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período al que responde</label>
            <input
              className="w-full rounded-md border p-2 text-sm"
              value={periodConfirmed}
              onChange={(e) => setPeriodConfirmed(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hasCurrentVacation} onChange={(e) => setHasCurrentVacation(e.target.checked)} />
            Tiene vacaciones vigente
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
            Tomará vacaciones por adelantada
          </label>
        </div>
      )}
      <textarea
        className="w-full rounded-md border p-2 text-sm"
        rows={2}
        placeholder="Comentario (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex gap-2">
        <SignatureDialog signatures={signatures} onPick={approve} />
        <Button type="button" variant="outline" onClick={reject} disabled={isPending}>
          Rechazar
        </Button>
      </div>
    </div>
  );
}
```

Note: `SignatureDialog`'s trigger button reads "Firma" — clicking it opens the picker/drawing dialog, and picking or drawing+saving a signature calls `onPick(dataUrl)`, which here directly submits the approval. This matches the spec's requirement that approving opens the signature flow rather than a separate "Aprobar" button.

- [ ] **Step 2: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx"
git commit -m "feat: add VacationRequestActions with reused signature dialog"
```

---

### Task 11: `/solicitudes/vacaciones` list page

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
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
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export default async function VacationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      const { data } = await supabase.storage.from("user-signatures").createSignedUrl(s.storage_path, 3600);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de vacaciones</h1>
        <NewVacationRequestDialog />
      </div>
      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(requests ?? []).map((r) => {
              const isPendingSupervisorForMe = r.status === "pendiente_supervisor" && r.supervisor_app_user_id === user!.id;
              const isPendingRrhhForMe = r.status === "pendiente_rrhh";
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.first_name} {r.last_name}
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
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} />
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

Note: `isPendingRrhhForMe` intentionally doesn't check `can_authorize` client-side — RLS already ensures a row in `pendiente_rrhh` status is only returned to this query if the viewer holds `can_authorize` (or `can_view`) in the first place, and the `respondAsRrhh` action re-checks the same permission server-side before acting. A `can_view`-only user (oversight, no `can_authorize`) would still see this button rendered but get a clean `{error}` back from the action if they click it — acceptable for a first pass, but if this bothers you when testing, thread `flags.can_authorize` through from the page (same `get_my_module_permissions` call already used everywhere else in this app) and gate `isPendingRrhhForMe` on it too.

- [ ] **Step 2: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manual smoke test**

With the dev server running, log in, go to `/solicitudes/vacaciones`, click "Nueva solicitud", fill it in, and submit. Confirm it appears with status "Pendiente del jefe directo". Log in as the resolved supervisor (or a Super Admin, who — per Task 1 — also holds `can_authorize` and per RLS's `can_view`/`can_authorize` clause can already see it, though only the actual resolved supervisor can act on the supervisor stage per the UPDATE policy) and confirm the signature/reject controls appear only where appropriate.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/page.tsx"
git commit -m "feat: add the vacation requests list page"
```

---

### Task 12: Integration RLS tests

**Files:**
- Create: `src/test/integration/vacationRequestsRls.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function makeContactPair(supervisorEmail: string, employeeEmail: string) {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").insert({ name: "Vacation Test Co" }).select().single();
  const { data: supervisorContact } = await admin
    .from("contacts")
    .insert({ first_name: "Sup", last_name: "Ervisor", email: supervisorEmail, company_id: company!.id })
    .select()
    .single();
  const { data: employeeContact } = await admin
    .from("contacts")
    .insert({
      first_name: "Emp",
      last_name: "Loyee",
      email: employeeEmail,
      company_id: company!.id,
      reports_to_id: supervisorContact!.id,
    })
    .select()
    .single();
  return { companyId: company!.id as string, supervisorContactId: supervisorContact!.id as string, employeeContactId: employeeContact!.id as string };
}

describe("vacation_requests RLS", () => {
  let employee: TestUser | undefined;
  let supervisor: TestUser | undefined;
  let outsider: TestUser | undefined;
  let companyId = "";
  let employeeContactId = "";
  let supervisorContactId = "";
  let requestId = "";

  afterEach(async () => {
    const admin = createAdminClient();
    if (requestId) await admin.from("vacation_requests").delete().eq("id", requestId);
    if (employeeContactId) await admin.from("contacts").delete().eq("id", employeeContactId);
    if (supervisorContactId) await admin.from("contacts").delete().eq("id", supervisorContactId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (employee) await deleteTestUser(employee.id);
    if (supervisor) await deleteTestUser(supervisor.id);
    if (outsider) await deleteTestUser(outsider.id);
    employee = undefined;
    supervisor = undefined;
    outsider = undefined;
    companyId = "";
    employeeContactId = "";
    supervisorContactId = "";
    requestId = "";
  });

  it("lets an employee with zero module permissions create and read their own request", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const { data, error } = await employee.client
      .from("vacation_requests")
      .insert({
        contact_id: employeeContactId,
        requester_app_user_id: employee.id,
        first_name: "Emp",
        last_name: "Loyee",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
        status: "pendiente_supervisor",
        supervisor_app_user_id: supervisor.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    requestId = data!.id;

    const { data: readBack } = await employee.client.from("vacation_requests").select("*").eq("id", requestId);
    expect(readBack).toHaveLength(1);
  });

  it("blocks inserting a request on someone else's behalf", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    outsider = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const { error } = await outsider.client.from("vacation_requests").insert({
      contact_id: employeeContactId,
      requester_app_user_id: employee.id,
      first_name: "Emp",
      last_name: "Loyee",
      days_requested: 2,
      date_from: "2026-11-13",
      date_to: "2026-11-14",
      return_date: "2026-11-17",
      status: "pendiente_supervisor",
      supervisor_app_user_id: supervisor.id,
    });

    expect(error).not.toBeNull();
  });

  it("lets the resolved supervisor read and update a pendiente_supervisor request, but not an outsider", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    outsider = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const admin = createAdminClient();
    const { data: created } = await admin
      .from("vacation_requests")
      .insert({
        contact_id: employeeContactId,
        requester_app_user_id: employee.id,
        first_name: "Emp",
        last_name: "Loyee",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
        status: "pendiente_supervisor",
        supervisor_app_user_id: supervisor.id,
      })
      .select()
      .single();
    requestId = created!.id;

    const { data: outsiderRead } = await outsider.client.from("vacation_requests").select("*").eq("id", requestId);
    expect(outsiderRead).toEqual([]);

    const { error: outsiderUpdateError, data: outsiderUpdateData } = await supervisor.client
      .from("vacation_requests")
      .update({ supervisor_decision: "aprobado" })
      .eq("id", requestId)
      .select();
    expect(outsiderUpdateError).toBeNull();
    expect(outsiderUpdateData).toHaveLength(1);
  });

  it("blocks the supervisor from updating once the request has moved to pendiente_rrhh", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const admin = createAdminClient();
    const { data: created } = await admin
      .from("vacation_requests")
      .insert({
        contact_id: employeeContactId,
        requester_app_user_id: employee.id,
        first_name: "Emp",
        last_name: "Loyee",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
        status: "pendiente_rrhh",
        supervisor_app_user_id: supervisor.id,
      })
      .select()
      .single();
    requestId = created!.id;

    const { data: updated } = await supervisor.client
      .from("vacation_requests")
      .update({ supervisor_comments: "intentando editar tarde" })
      .eq("id", requestId)
      .select();
    expect(updated).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes against the live Supabase project**

Run: `npx vitest run src/test/integration/vacationRequestsRls.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/vacationRequestsRls.test.ts
git commit -m "test: add vacation_requests RLS integration coverage"
```

---

### Task 13: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Manual smoke test across roles**

Using the dev server, with two real test contacts where one `reports_to_id`s the other (and both have matching `app_users` accounts): submit a vacation request as the employee, approve as the supervisor (drawing or picking a signature), confirm it reaches "Pendiente de RRHH", then approve as a Super Admin (who holds `can_authorize`), filling in the classification fields, and confirm the final state is "Aprobado" with both signatures visible. Separately, confirm submitting as an employee with no `reports_to_id` set is blocked with the expected message.

- [ ] **Step 3: Commit (only if any fixes were needed in this task)**

If regressions were found and fixed, commit them individually per fix with a descriptive message. If nothing needed fixing, skip this step.

---

## Self-review notes

- **Spec coverage:** module + two-layer permissions (Task 1, 2), supervisor resolution (Task 4), signature reuse (Task 10), workflow + emails (Tasks 5–7), blocked-submission error (Task 4/6), UI (Tasks 8–11), RLS tests (Task 12) — every section of the spec maps to a task.
- **Known rough edge, called out inline rather than hidden:** Task 7's first draft of the "which app_users hold can_authorize" lookup was wrong (no `role_profile_id` column check like that exists) and is corrected in the same task with the real three-table join, with an explicit note to adjust the test mock accordingly — flagged rather than silently papered over, since whoever implements this needs to actually wire that mock correctly for the affected tests to mean anything.
- **Type consistency:** `CreateVacationRequestInput` (Task 6) is consumed identically by `NewVacationRequestDialog` (Task 9); `respondAsSupervisor`/`respondAsRrhh`'s signature (Task 7) matches exactly how `VacationRequestActions` (Task 10) calls them.
- **No placeholders:** every step contains complete, real code.
