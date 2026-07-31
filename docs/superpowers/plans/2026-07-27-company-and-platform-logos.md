# Logos de empresas y de la plataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Super Admin upload a logo per company (shown in `/companies`) and a single platform logo (shown on login/forgot-password/reset-password and as the favicon), both stored in Supabase Storage and managed entirely through the UI.

**Architecture:** One shared public Storage bucket `company-logos` holds both kinds of image — platform logos live under a `platform/` folder, company logos live at the bucket root — with separate RLS policies per folder so platform-logo writes require `can_manage` on the `settings` module and company-logo writes require `can_manage` on the `companies` module (mirroring the module-permission pattern already used everywhere else). A new singleton table `platform_settings` holds the platform's `logo_url`, publicly readable (so the unauthenticated login page can render it) but writable only by settings managers. `companies.logo_url` is a plain nullable column, already covered by the table's existing RLS (no new row-level rule needed — Postgres RLS is row-level, not column-level). A small server-only helper `getPlatformLogoUrl()` centralizes reading the platform logo for the four places that need it (login, forgot-password, reset-password, root layout metadata, manifest).

**Tech Stack:** Existing Next.js Server Components/Actions + Supabase Storage/RLS pattern (same as `contact-photos` and `company-seals`), no new dependencies.

**Related spec:** `docs/superpowers/specs/2026-07-27-company-and-platform-logos-design.md`

---

### Task 1: Migration — `platform_settings` table, `companies.logo_url`, `company-logos` storage bucket + RLS

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_company_and_platform_logos.sql`
- Test: `src/test/integration/logosRls.test.ts`
- Test: `src/test/integration/companyLogosStorage.test.ts`

- [x] **Step 1: Write the failing RLS tests first**

`src/test/integration/logosRls.test.ts`:
```typescript
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("platform_settings RLS", () => {
  let editor: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (editor) await deleteTestUser(editor.id);
    if (admin) await deleteTestUser(admin.id);
    editor = undefined;
    admin = undefined;

    await createAdminClient().from("platform_settings").update({ logo_url: null }).eq("id", true);
  });

  it("lets an anonymous (unauthenticated) client read the platform settings row", async () => {
    const anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await anon.from("platform_settings").select("logo_url");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks an Editor (no can_manage on settings) from updating the platform logo", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client
      .from("platform_settings")
      .update({ logo_url: "https://example.com/logo.png" })
      .eq("id", true);

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin update the platform logo", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("platform_settings")
      .update({ logo_url: "https://example.com/logo.png" })
      .eq("id", true)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.logo_url).toBe("https://example.com/logo.png");
  });
});

describe("company-logos storage RLS", () => {
  let editor: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (editor) await deleteTestUser(editor.id);
    if (admin) await deleteTestUser(admin.id);
    editor = undefined;
    admin = undefined;
  });

  function fakePng() {
    return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
  }

  it("blocks an Editor (no can_manage on companies) from uploading a company logo", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client.storage
      .from("company-logos")
      .upload(`${randomUUID()}-logo.png`, fakePng());

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin upload a company logo at the bucket root", async () => {
    admin = await createTestUser("Super Admin");
    const path = `${randomUUID()}-logo.png`;

    const { error } = await admin.client.storage.from("company-logos").upload(path, fakePng());

    expect(error).toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });

  it("blocks an Editor from uploading into the platform/ folder", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client.storage
      .from("company-logos")
      .upload(`platform/${randomUUID()}-logo.png`, fakePng());

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin (settings can_manage) upload into the platform/ folder", async () => {
    admin = await createTestUser("Super Admin");
    const path = `platform/${randomUUID()}-logo.png`;

    const { error } = await admin.client.storage.from("company-logos").upload(path, fakePng());

    expect(error).toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });
});
```

`src/test/integration/companyLogosStorage.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("company-logos storage bucket", () => {
  it("exists, is public, and restricts size/type", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket("company-logos");

    expect(error).toBeNull();
    expect(data?.public).toBe(true);
    expect(data?.file_size_limit).toBe(2097152);
    expect(data?.allowed_mime_types).toEqual(
      expect.arrayContaining(["image/png", "image/jpeg", "image/svg+xml"]),
    );
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/integration/logosRls.test.ts src/test/integration/companyLogosStorage.test.ts`
Expected: FAIL — `relation "public.platform_settings" does not exist` (and the bucket test fails with a null bucket / not-found error).

- [x] **Step 3: Generate and write the migration**

Run: `npx supabase migration new company_and_platform_logos`

```sql
alter table public.companies add column logo_url text;

create table public.platform_settings (
  id boolean primary key default true,
  logo_url text,
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_anyone" on public.platform_settings
for select
using ( true );

create policy "platform_settings_update_settings_managers" on public.platform_settings
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('settings')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('settings')), false) );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 2097152, array['image/png','image/jpeg','image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "company_logos_public_read" on storage.objects
for select
using ( bucket_id = 'company-logos' );

create policy "company_logos_write_platform" on storage.objects
for insert
with check (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = 'platform'
  and coalesce((select can_manage from public.get_my_module_permissions('settings')), false)
);

create policy "company_logos_update_platform" on storage.objects
for update
using (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = 'platform'
  and coalesce((select can_manage from public.get_my_module_permissions('settings')), false)
);

create policy "company_logos_write_companies" on storage.objects
for insert
with check (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] is null
  and coalesce((select can_manage from public.get_my_module_permissions('companies')), false)
);

create policy "company_logos_update_companies" on storage.objects
for update
using (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] is null
  and coalesce((select can_manage from public.get_my_module_permissions('companies')), false)
);
```

`companies.logo_url` needs no new RLS policy of its own — the table's existing `companies_write_platform_managers` / `companies_update_platform_managers` policies (from `20260714130015_companies_and_departments.sql`, re-pointed at `get_my_module_permissions('companies')` by `20260715120543_per_module_permissions.sql`) already gate every column on every row, including this new one.

- [x] **Step 4: Apply the migration**

Apply this SQL to the live Supabase project (via the SQL Editor in the Supabase dashboard, or the Management API, same method used for every earlier migration in this repo).

- [x] **Step 5: Run the tests again to verify they pass**

Run: `npx vitest run src/test/integration/logosRls.test.ts src/test/integration/companyLogosStorage.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add supabase/migrations src/test/integration/logosRls.test.ts src/test/integration/companyLogosStorage.test.ts
git commit -m "feat: add platform_settings table, companies.logo_url, and company-logos storage bucket"
```

---

### Task 2: `getPlatformLogoUrl()` helper

**Files:**
- Create: `src/lib/platformSettings.ts`
- Test: `src/lib/platformSettings.test.ts`

- [x] **Step 1: Write the failing tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getPlatformLogoUrl } from "./platformSettings";

function mockSupabase(logoUrl: string | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: logoUrl === null ? null : { logo_url: logoUrl },
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPlatformLogoUrl", () => {
  it("returns the logo URL when one is set", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase("https://cdn.example.com/logo.png") as never,
    );

    const result = await getPlatformLogoUrl();

    expect(result).toBe("https://cdn.example.com/logo.png");
  });

  it("returns null when no logo has been uploaded yet", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase(null) as never);

    const result = await getPlatformLogoUrl();

    expect(result).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/platformSettings.test.ts`
Expected: FAIL — `Cannot find module './platformSettings'`

- [x] **Step 3: Write the implementation**

```typescript
import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getPlatformLogoUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("logo_url")
    .eq("id", true)
    .maybeSingle();
  return data?.logo_url ?? null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/platformSettings.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/platformSettings.ts src/lib/platformSettings.test.ts
git commit -m "feat: add getPlatformLogoUrl helper"
```

---

### Task 3: `saveCompany` accepts a logo URL

**Files:**
- Modify: `src/app/(app)/(admin)/companies/actions.ts`
- Test: `src/app/(app)/(admin)/companies/actions.test.ts`

- [x] **Step 1: Write the failing tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "./actions";

function mockSupabase(error: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const insert = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, update });
  return { from, insert, update, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveCompany", () => {
  it("inserts a new company with its logo_url when no id is given", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveCompany(undefined, "Acme", "https://cdn.example.com/acme.png");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("companies");
    expect(supabase.insert).toHaveBeenCalledWith({
      name: "Acme",
      logo_url: "https://cdn.example.com/acme.png",
    });
  });

  it("updates an existing company's logo_url when an id is given", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveCompany("company-1", "Acme", null);

    expect(result.error).toBeUndefined();
    expect(supabase.update).toHaveBeenCalledWith({ name: "Acme", logo_url: null });
    expect(supabase.eq).toHaveBeenCalledWith("id", "company-1");
  });

  it("surfaces the database error", async () => {
    const supabase = mockSupabase({ message: "boom" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveCompany(undefined, "Acme", null);

    expect(result.error).toBe("boom");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/(admin)/companies/actions.test.ts"`
Expected: FAIL — `saveCompany` called with 2 args in current implementation, `logo_url` never passed to `insert`/`update`, so the `toHaveBeenCalledWith` assertions fail.

- [x] **Step 3: Update the implementation**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveCompany(id: string | undefined, name: string, logoUrl: string | null) {
  const supabase = await createClient();
  const query = id
    ? supabase.from("companies").update({ name, logo_url: logoUrl }).eq("id", id)
    : supabase.from("companies").insert({ name, logo_url: logoUrl });
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/companies");
  return {};
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/(admin)/companies/actions.test.ts"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add "src/app/(app)/(admin)/companies/actions.ts" "src/app/(app)/(admin)/companies/actions.test.ts"
git commit -m "feat: let saveCompany store a logo_url"
```

---

### Task 4: Logo upload field in `CompanyForm`

**Files:**
- Modify: `src/app/(app)/(admin)/companies/CompanyForm.tsx`

- [x] **Step 1: Add the upload field and wire it into submit**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { saveCompany } from "./actions";

interface CompanyInput {
  id: string;
  name: string;
  logo_url: string | null;
}

export function CompanyForm({ initial }: { initial?: CompanyInput }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      let finalLogoUrl = logoUrl;

      if (logoFile) {
        const supabase = createBrowserClient();
        const path = `${crypto.randomUUID()}-${logoFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("company-logos")
          .upload(path, logoFile);
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
        finalLogoUrl = data.publicUrl;
      }

      const result = await saveCompany(initial?.id, name, finalLogoUrl);
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) {
          setName("");
          setLogoUrl(null);
          setLogoFile(null);
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
            <Button>Nueva empresa</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre de la empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="space-y-1">
          <Label>Logo (opcional)</Label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
          {logoUrl && !logoFile && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={logoUrl} alt="" className="mt-2 h-12 w-12 rounded object-contain" />
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 2: Manual verification**

Run `npm run dev`, log in as a user with `can_manage` on `companies`, open "Nueva empresa", pick a PNG, save, confirm no error. Edit that same company again and confirm the logo preview shows.

- [x] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/companies/CompanyForm.tsx"
git commit -m "feat: add logo upload field to CompanyForm"
```

---

### Task 5: Logo thumbnail in the Empresas table

**Files:**
- Modify: `src/app/(app)/(admin)/companies/page.tsx`

- [x] **Step 1: Add a thumbnail column and pass `logo_url` into `CompanyForm`**

```tsx
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
import { Building2 } from "lucide-react";
import { CompanyForm } from "./CompanyForm";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "companies",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empresas</h1>
        <CompanyForm />
      </div>
      {(companies ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Building2 className="size-8" />
          <p className="text-sm">No hay empresas todavía.</p>
          <p className="text-xs">Crea la primera con el botón &quot;Nueva empresa&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Nombre</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(companies ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
                    <img src={c.logo_url} alt="" className="size-8 rounded object-contain" />
                  ) : (
                    <Building2 className="size-8 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <CompanyForm initial={{ id: c.id, name: c.name, logo_url: c.logo_url }} />
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

- [x] **Step 2: Manual verification**

Run `npm run dev`, visit `/companies`. Confirm companies with a logo show it in the first column, and companies without one show the default building icon.

- [x] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/companies/page.tsx"
git commit -m "feat: show company logo thumbnail in the Empresas table"
```

---

### Task 6: `savePlatformLogo` server action

**Files:**
- Modify: `src/app/(app)/(admin)/settings/actions.ts`
- Modify: `src/app/(app)/(admin)/settings/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/(app)/(admin)/settings/actions.test.ts`, change the existing import line:

```typescript
import { saveSmtpSettings } from "./actions";
```

to:

```typescript
import { saveSmtpSettings, savePlatformLogo } from "./actions";
```

Then add this new `describe` block to the bottom of the file (reuses the file's existing `mockServerClient` helper and mocks):

```typescript
describe("savePlatformLogo", () => {
  it("rejects callers without can_manage on the settings module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await savePlatformLogo("https://cdn.example.com/logo.png");

    expect(result.error).toBe("No autorizado");
  });

  it("updates the platform_settings row when authorized", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      ...mockServerClient({ can_manage: true }),
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }),
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await savePlatformLogo("https://cdn.example.com/logo.png");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("platform_settings");
    expect(supabase.from().update).toHaveBeenCalledWith({
      logo_url: "https://cdn.example.com/logo.png",
    });
    expect(eq).toHaveBeenCalledWith("id", true);
  });
});
```

(The existing `mockServerClient` helper only defines `auth` and `rpc` — the second test above layers a `from` mock on top of it since `savePlatformLogo` is the first action in this file to touch the database directly rather than going through the Management API.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/(admin)/settings/actions.test.ts"`
Expected: FAIL — `savePlatformLogo` is not exported by `./actions`.

- [ ] **Step 3: Add the action**

In `src/app/(app)/(admin)/settings/actions.ts`, add below `saveSmtpSettings`:

```typescript
export async function savePlatformLogo(logoUrl: string): Promise<ActionResult> {
  if (!(await callerCanManageSettings())) {
    return { error: "No autorizado" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ logo_url: logoUrl })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/login");
  revalidatePath("/forgot-password");
  revalidatePath("/reset-password");
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/(admin)/settings/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/(admin)/settings/actions.ts" "src/app/(app)/(admin)/settings/actions.test.ts"
git commit -m "feat: add savePlatformLogo server action"
```

---

### Task 7: `PlatformLogoForm` and wiring into the Settings page

**Files:**
- Create: `src/app/(app)/(admin)/settings/PlatformLogoForm.tsx`
- Modify: `src/app/(app)/(admin)/settings/page.tsx`

- [ ] **Step 1: Write the form component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { savePlatformLogo } from "./actions";

export function PlatformLogoForm({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!logoFile) {
      setError("Selecciona un archivo de imagen");
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserClient();
      const path = `platform/${crypto.randomUUID()}-${logoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, logoFile);
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);

      const result = await savePlatformLogo(data.publicUrl);
      setError(result.error ?? null);
      setSuccess(!result.error);
      if (!result.error) {
        setLogoUrl(data.publicUrl);
        setLogoFile(null);
      }
    });
  }

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Marca</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Logo actualizado.</p>}
      <div className="flex items-center gap-3">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
          <img src={logoUrl} alt="" className="size-12 rounded object-contain" />
        )}
        <div className="space-y-1">
          <Label>Logo de la plataforma</Label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <Button onClick={submit} disabled={isPending || !logoFile}>
        Guardar
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Settings page**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfig } from "@/lib/supabase/managementApi";
import { getPlatformLogoUrl } from "@/lib/platformSettings";
import { PlatformLogoForm } from "./PlatformLogoForm";
import { SmtpSettingsForm } from "./SmtpSettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "settings",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const [config, logoUrl] = await Promise.all([getAuthConfig(), getPlatformLogoUrl()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <PlatformLogoForm initialLogoUrl={logoUrl} />
      <div>
        <h2 className="text-lg font-semibold">Configuración de correo</h2>
        <p className="text-sm text-muted-foreground">
          Define el servidor de correo (SMTP) que se usa para enviar invitaciones y
          recuperación de clave a los usuarios.
        </p>
      </div>
      <SmtpSettingsForm
        initial={{
          smtp_host: String(config.smtp_host ?? ""),
          smtp_port: String(config.smtp_port ?? ""),
          smtp_user: String(config.smtp_user ?? ""),
          smtp_sender_name: String(config.smtp_sender_name ?? ""),
          smtp_admin_email: String(config.smtp_admin_email ?? ""),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, visit `/settings` as a user with `can_manage` on `settings` (Super Admin), upload a logo under "Marca", confirm the success message and preview. Reload the page and confirm the preview persists.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/(admin)/settings/PlatformLogoForm.tsx" "src/app/(app)/(admin)/settings/page.tsx"
git commit -m "feat: add platform logo upload UI to Settings"
```

---

### Task 8: Show the platform logo on the login page

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Fetch and render the logo, falling back to the current icon**

```tsx
import { Building2, Mail, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformLogoUrl } from "@/lib/platformSettings";
import { login } from "./actions";
import { SubmitButton } from "./SubmitButton";
import { PasswordField } from "./PasswordField";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const logoUrl = await getPlatformLogoUrl();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-50 to-zinc-100 px-4">
      <div
        aria-hidden
        className="animate-blob absolute -top-24 -left-24 size-96 rounded-full bg-[#04B1AF]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-blob-delayed absolute -right-24 -bottom-24 size-96 rounded-full bg-emerald-300/20 blur-3xl"
      />

      <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative w-full max-w-sm space-y-6 duration-500">
        <div className="flex flex-col items-center gap-3 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img
              src={logoUrl}
              alt=""
              className="size-14 rounded-2xl object-contain shadow-lg shadow-[#04B1AF]/30"
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 shadow-lg shadow-[#04B1AF]/30">
              <Building2 className="size-7 text-white" />
            </div>
          )}
          <div>
            <p className="text-2xl font-semibold text-zinc-900">Gente Sánchez Business</p>
            <p className="text-sm text-zinc-500">Portal interno de empleados</p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-8 shadow-xl shadow-zinc-900/5 backdrop-blur-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Iniciar sesión</h1>
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form action={login} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-600">
                Correo
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="border-zinc-200 bg-white pl-8 text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
                />
              </div>
            </div>
            <PasswordField />
            <SubmitButton />
          </form>
          <a
            href="/forgot-password"
            className="block text-sm text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-900"
          >
            ¿Olvidaste tu clave?
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, with no platform logo set visit `/login` and confirm the gradient building icon still shows. Upload a logo from `/settings`, revisit `/login`, and confirm the uploaded image now shows in its place.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: show the platform logo on the login page"
```

---

### Task 9: Show the platform logo on forgot-password and reset-password

**Files:**
- Modify: `src/app/forgot-password/page.tsx`
- Modify: `src/app/reset-password/page.tsx`

- [ ] **Step 1: Update `forgot-password/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformLogoUrl } from "@/lib/platformSettings";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  const logoUrl = await getPlatformLogoUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center text-2xl font-semibold text-zinc-900">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={logoUrl} alt="" className="size-12 rounded-xl object-contain" />
          )}
          Gente Sánchez Business
        </div>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-900">Restablecer clave</h1>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {sent && (
            <p className="text-sm text-emerald-600">
              Si tu correo está registrado, te acabamos de enviar un enlace para restablecer tu
              clave. Revisa tu bandeja de entrada (y la carpeta de spam).
            </p>
          )}
          <form action={requestPasswordReset} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-600">
                Correo
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
              />
            </div>
            <Button type="submit" className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]">
              Enviar enlace
            </Button>
          </form>
          {!sent && !error && (
            <p className="text-sm text-zinc-500">
              Si tu correo está registrado, recibirás un enlace para restablecer tu clave.
            </p>
          )}
          <a
            href="/login"
            className="block text-sm text-zinc-500 underline hover:text-zinc-900"
          >
            Volver a iniciar sesión
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `reset-password/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformLogoUrl } from "@/lib/platformSettings";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const logoUrl = await getPlatformLogoUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center text-2xl font-semibold text-zinc-900">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={logoUrl} alt="" className="size-12 rounded-xl object-contain" />
          )}
          Gente Sánchez Business
        </div>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-900">Elige una nueva clave</h1>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <form action={updatePassword} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password" className="text-zinc-600">
                Nueva clave
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
              />
              <p className="text-xs text-zinc-400">Mínimo 8 caracteres.</p>
            </div>
            <Button type="submit" className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]">
              Guardar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, with a platform logo already set (from Task 7/8), visit `/forgot-password` and `/reset-password` and confirm the logo shows above the "Gente Sánchez Business" text on both.

- [ ] **Step 4: Commit**

```bash
git add src/app/forgot-password/page.tsx src/app/reset-password/page.tsx
git commit -m "feat: show the platform logo on forgot/reset password pages"
```

---

### Task 10: Dynamic favicon from the platform logo

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/manifest.ts`

- [ ] **Step 1: Convert `layout.tsx`'s static metadata into `generateMetadata`**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import { getPlatformLogoUrl } from "@/lib/platformSettings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await getPlatformLogoUrl();
  const icon = logoUrl ?? "/icon.svg";

  return {
    title: "Gente Sánchez Business",
    description: "Plataforma interna de Gente Sánchez Business",
    icons: {
      icon,
      apple: icon,
    },
  };
}

export const viewport = {
  themeColor: "#04b1af",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Make `manifest.ts` async and logo-aware**

```tsx
import type { MetadataRoute } from "next";
import { getPlatformLogoUrl } from "@/lib/platformSettings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const logoUrl = await getPlatformLogoUrl();

  const icons = logoUrl
    ? [
        { src: logoUrl, sizes: "any", purpose: "any" as const },
        { src: logoUrl, sizes: "any", purpose: "maskable" as const },
      ]
    : [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" as const },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" as const },
      ];

  return {
    name: "Gente Sánchez Business",
    short_name: "GSB",
    description: "Plataforma interna de Gente Sánchez Business",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#04b1af",
    icons,
  };
}
```

- [ ] **Step 3: Run the full test suite and the build**

Run: `npm run test`
Expected: PASS (no existing test touches `layout.tsx` or `manifest.ts` directly, so this just guards against a typo breaking something else).

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. With no platform logo set, confirm the browser tab still shows the default icon. Upload a platform logo from `/settings`, hard-refresh any page, and confirm the browser tab icon updates to the uploaded logo.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/manifest.ts
git commit -m "feat: derive the favicon and web manifest icon from the platform logo"
```

---

### Task 11: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full manual walkthrough**

Run `npm run dev` and, logged in as a Super Admin:
1. Go to `/companies`, create a company with a logo, confirm the thumbnail appears in the table.
2. Edit that company's logo to a different file, confirm the table updates after save.
3. Go to `/settings`, upload a platform logo under "Marca".
4. Log out. Visit `/login`, `/forgot-password`, `/reset-password` and confirm the platform logo shows on all three.
5. Confirm the browser tab icon (favicon) matches the uploaded platform logo.
6. Log back in as a user without `can_manage` on `companies` or `settings` (e.g. a "Viewer") and confirm they cannot reach the upload controls in a way that bypasses the RLS policies from Task 1 (the UI itself already redirects them away from `/companies` and `/settings` via the existing permission gates — this just confirms nothing regressed).

- [ ] **Step 2: Run the full test suite one more time**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: Report completion**

No commit for this task — it's verification only. If any step fails, go back to the relevant task above and fix it before considering the feature done.
