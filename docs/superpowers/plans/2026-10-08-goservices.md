# GoServices Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GoServices request/ticketing module (Mantenimiento + Mensajería) inside Gente Sánchez Business, with creation, "mis solicitudes", "mis tareas asignadas", and a supervisor/líder dashboard, email status notifications, and SharePoint-backed attachments.

**Architecture:** One Postgres table (`goservices_requests`) discriminated by `request_type`, gated by the existing `modules`/`role_profile_permissions` system (new `goservices` module, `can_view` = full oversight) plus two assignment-based views that need no permission at all (requester sees their own rows, assignee sees rows assigned to them). Attachments upload to a SharePoint site via Microsoft Graph app-only auth; only the resulting URL is stored. Status-change emails reuse the existing nodemailer + `email_settings` path.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), nodemailer, Microsoft Graph REST API, Bun (this machine has no `node.exe` — always use `bun run <script>` / `bunx tsc --noEmit`, never `npm`/`npx`).

**Spec:** `docs/superpowers/specs/2026-10-08-goservices-design.md` — read it before starting; it has the full category/subcategory taxonomy and the approved field list.

**Standing rule — do not violate in any task:** never run the full `bun run test` suite (confirmed earlier this session to pollute the shared production Supabase project with orphaned test data). Every test step below runs one file only, e.g. `bun test src/test/integration/goservicesRequests.test.ts`.

---

### Task 1: Migration — `goservices` module + `goservices_requests` table + RLS

**Files:**
- Create: `supabase/migrations/20261008120000_goservices_module.sql`
- Create: `supabase/migrations/20261008120100_goservices_requests_table.sql`

- [ ] **Step 1: Write the module-registration migration**

```sql
-- supabase/migrations/20261008120000_goservices_module.sql
insert into public.modules (key, label) values ('goservices', 'GoServices');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, (rp.name = 'Super Admin'), false, false, false, false, false, false
from public.role_profiles rp
cross join public.modules m
where m.key = 'goservices';
```

This follows the exact same shape as `supabase/migrations/20260801160000_solicitudes_vacaciones_module.sql` — only Super Admin gets `can_view` by default; an admin grants it to other role profiles later from the existing Perfiles de Rol screen (no new UI needed for that part).

- [ ] **Step 2: Write the table + RLS migration**

```sql
-- supabase/migrations/20261008120100_goservices_requests_table.sql
create table public.goservices_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  request_type text not null check (request_type in ('mantenimiento', 'mensajeria')),

  requester_app_user_id uuid not null references public.app_users (id),
  requester_contact_id uuid references public.contacts (id),
  requester_name text not null,

  ubicacion text check (ubicacion in ('oficina', 'alojamiento')),
  categoria text check (categoria in ('cerrajeria', 'mobiliario', 'instalaciones_electricas', 'plomeria', 'infraestructura')),
  subcategoria text,

  tipo_mensajeria text check (tipo_mensajeria in ('envio', 'retiro', 'compras', 'traslados')),
  contacto_nombre text,
  contacto_telefono text,
  contacto_direccion text,

  detalle text not null,
  foto_url text,
  documento_url text,

  status text not null default 'recibido' check (status in ('recibido', 'en_proceso', 'completado', 'cancelado')),
  assigned_app_user_id uuid references public.app_users (id),

  check (
    (request_type = 'mantenimiento' and ubicacion is not null and categoria is not null and tipo_mensajeria is null)
    or
    (request_type = 'mensajeria' and tipo_mensajeria is not null and ubicacion is null and categoria is null)
  )
);

create index goservices_requests_requester_idx on public.goservices_requests (requester_app_user_id);
create index goservices_requests_assigned_idx on public.goservices_requests (assigned_app_user_id);

alter table public.goservices_requests enable row level security;

-- Reusable check: does the caller have can_view on the goservices module?
-- Inlined (not a separate function) to match this codebase's existing
-- per-policy style (see contacts_self_edit.sql / schedule_templates.sql),
-- but factored into one function here because it's needed by three
-- separate policies below and keeping it in one place avoids drift.
create or replace function public.can_view_goservices()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users au
    join public.role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
    join public.modules m on m.id = rpp.module_id
    where au.id = auth.uid() and m.key = 'goservices' and rpp.can_view
  );
$$;

create policy "goservices_requests_select" on public.goservices_requests
  for select
  using (
    requester_app_user_id = auth.uid()
    or assigned_app_user_id = auth.uid()
    or public.can_view_goservices()
  );

create policy "goservices_requests_insert" on public.goservices_requests
  for insert
  with check (requester_app_user_id = auth.uid());

create policy "goservices_requests_update" on public.goservices_requests
  for update
  using (assigned_app_user_id = auth.uid() or public.can_view_goservices())
  with check (assigned_app_user_id = auth.uid() or public.can_view_goservices());
```

- [ ] **Step 3: STOP — apply both migrations in Supabase**

Paste both files, in order, into the Supabase SQL Editor for the project and run them. **Do not proceed to Task 2 until the human confirms both migrations ran successfully.** (This matches the Task 1 STOP convention from the earlier role-profile-delete plan this session — there is no automated migration-push step in this workflow.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261008120000_goservices_module.sql supabase/migrations/20261008120100_goservices_requests_table.sql
git commit -m "feat: add goservices module and goservices_requests table with RLS"
```

---

### Task 2: RLS integration tests

**Files:**
- Create: `src/test/integration/goservicesRequests.test.ts`

Read `src/test/integration/roleProfiles.test.ts` first for this codebase's exact integration-test setup conventions (how it creates throwaway `app_users`/`role_profiles` rows, signs in as them, and cleans up in `afterAll`) and mirror that shape exactly — don't invent a different setup pattern.

- [ ] **Step 1: Write the test file**

```typescript
// src/test/integration/goservicesRequests.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

const admin = createAdminClient();

async function signInAs(email: string, password: string) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describe("goservices_requests RLS", () => {
  let requesterUserId: string;
  let requesterEmail: string;
  let assigneeUserId: string;
  let assigneeEmail: string;
  let viewerUserId: string;
  let viewerEmail: string;
  let outsiderUserId: string;
  let outsiderEmail: string;
  let requestId: string;
  const password = "Test-Password-123!";

  beforeAll(async () => {
    const { data: basicProfile } = await admin.from("role_profiles").select("id").eq("name", "Viewer").maybeSingle();
    const { data: superAdminProfile } = await admin.from("role_profiles").select("id").eq("name", "Super Admin").single();

    requesterEmail = `test-gs-requester-${crypto.randomUUID()}@example.com`;
    assigneeEmail = `test-gs-assignee-${crypto.randomUUID()}@example.com`;
    viewerEmail = `test-gs-viewer-${crypto.randomUUID()}@example.com`;
    outsiderEmail = `test-gs-outsider-${crypto.randomUUID()}@example.com`;

    const { data: requesterAuth } = await admin.auth.admin.createUser({ email: requesterEmail, password, email_confirm: true });
    const { data: assigneeAuth } = await admin.auth.admin.createUser({ email: assigneeEmail, password, email_confirm: true });
    const { data: viewerAuth } = await admin.auth.admin.createUser({ email: viewerEmail, password, email_confirm: true });
    const { data: outsiderAuth } = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
    requesterUserId = requesterAuth.user!.id;
    assigneeUserId = assigneeAuth.user!.id;
    viewerUserId = viewerAuth.user!.id;
    outsiderUserId = outsiderAuth.user!.id;

    await admin.from("app_users").insert([
      { id: requesterUserId, email: requesterEmail, role_profile_id: basicProfile!.id, status: "active" },
      { id: assigneeUserId, email: assigneeEmail, role_profile_id: basicProfile!.id, status: "active" },
      { id: viewerUserId, email: viewerEmail, role_profile_id: superAdminProfile!.id, status: "active" },
      { id: outsiderUserId, email: outsiderEmail, role_profile_id: basicProfile!.id, status: "active" },
    ]);
  });

  afterAll(async () => {
    await admin.from("goservices_requests").delete().eq("requester_app_user_id", requesterUserId);
    await admin.from("app_users").delete().in("id", [requesterUserId, assigneeUserId, viewerUserId, outsiderUserId]);
    await admin.auth.admin.deleteUser(requesterUserId);
    await admin.auth.admin.deleteUser(assigneeUserId);
    await admin.auth.admin.deleteUser(viewerUserId);
    await admin.auth.admin.deleteUser(outsiderUserId);
  });

  test("requester can insert their own request", async () => {
    const client = await signInAs(requesterEmail, password);
    const { data, error } = await client
      .from("goservices_requests")
      .insert({
        request_type: "mantenimiento",
        requester_app_user_id: requesterUserId,
        requester_name: "Test Requester",
        ubicacion: "oficina",
        categoria: "cerrajeria",
        detalle: "Puerta no cierra",
        status: "recibido",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    requestId = data!.id;
  });

  test("requester cannot insert a request for someone else", async () => {
    const client = await signInAs(requesterEmail, password);
    const { error } = await client.from("goservices_requests").insert({
      request_type: "mantenimiento",
      requester_app_user_id: outsiderUserId,
      requester_name: "Test Requester",
      ubicacion: "oficina",
      categoria: "cerrajeria",
      detalle: "Puerta no cierra",
      status: "recibido",
    });
    expect(error).not.toBeNull();
  });

  test("outsider sees no rows", async () => {
    const client = await signInAs(outsiderEmail, password);
    const { data } = await client.from("goservices_requests").select("id").eq("id", requestId);
    expect(data).toEqual([]);
  });

  test("requester sees their own row but cannot update its status", async () => {
    const client = await signInAs(requesterEmail, password);
    const { data } = await client.from("goservices_requests").select("id").eq("id", requestId);
    expect(data?.length).toBe(1);

    const { data: updated } = await client.from("goservices_requests").update({ status: "completado" }).eq("id", requestId).select();
    expect(updated).toEqual([]);
  });

  test("can_view_goservices user (Super Admin) sees and can update the row", async () => {
    const client = await signInAs(viewerEmail, password);
    const { data } = await client.from("goservices_requests").select("id").eq("id", requestId);
    expect(data?.length).toBe(1);

    const { data: updated, error } = await client
      .from("goservices_requests")
      .update({ assigned_app_user_id: assigneeUserId })
      .eq("id", requestId)
      .select();
    expect(error).toBeNull();
    expect(updated?.length).toBe(1);
  });

  test("assignee sees the row once assigned and can update its status", async () => {
    const client = await signInAs(assigneeEmail, password);
    const { data } = await client.from("goservices_requests").select("id").eq("id", requestId);
    expect(data?.length).toBe(1);

    const { data: updated, error } = await client.from("goservices_requests").update({ status: "en_proceso" }).eq("id", requestId).select();
    expect(error).toBeNull();
    expect(updated?.length).toBe(1);
  });

  test("check constraint rejects a mantenimiento row with tipo_mensajeria set", async () => {
    const client = await signInAs(requesterEmail, password);
    const { error } = await client.from("goservices_requests").insert({
      request_type: "mantenimiento",
      requester_app_user_id: requesterUserId,
      requester_name: "Test Requester",
      ubicacion: "oficina",
      categoria: "cerrajeria",
      tipo_mensajeria: "envio",
      detalle: "Inválido",
      status: "recibido",
    });
    expect(error).not.toBeNull();
  });
});
```

Confirm the exact `role_profiles` name used for a no-permissions profile in this codebase (`roleProfiles.test.ts` will show it — it may not literally be called "Viewer") and adjust the lookup before running.

- [ ] **Step 2: Run the test**

Run: `bun test src/test/integration/goservicesRequests.test.ts`
Expected: all tests PASS (never run the full `bun run test` suite).

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/goservicesRequests.test.ts
git commit -m "test: add RLS integration tests for goservices_requests"
```

---

### Task 3: SharePoint upload helper

**Files:**
- Create: `src/lib/sharepoint.ts`
- Test: `src/lib/sharepoint.test.ts`

- [ ] **Step 1: Write the failing test (mocked `fetch`, no real Graph call)**

```typescript
// src/lib/sharepoint.test.ts
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { uploadToSharePoint } from "./sharepoint";

const ORIGINAL_ENV = { ...process.env };

describe("uploadToSharePoint", () => {
  beforeEach(() => {
    process.env.ONEDRIVE_CLIENT_ID = "test-client-id";
    process.env.ONEDRIVE_CLIENT_SECRET = "test-secret";
    process.env.ONEDRIVE_TENANT_ID = "test-tenant-id";
    process.env.SHAREPOINT_SITE_URL = "https://fciudaddelsol.sharepoint.com/sites/GoServices";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    mock.restore();
  });

  test("acquires a token, resolves the site, uploads the file, and returns the web URL", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      const href = url.toString();
      calls.push(href);
      if (href.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
      }
      if (href.includes("/v1.0/sites/fciudaddelsol.sharepoint.com:/sites/GoServices")) {
        return new Response(JSON.stringify({ id: "fake-site-id" }), { status: 200 });
      }
      if (href.includes("/v1.0/sites/fake-site-id/drive/root:/")) {
        expect(init?.method).toBe("PUT");
        return new Response(JSON.stringify({ webUrl: "https://fciudaddelsol.sharepoint.com/sites/GoServices/file.jpg" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as unknown as typeof fetch;

    const url = await uploadToSharePoint(new Uint8Array([1, 2, 3]).buffer, "file.jpg", "image/jpeg");

    expect(url).toBe("https://fciudaddelsol.sharepoint.com/sites/GoServices/file.jpg");
    expect(calls.some((c) => c.includes("/oauth2/v2.0/token"))).toBe(true);
    expect(calls.some((c) => c.includes("/v1.0/sites/fciudaddelsol.sharepoint.com:/sites/GoServices"))).toBe(true);
  });

  test("throws when the token request fails", async () => {
    globalThis.fetch = mock(async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch;
    await expect(uploadToSharePoint(new Uint8Array([1]).buffer, "file.jpg", "image/jpeg")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/sharepoint.test.ts`
Expected: FAIL with "Cannot find module './sharepoint'" (file doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/sharepoint.ts`**

```typescript
// src/lib/sharepoint.ts
import "server-only";

interface GraphTokenResponse {
  access_token: string;
}

interface GraphSiteResponse {
  id: string;
}

interface GraphUploadResponse {
  webUrl: string;
}

function parseSiteUrl(siteUrl: string): { hostname: string; serverRelativePath: string } {
  const parsed = new URL(siteUrl);
  return { hostname: parsed.hostname, serverRelativePath: parsed.pathname };
}

async function getGraphAccessToken(): Promise<string> {
  const tenantId = process.env.ONEDRIVE_TENANT_ID;
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Faltan las variables de entorno de SharePoint/OneDrive");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`No se pudo obtener el token de Microsoft Graph: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphTokenResponse;
  return data.access_token;
}

async function getSiteId(accessToken: string): Promise<string> {
  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  if (!siteUrl) throw new Error("Falta SHAREPOINT_SITE_URL");
  const { hostname, serverRelativePath } = parseSiteUrl(siteUrl);

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${hostname}:${serverRelativePath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`No se pudo resolver el sitio de SharePoint: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphSiteResponse;
  return data.id;
}

/**
 * Uploads a file to the GoServices SharePoint site's default drive and
 * returns its webUrl. Small-file simple upload (PUT .../content) — fine for
 * the maintenance/mensajería photos and documents this is used for; large
 * files would need Graph's resumable upload session instead, which this
 * doesn't implement.
 */
export async function uploadToSharePoint(
  bytes: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const accessToken = await getGraphAccessToken();
  const siteId = await getSiteId(accessToken);

  const path = `goservices/${crypto.randomUUID()}-${filename}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${path}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    throw new Error(`No se pudo subir el archivo a SharePoint: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphUploadResponse;
  return data.webUrl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/sharepoint.test.ts`
Expected: PASS (2/2 tests)

- [ ] **Step 5: STOP — add the real SharePoint credentials**

Ask the human to paste these into `.env.local` (and later into Vercel env vars for Production/Preview) — **do not print the client secret value anywhere in chat or logs**, just confirm it's been added:

```
ONEDRIVE_CLIENT_ID=70841144-af07-4e0f-a996-156a6701b4e4
ONEDRIVE_TENANT_ID=f3a1c3dd-27a6-465e-b01b-b211c4839a37
ONEDRIVE_CLIENT_SECRET=<the human pastes this directly, never echoed back>
SHAREPOINT_SITE_URL=https://fciudaddelsol.sharepoint.com/sites/GoServices
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sharepoint.ts src/lib/sharepoint.test.ts
git commit -m "feat: add SharePoint upload helper for goservices attachments"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/app/(app)/solicitudes/goservices/actions.ts`

Read `src/app/(app)/quejas/nueva/actions.ts` and `src/app/(app)/solicitudes/vacaciones/actions.ts` in full before writing this — the shapes below mirror them directly (`"use server"`, `ActionResult { error?: string }`, `createClient()` for the session-scoped checks, `createAdminClient()` only where RLS would otherwise block a legitimate cross-user read).

- [ ] **Step 1: Write `actions.ts`**

```typescript
// src/app/(app)/solicitudes/goservices/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToSharePoint } from "@/lib/sharepoint";
import { sendGoservicesStatusEmail } from "@/lib/sendGoservicesStatusEmail";
import { getSiteUrl } from "@/lib/siteUrl";

interface ActionResult {
  error?: string;
}

export interface CreateGoservicesRequestInput {
  requestType: "mantenimiento" | "mensajeria";
  ubicacion?: "oficina" | "alojamiento";
  categoria?: "cerrajeria" | "mobiliario" | "instalaciones_electricas" | "plomeria" | "infraestructura";
  subcategoria?: string;
  tipoMensajeria?: "envio" | "retiro" | "compras" | "traslados";
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoDireccion?: string;
  detalle: string;
  foto?: File | null;
  documento?: File | null;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function uploadAttachment(file: File, allowedTypes: Record<string, string> | null): Promise<{ url?: string; error?: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "El archivo no puede pesar más de 10 MB" };
  if (allowedTypes && !allowedTypes[file.type]) return { error: "El archivo debe ser JPG, PNG o WEBP" };
  const bytes = await file.arrayBuffer();
  try {
    const url = await uploadToSharePoint(bytes, file.name, file.type || "application/octet-stream");
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir el archivo" };
  }
}

export async function createGoservicesRequest(input: CreateGoservicesRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };

  if (!input.detalle.trim()) return { error: "El detalle no puede estar vacío" };

  if (input.requestType === "mantenimiento") {
    if (!input.ubicacion) return { error: "Selecciona una ubicación" };
    if (!input.categoria) return { error: "Selecciona un tipo de solicitud" };
  } else {
    if (!input.tipoMensajeria) return { error: "Selecciona un tipo de solicitud" };
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("email", user.email)
    .maybeSingle();

  let fotoUrl: string | null = null;
  if (input.foto && input.foto.size > 0) {
    const result = await uploadAttachment(input.foto, ALLOWED_PHOTO_TYPES);
    if (result.error) return { error: result.error };
    fotoUrl = result.url ?? null;
  }

  let documentoUrl: string | null = null;
  if (input.documento && input.documento.size > 0) {
    const result = await uploadAttachment(input.documento, null);
    if (result.error) return { error: result.error };
    documentoUrl = result.url ?? null;
  }

  const { error } = await supabase.from("goservices_requests").insert({
    request_type: input.requestType,
    requester_app_user_id: user.id,
    requester_contact_id: contact?.id ?? null,
    requester_name: contact ? `${contact.first_name} ${contact.last_name}` : user.email,
    ubicacion: input.requestType === "mantenimiento" ? input.ubicacion : null,
    categoria: input.requestType === "mantenimiento" ? input.categoria : null,
    subcategoria: input.requestType === "mantenimiento" ? (input.subcategoria ?? null) : null,
    tipo_mensajeria: input.requestType === "mensajeria" ? input.tipoMensajeria : null,
    contacto_nombre: input.requestType === "mensajeria" ? (input.contactoNombre ?? null) : null,
    contacto_telefono: input.requestType === "mensajeria" ? (input.contactoTelefono ?? null) : null,
    contacto_direccion: input.requestType === "mensajeria" ? (input.contactoDireccion ?? null) : null,
    detalle: input.detalle,
    foto_url: fotoUrl,
    documento_url: documentoUrl,
    status: "recibido",
  });
  if (error) return { error: error.message };

  revalidatePath("/solicitudes/goservices");
  return {};
}

export interface GoservicesRequestRow {
  id: string;
  createdAtLabel: string;
  requestType: "mantenimiento" | "mensajeria";
  typeLabel: string;
  requesterName: string;
  detalle: string;
  status: string;
  statusLabel: string;
  assignedAppUserId: string | null;
}

const CATEGORIA_LABELS: Record<string, string> = {
  cerrajeria: "Cerrajería",
  mobiliario: "Mobiliario",
  instalaciones_electricas: "Instalaciones eléctricas",
  plomeria: "Plomería",
  infraestructura: "Infraestructura",
};

const TIPO_MENSAJERIA_LABELS: Record<string, string> = {
  envio: "Envío",
  retiro: "Retiro",
  compras: "Compras",
  traslados: "Traslados",
};

export const STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  completado: "Completado",
  cancelado: "Cancelado",
};

function typeLabel(row: { request_type: string; categoria: string | null; tipo_mensajeria: string | null }): string {
  if (row.request_type === "mantenimiento") return CATEGORIA_LABELS[row.categoria ?? ""] ?? "Mantenimiento";
  return TIPO_MENSAJERIA_LABELS[row.tipo_mensajeria ?? ""] ?? "Mensajería";
}

function toRow(r: {
  id: string;
  created_at: string;
  request_type: "mantenimiento" | "mensajeria";
  categoria: string | null;
  tipo_mensajeria: string | null;
  requester_name: string;
  detalle: string;
  status: string;
  assigned_app_user_id: string | null;
}): GoservicesRequestRow {
  return {
    id: r.id,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "numeric" }),
    requestType: r.request_type,
    typeLabel: typeLabel(r),
    requesterName: r.requester_name,
    detalle: r.detalle,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    assignedAppUserId: r.assigned_app_user_id,
  };
}

export async function listMyGoservicesRequests(): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("goservices_requests")
    .select("id, created_at, request_type, categoria, tipo_mensajeria, requester_name, detalle, status, assigned_app_user_id")
    .eq("requester_app_user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map(toRow);
}

export async function listAssignedGoservicesRequests(): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("goservices_requests")
    .select("id, created_at, request_type, categoria, tipo_mensajeria, requester_name, detalle, status, assigned_app_user_id")
    .eq("assigned_app_user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map(toRow);
}

export async function listAllGoservicesRequests(filters: { type?: string; status?: string }): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("goservices_requests")
    .select("id, created_at, request_type, categoria, tipo_mensajeria, requester_name, detalle, status, assigned_app_user_id")
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("request_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);

  const { data } = await query;
  return (data ?? []).map(toRow);
}

export async function listAssignableUsers(): Promise<{ id: string; email: string }[]> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view) return [];

  const admin = createAdminClient();
  const { data } = await admin.from("app_users").select("id, email").eq("status", "active").order("email");
  return data ?? [];
}

export async function updateGoservicesRequestStatus(requestId: string, status: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: existing, error: fetchError } = await supabase
    .from("goservices_requests")
    .select("id, requester_app_user_id, request_type, categoria, tipo_mensajeria")
    .eq("id", requestId)
    .single();
  if (fetchError || !existing) return { error: "Solicitud no encontrada" };

  const { data: updated, error } = await supabase
    .from("goservices_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select();
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  if (status === "recibido" || status === "completado" || status === "cancelado") {
    try {
      const admin = createAdminClient();
      const { data: requester } = await admin
        .from("app_users")
        .select("email")
        .eq("id", existing.requester_app_user_id)
        .maybeSingle();
      if (requester?.email) {
        await sendGoservicesStatusEmail({
          requesterEmail: requester.email,
          typeLabel: typeLabel(existing),
          status,
          requestUrl: `${await getSiteUrl()}/solicitudes/goservices`,
        });
      }
    } catch (err) {
      console.error("Failed to send goservices status email:", err);
    }
  }

  revalidatePath("/solicitudes/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  revalidatePath("/goservices");
  return {};
}

export async function assignGoservicesRequest(requestId: string, assignedAppUserId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view) return { error: "No autorizado" };

  const { error } = await supabase
    .from("goservices_requests")
    .update({ assigned_app_user_id: assignedAppUserId, updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: error.message };

  revalidatePath("/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  return {};
}
```

- [ ] **Step 2: Run a quick type check**

Run: `bunx tsc --noEmit`
Expected: no new errors from this file (it will still fail if `sendGoservicesStatusEmail` doesn't exist yet — that's expected until Task 5; if this task is implemented before Task 5, create a temporary stub `src/lib/sendGoservicesStatusEmail.ts` exporting an async no-op `sendGoservicesStatusEmail` so this file type-checks, and let Task 5 replace it).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/solicitudes/goservices/actions.ts
git commit -m "feat: add goservices server actions"
```

---

### Task 5: Status-change email notification

**Files:**
- Create: `src/lib/sendGoservicesStatusEmail.ts`
- Test: `src/lib/sendGoservicesStatusEmail.test.ts`

Read `src/lib/sendComplaintNotificationEmail.ts` in full first — copy its `getEmailSettings`/`resolveConnectHost`/`buildTransport`/`fromAddress`/`fetchPlatformLogoUrl` helpers verbatim (don't reinvent the SMTP transport logic).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/sendGoservicesStatusEmail.test.ts
import { describe, test, expect, mock } from "bun:test";

mock.module("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === "email_settings"
              ? {
                  data: {
                    smtp_host: "smtp.office365.com",
                    smtp_port: 587,
                    smtp_user: "automatizaciones@sanchezbusinesscorp.com",
                    smtp_pass: "fake-pass",
                    smtp_sender_name: "Gente Sánchez Business",
                    smtp_admin_email: "automatizaciones@sanchezbusinesscorp.com",
                  },
                  error: null,
                }
              : { data: null, error: null },
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

const sentMail: Record<string, unknown>[] = [];
mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (opts: Record<string, unknown>) => {
        sentMail.push(opts);
        return {};
      },
    }),
  },
}));

const { sendGoservicesStatusEmail } = await import("./sendGoservicesStatusEmail");

describe("sendGoservicesStatusEmail", () => {
  test("sends one email with the status and type in the subject", async () => {
    await sendGoservicesStatusEmail({
      requesterEmail: "empleado@sanchezbusinesscorp.com",
      typeLabel: "Cerrajería",
      status: "completado",
      requestUrl: "https://gente-business.vercel.app/solicitudes/goservices",
    });
    expect(sentMail.length).toBe(1);
    expect(sentMail[0].to).toBe("empleado@sanchezbusinesscorp.com");
    expect(String(sentMail[0].subject)).toContain("Completado");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/sendGoservicesStatusEmail.test.ts`
Expected: FAIL with "Cannot find module './sendGoservicesStatusEmail'"

- [ ] **Step 3: Implement `src/lib/sendGoservicesStatusEmail.ts`**

```typescript
// src/lib/sendGoservicesStatusEmail.ts
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

const STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  completado: "Completado",
  cancelado: "Cancelado",
};

export async function sendGoservicesStatusEmail(input: {
  requesterEmail: string;
  typeLabel: string;
  status: string;
  requestUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const statusLabel = STATUS_LABELS[input.status] ?? input.status;

  const html = buildBrandedEmailHtml({
    title: `Tu solicitud de GoServices: ${statusLabel}`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>Tipo:</strong> ${input.typeLabel}</p>
      <p style="margin:0;"><strong>Estatus:</strong> ${statusLabel}</p>
    `,
    ctaText: "Ver mis solicitudes",
    ctaUrl: input.requestUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });

  await transport.sendMail({
    from: fromAddress(settings),
    to: input.requesterEmail,
    subject: `Tu solicitud de GoServices: ${statusLabel}`,
    text: `Tu solicitud de GoServices (${input.typeLabel}) cambió de estatus a: ${statusLabel}\n\nVer: ${input.requestUrl}`,
    html,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/sendGoservicesStatusEmail.test.ts`
Expected: PASS

- [ ] **Step 5: Remove the temporary stub (if Task 4 added one) and re-check types**

Run: `bunx tsc --noEmit`
Expected: no errors related to `sendGoservicesStatusEmail`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sendGoservicesStatusEmail.ts src/lib/sendGoservicesStatusEmail.test.ts
git commit -m "feat: add goservices status-change email notification"
```

---

### Task 6: "Nueva solicitud" + "Mis solicitudes" page

**Files:**
- Create: `src/app/(app)/solicitudes/goservices/page.tsx`
- Create: `src/app/(app)/solicitudes/goservices/NewGoservicesRequestDialog.tsx`

This follows the `solicitudes/vacaciones/page.tsx` + `NewVacationRequestDialog` shape (one page, dialog-triggered creation, table of the user's own rows below it) rather than a separate `/nueva` route — this codebase has no precedent for Nueva and Mis-X living on separate routes when the "mis" list is just the current user's own rows.

- [ ] **Step 1: Write `NewGoservicesRequestDialog.tsx`**

```tsx
// src/app/(app)/solicitudes/goservices/NewGoservicesRequestDialog.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import { createGoservicesRequest, type CreateGoservicesRequestInput } from "./actions";

const CATEGORIAS = [
  { value: "cerrajeria", label: "Cerrajería", subcategorias: [] as string[] },
  { value: "mobiliario", label: "Mobiliario", subcategorias: ["Compra", "Cambio", "Reparación", "Instalación"] },
  {
    value: "instalaciones_electricas",
    label: "Instalaciones eléctricas",
    subcategorias: ["Cambio de iluminaria", "Revisión de tomacorriente", "Revisión de electrodoméstico"],
  },
  { value: "plomeria", label: "Plomería", subcategorias: ["Reparación", "Cambio", "Fugas"] },
  {
    value: "infraestructura",
    label: "Infraestructura",
    subcategorias: ["Pintura", "Filtraciones", "Pisos", "Reparación de paredes"],
  },
];

const TIPOS_MENSAJERIA = [
  { value: "envio", label: "Envío" },
  { value: "retiro", label: "Retiro" },
  { value: "compras", label: "Compras" },
  { value: "traslados", label: "Traslados" },
];

export function NewGoservicesRequestDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<"mantenimiento" | "mensajeria">("mantenimiento");
  const [ubicacion, setUbicacion] = useState<"oficina" | "alojamiento" | "">("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [tipoMensajeria, setTipoMensajeria] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoDireccion, setContactoDireccion] = useState("");
  const [detalle, setDetalle] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [documento, setDocumento] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCategoria = CATEGORIAS.find((c) => c.value === categoria);

  function resetForm() {
    setRequestType("mantenimiento");
    setUbicacion("");
    setCategoria("");
    setSubcategoria("");
    setTipoMensajeria("");
    setContactoNombre("");
    setContactoTelefono("");
    setContactoDireccion("");
    setDetalle("");
    setFoto(null);
    setDocumento(null);
    setError(null);
  }

  function submit() {
    if (!detalle.trim()) {
      setError("Escribe el detalle de la solicitud.");
      return;
    }
    if (requestType === "mantenimiento" && (!ubicacion || !categoria)) {
      setError("Selecciona ubicación y tipo de solicitud.");
      return;
    }
    if (requestType === "mensajeria" && !tipoMensajeria) {
      setError("Selecciona el tipo de solicitud.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createGoservicesRequest({
        requestType,
        ubicacion: ubicacion || undefined,
        categoria: (categoria || undefined) as CreateGoservicesRequestInput["categoria"],
        subcategoria: subcategoria || undefined,
        tipoMensajeria: (tipoMensajeria || undefined) as CreateGoservicesRequestInput["tipoMensajeria"],
        contactoNombre: contactoNombre || undefined,
        contactoTelefono: contactoTelefono || undefined,
        contactoDireccion: contactoDireccion || undefined,
        detalle,
        foto,
        documento,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
      <DialogTrigger render={<Button size="lg">Nueva solicitud</Button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva solicitud GoServices</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            <Label>Tipo</Label>
            <div className="inline-flex rounded-lg border p-1">
              {([
                { value: "mantenimiento", label: "Mantenimiento" },
                { value: "mensajeria", label: "Mensajería" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRequestType(option.value)}
                  className={`rounded-md px-4 py-2 text-base ${
                    requestType === option.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {requestType === "mantenimiento" ? (
            <>
              <div className="space-y-1">
                <Label>Ubicación</Label>
                <Select value={ubicacion} onValueChange={(v) => v && setUbicacion(v as "oficina" | "alojamiento")}>
                  <SelectTrigger className="w-full"><SelectValue>{(v: string) => v === "oficina" ? "Oficina" : v === "alojamiento" ? "Alojamiento" : "Selecciona..."}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oficina">Oficina</SelectItem>
                    <SelectItem value="alojamiento">Alojamiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de solicitud</Label>
                <Select value={categoria} onValueChange={(v) => { if (v) { setCategoria(v); setSubcategoria(""); } }}>
                  <SelectTrigger className="w-full"><SelectValue>{(v: string) => CATEGORIAS.find((c) => c.value === v)?.label ?? "Selecciona..."}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedCategoria && selectedCategoria.subcategorias.length > 0 && (
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select value={subcategoria} onValueChange={(v) => v && setSubcategoria(v)}>
                    <SelectTrigger className="w-full"><SelectValue>{(v: string) => v || "Selecciona..."}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {selectedCategoria.subcategorias.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Tipo de solicitud</Label>
                <Select value={tipoMensajeria} onValueChange={(v) => v && setTipoMensajeria(v)}>
                  <SelectTrigger className="w-full"><SelectValue>{(v: string) => TIPOS_MENSAJERIA.find((t) => t.value === v)?.label ?? "Selecciona..."}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {TIPOS_MENSAJERIA.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nombre del contacto</Label>
                <Input value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input value={contactoDireccion} onChange={(e) => setContactoDireccion(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Detalle de la solicitud</Label>
            <textarea
              className="w-full rounded-md border p-2 text-base"
              rows={5}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Describe la solicitud..."
            />
          </div>

          <div className="space-y-1">
            <Label>Foto (opcional)</Label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label>Documento (opcional)</Label>
            <input
              type="file"
              onChange={(e) => setDocumento(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          <Button size="lg" onClick={submit} disabled={isPending}>
            Enviar solicitud
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
// src/app/(app)/solicitudes/goservices/page.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewGoservicesRequestDialog } from "./NewGoservicesRequestDialog";
import { listMyGoservicesRequests } from "./actions";

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completado") return "default";
  if (status === "cancelado") return "secondary";
  return "outline";
}

export default async function GoservicesRequestsPage() {
  const requests = await listMyGoservicesRequests();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis solicitudes GoServices</h1>
        <NewGoservicesRequestDialog />
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No has creado solicitudes todavía.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estatus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.createdAtLabel}</TableCell>
                <TableCell>{r.typeLabel}</TableCell>
                <TableCell className="max-w-xs truncate">{r.detalle}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{r.statusLabel}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/solicitudes/goservices/page.tsx src/app/\(app\)/solicitudes/goservices/NewGoservicesRequestDialog.tsx
git commit -m "feat: add goservices nueva solicitud + mis solicitudes page"
```

---

### Task 7: "Mis tareas asignadas" page

**Files:**
- Create: `src/app/(app)/solicitudes/goservices/asignadas/page.tsx`
- Create: `src/app/(app)/solicitudes/goservices/asignadas/AssignedRequestStatusSelect.tsx`

- [ ] **Step 1: Write `AssignedRequestStatusSelect.tsx`**

```tsx
// src/app/(app)/solicitudes/goservices/asignadas/AssignedRequestStatusSelect.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateGoservicesRequestStatus, STATUS_LABELS } from "../actions";

export function AssignedRequestStatusSelect({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    startTransition(async () => {
      await updateGoservicesRequestStatus(requestId, next);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={(v) => v && onChange(v)} disabled={isPending}>
      <SelectTrigger className="w-40"><SelectValue>{(v: string) => STATUS_LABELS[v] ?? v}</SelectValue></SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
// src/app/(app)/solicitudes/goservices/asignadas/page.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAssignedGoservicesRequests } from "../actions";
import { AssignedRequestStatusSelect } from "./AssignedRequestStatusSelect";

export default async function GoservicesAssignedPage() {
  const requests = await listAssignedGoservicesRequests();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Mis tareas asignadas</h1>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes tareas asignadas por el momento.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estatus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.createdAtLabel}</TableCell>
                <TableCell>{r.typeLabel}</TableCell>
                <TableCell>{r.requesterName}</TableCell>
                <TableCell className="max-w-xs truncate">{r.detalle}</TableCell>
                <TableCell>
                  <AssignedRequestStatusSelect requestId={r.id} status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/solicitudes/goservices/asignadas/
git commit -m "feat: add goservices mis tareas asignadas page"
```

---

### Task 8: Supervisor/Líder dashboard

**Files:**
- Create: `src/app/(app)/goservices/page.tsx`
- Create: `src/app/(app)/goservices/GoservicesFilterBar.tsx`
- Create: `src/app/(app)/goservices/AssignRequestSelect.tsx`

- [ ] **Step 1: Write `GoservicesFilterBar.tsx`** (URL-param driven, mirrors `PonchadorDepartmentFilter.tsx`)

```tsx
// src/app/(app)/goservices/GoservicesFilterBar.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS } from "../solicitudes/goservices/actions";

const ALL = "__all__";

const TYPE_LABELS: Record<string, string> = {
  mantenimiento: "Mantenimiento",
  mensajeria: "Mensajería",
};

export function GoservicesFilterBar({ type, status }: { type: string | null; status: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    router.push(`/goservices?${params.toString()}`);
  }

  return (
    <div className="flex gap-3">
      <Select value={type ?? ALL} onValueChange={(v) => v && setParam("type", v)}>
        <SelectTrigger className="w-48"><SelectValue>{(v: string) => v === ALL ? "Todos los tipos" : TYPE_LABELS[v] ?? v}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los tipos</SelectItem>
          <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
          <SelectItem value="mensajeria">Mensajería</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status ?? ALL} onValueChange={(v) => v && setParam("status", v)}>
        <SelectTrigger className="w-48"><SelectValue>{(v: string) => v === ALL ? "Todos los estatus" : STATUS_LABELS[v] ?? v}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estatus</SelectItem>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Write `AssignRequestSelect.tsx`**

```tsx
// src/app/(app)/goservices/AssignRequestSelect.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignGoservicesRequest } from "../solicitudes/goservices/actions";

const UNASSIGNED = "__unassigned__";

export function AssignRequestSelect({
  requestId,
  assignedAppUserId,
  users,
}: {
  requestId: string;
  assignedAppUserId: string | null;
  users: { id: string; email: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === UNASSIGNED) return;
    startTransition(async () => {
      await assignGoservicesRequest(requestId, next);
      router.refresh();
    });
  }

  return (
    <Select value={assignedAppUserId ?? UNASSIGNED} onValueChange={(v) => v && onChange(v)} disabled={isPending}>
      <SelectTrigger className="w-56">
        <SelectValue>{(v: string) => (v === UNASSIGNED ? "Sin asignar" : users.find((u) => u.id === v)?.email ?? v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

```tsx
// src/app/(app)/goservices/page.tsx
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
import { listAllGoservicesRequests, listAssignableUsers } from "../solicitudes/goservices/actions";
import { GoservicesFilterBar } from "./GoservicesFilterBar";
import { AssignRequestSelect } from "./AssignRequestSelect";

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completado") return "default";
  if (status === "cancelado") return "secondary";
  return "outline";
}

export default async function GoservicesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { type, status } = await searchParams;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view) redirect("/");

  const [requests, users] = await Promise.all([
    listAllGoservicesRequests({ type, status }),
    listAssignableUsers(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">GoServices — Todas las solicitudes</h1>
      <GoservicesFilterBar type={type ?? null} status={status ?? null} />
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes con estos filtros.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Asignado a</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.createdAtLabel}</TableCell>
                <TableCell>{r.typeLabel}</TableCell>
                <TableCell>{r.requesterName}</TableCell>
                <TableCell className="max-w-xs truncate">{r.detalle}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{r.statusLabel}</Badge>
                </TableCell>
                <TableCell>
                  <AssignRequestSelect requestId={r.id} assignedAppUserId={r.assignedAppUserId} users={users} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/goservices/
git commit -m "feat: add goservices supervisor/lider dashboard"
```

---

### Task 9: Sidebar + layout wiring

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Add `canViewGoservices` in `layout.tsx`**

In `src/app/(app)/layout.tsx`, add this prop to the `<AppShell>` call (next to the existing `canViewComplaints` line):

```tsx
      canViewGoservices={Boolean(permissions.get("goservices")?.can_view)}
```

- [ ] **Step 2: Add nav entries in `Sidebar.tsx`**

Add `canViewGoservices: boolean;` to the props type (next to `canViewComplaints: boolean;`) and destructure it in the function signature (next to `canViewComplaints,`).

Add a `ClipboardList` (or similar unused icon) import from `lucide-react` next to the existing icon imports.

In `mainLinks`, add after the existing Quejas lines:

```tsx
    { href: "/solicitudes/goservices", label: "GoServices", icon: ClipboardList },
    { href: "/solicitudes/goservices/asignadas", label: "GoServices: Asignadas", icon: ClipboardList },
    ...(canViewGoservices ? [{ href: "/goservices", label: "GoServices: Gestión", icon: ClipboardList }] : []),
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/app/\(app\)/Sidebar.tsx
git commit -m "feat: wire goservices into sidebar and layout permissions"
```

---

### Task 10: Final review and manual verification

- [ ] **Step 1: Run every test file this plan added, one at a time**

```bash
bun test src/test/integration/goservicesRequests.test.ts
bun test src/lib/sharepoint.test.ts
bun test src/lib/sendGoservicesStatusEmail.test.ts
```

Expected: all PASS. **Do not run the full `bun run test` suite.**

- [ ] **Step 2: Type-check the whole project**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the dev server and click through all four screens manually**

```bash
bun run dev
```

Log in, then visit:
- `/solicitudes/goservices` — create one Mantenimiento and one Mensajería request, confirm the field sets switch correctly and both appear in the table below.
- `/solicitudes/goservices/asignadas` — (needs a request assigned to this user first, via the dashboard) confirm the status `Select` updates and the row reflects it after refresh.
- `/goservices` — (needs `can_view` on `goservices` granted to this role profile from Perfiles de Rol first) confirm both requests show, filters work, and assigning a user + changing status both work.
- Confirm a status change email actually arrives (requires real SMTP + the real SharePoint credentials from Task 3 Step 5 in place).

- [ ] **Step 4: Dispatch a final code-quality review of the whole branch, then proceed to `superpowers:finishing-a-development-branch`.**
