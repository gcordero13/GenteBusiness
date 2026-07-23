# Módulo "Sellos y Firmas" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new platform module where users with access can load a PDF (client-side, never uploaded to the server), stamp it with a company seal, a personal drawn signature, and/or free text, then download the finished PDF — porting the proven logic from the user's existing Electron app (`C:\Sellos\sello-app`).

**Architecture:** All PDF viewing and editing happens in the browser using `pdfjs-dist` (render pages to canvas) and `pdf-lib` (embed PNG items into the PDF and produce the download). Company seals and personal signatures are the only things persisted, in Supabase Storage + two new tables, gated by the existing per-module permission system (a single `document_stamps` module, single `can_add` flag governs everything). Signed URLs (1 hour) are generated server-side so the client can both display and fetch the actual PNG bytes for embedding, without making the Storage buckets public.

**Tech Stack:** `pdfjs-dist` (PDF rendering), `pdf-lib` (PDF editing/embedding), existing Next.js Server Components/Actions + Supabase RLS pattern, shadcn `dialog`/`select` (already installed).

**Related spec:** `docs/superpowers/specs/2026-07-23-sellos-firmas-design.md`

**Reference logic (read-only, do not modify):** `C:\Sellos\sello-app\renderer\app.js` and `C:\Sellos\sello-app\main.js` — this plan ports their proven item-placement/drag/resize/save math into this codebase's conventions.

---

### Task 1: Install PDF libraries

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install pinned versions**

Run:
```bash
npm install pdfjs-dist@6.1.200 pdf-lib@1.17.1
```

Pinning exact versions matters here: `pdfjs-dist` requires its worker script to be loaded from a matching version (Task 12 loads it from a CDN URL that includes the version number), so an unpinned `^` range could silently drift the installed version out of sync with the hardcoded worker URL.

- [ ] **Step 2: Verify install and that the app still builds**

Run: `npm run build`
Expected: builds successfully (these packages aren't imported anywhere yet, so this just confirms nothing broke).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdfjs-dist and pdf-lib for the Sellos y Firmas module"
```

---

### Task 2: Migration — `document_stamps` module + permissions

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_document_stamps_module.sql`

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new document_stamps_module`

- [ ] **Step 2: Write the migration SQL**

```sql
insert into public.modules (key, label) values ('document_stamps', 'Sellos y Firmas');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, false, (rp.name = 'Super Admin'), false, false, false, false, false
from public.role_profiles rp
cross join public.modules m
where m.key = 'document_stamps';
```

This mirrors the exact pattern used when the `settings` module was added: a new module row, plus one permission row per existing role profile, with only Super Admin getting access by default (`can_add = true`). A platform admin can later grant `can_add` to other profiles from `/role-profiles` — this single flag governs everything in this module (uploading seals, using them, and stamping/downloading documents), per the design spec.

- [ ] **Step 3: Apply the migration**

Apply this SQL to the live Supabase project (via the SQL Editor in the Supabase dashboard, or the Management API `database/query` endpoint if you have a personal access token configured — see how earlier migrations in this repo were applied for the exact method used in this project).

- [ ] **Step 4: Write a test confirming the module and permissions exist**

`src/test/integration/documentStampsModule.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("document_stamps module seed data", () => {
  it("exists as a module with permission rows for every role profile, Super Admin granted by default", async () => {
    const admin = createAdminClient();

    const { data: moduleRow, error: moduleError } = await admin
      .from("modules")
      .select("id, key, label")
      .eq("key", "document_stamps")
      .single();

    expect(moduleError).toBeNull();
    expect(moduleRow?.label).toBe("Sellos y Firmas");

    const { data: permissionRows, error: permissionError } = await admin
      .from("role_profile_permissions")
      .select("can_add, role_profiles(name)")
      .eq("module_id", moduleRow!.id);

    expect(permissionError).toBeNull();
    expect(permissionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          can_add: true,
          role_profiles: expect.objectContaining({ name: "Super Admin" }),
        }),
        expect.objectContaining({
          can_add: false,
          role_profiles: expect.objectContaining({ name: "Viewer" }),
        }),
      ]),
    );
  });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/test/integration/documentStampsModule.test.ts`
Expected: PASS (once the migration from Step 3 has actually been applied to the live project)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/test/integration/documentStampsModule.test.ts
git commit -m "feat: add document_stamps module and permissions"
```

---

### Task 3: Migration — `company_seals`, `user_signatures` tables, Storage buckets

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_company_seals_and_user_signatures.sql`

- [ ] **Step 1: Write the failing RLS tests first**

`src/test/integration/documentStampsRls.test.ts`:
```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function assignModulePermission(userId: string, canAdd: boolean) {
  const admin = createAdminClient();
  const { data: appUser } = await admin.from("app_users").select("role_profile_id").eq("id", userId).single();
  const { data: moduleRow } = await admin.from("modules").select("id").eq("key", "document_stamps").single();
  await admin
    .from("role_profile_permissions")
    .update({ can_add: canAdd })
    .eq("role_profile_id", appUser!.role_profile_id)
    .eq("module_id", moduleRow!.id);
}

async function makeCompany() {
  const admin = createAdminClient();
  const { data } = await admin.from("companies").insert({ name: "Sellos Test Co" }).select().single();
  return data!.id as string;
}

describe("company_seals RLS", () => {
  let viewer: TestUser | undefined;
  let editor: TestUser | undefined;
  let companyId: string;
  let sealId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (sealId) await admin.from("company_seals").delete().eq("id", sealId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (viewer) await deleteTestUser(viewer.id);
    if (editor) await deleteTestUser(editor.id);
    viewer = undefined;
    editor = undefined;
    sealId = "";
  });

  it("blocks a user without can_add from creating a seal", async () => {
    companyId = await makeCompany();
    viewer = await createTestUser("Viewer");
    await assignModulePermission(viewer.id, false);

    const { error } = await viewer.client
      .from("company_seals")
      .insert({ company_id: companyId, name: "Sello X", storage_path: "x/x.png" });

    expect(error).not.toBeNull();
  });

  it("lets a user with can_add create and read a seal", async () => {
    companyId = await makeCompany();
    editor = await createTestUser("Viewer");
    await assignModulePermission(editor.id, true);

    const { data, error } = await editor.client
      .from("company_seals")
      .insert({ company_id: companyId, name: "Sello X", storage_path: "x/x.png" })
      .select()
      .single();

    expect(error).toBeNull();
    sealId = data!.id;

    const { data: readBack, error: readError } = await editor.client
      .from("company_seals")
      .select("*")
      .eq("id", sealId);

    expect(readError).toBeNull();
    expect(readBack).toHaveLength(1);
  });
});

describe("user_signatures RLS", () => {
  let owner: TestUser | undefined;
  let otherUser: TestUser | undefined;
  let signatureId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (signatureId) await admin.from("user_signatures").delete().eq("id", signatureId);
    if (owner) await deleteTestUser(owner.id);
    if (otherUser) await deleteTestUser(otherUser.id);
    owner = undefined;
    otherUser = undefined;
    signatureId = "";
  });

  it("lets any authenticated user (regardless of module permission) save their own signature", async () => {
    owner = await createTestUser("Viewer");
    await assignModulePermission(owner.id, false); // no document_stamps access at all

    const { data, error } = await owner.client
      .from("user_signatures")
      .insert({ user_id: owner.id, storage_path: `${owner.id}/firma_1.png` })
      .select()
      .single();

    expect(error).toBeNull();
    signatureId = data!.id;
  });

  it("blocks a user from reading another user's signature", async () => {
    owner = await createTestUser("Viewer");
    otherUser = await createTestUser("Viewer");

    const { data } = await owner.client
      .from("user_signatures")
      .insert({ user_id: owner.id, storage_path: `${owner.id}/firma_1.png` })
      .select()
      .single();
    signatureId = data!.id;

    const { data: otherView, error } = await otherUser.client
      .from("user_signatures")
      .select("*")
      .eq("id", signatureId);

    expect(error).toBeNull();
    expect(otherView).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/test/integration/documentStampsRls.test.ts`
Expected: FAIL — `relation "public.company_seals" does not exist` (or similar for `user_signatures`).

- [ ] **Step 3: Generate and write the migration**

Run: `npx supabase migration new company_seals_and_user_signatures`

```sql
create table public.company_seals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.user_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.company_seals enable row level security;
alter table public.user_signatures enable row level security;

create policy "company_seals_all_can_add" on public.company_seals
for all
using ( coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false) )
with check ( coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false) );

create policy "user_signatures_owner_only" on public.user_signatures
for all
using ( user_id = auth.uid() )
with check ( user_id = auth.uid() );

insert into storage.buckets (id, name, public)
values ('company-seals', 'company-seals', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('user-signatures', 'user-signatures', false)
on conflict (id) do nothing;

create policy "company_seals_storage_can_add" on storage.objects
for all
using (
  bucket_id = 'company-seals'
  and coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false)
)
with check (
  bucket_id = 'company-seals'
  and coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false)
);

create policy "user_signatures_storage_owner_only" on storage.objects
for all
using (
  bucket_id = 'user-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

Both buckets are `public: false` — the app always accesses them through an authenticated session (via signed URLs generated server-side in Task 6), so there's no need to expose them on the public CDN path the way `contact-photos` is.

- [ ] **Step 4: Apply the migration**

Apply this SQL to the live Supabase project (same method as Task 2).

- [ ] **Step 5: Run the tests again to verify they pass**

Run: `npx vitest run src/test/integration/documentStampsRls.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/test/integration/documentStampsRls.test.ts
git commit -m "feat: add company_seals and user_signatures tables with RLS and storage buckets"
```

---

### Task 4: Pure helper module for PDF placement math

**Files:**
- Create: `src/lib/pdfStamping.ts`
- Test: `src/lib/pdfStamping.test.ts`

This is the trickiest math in the whole feature — ported directly from the proven logic in `C:\Sellos\sello-app\renderer\app.js` (`placeStampOnPage`, `placeSignature`, `onDocMouseMove`'s clamping, and `savePdf`'s coordinate conversion). Extracting it into pure functions makes it possible to actually unit test, unlike the DOM/canvas-heavy code that uses it.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  clampPosition,
  computeInitialSignatureSize,
  computeInitialStampSize,
  computePdfDrawRect,
} from "./pdfStamping";

describe("computeInitialStampSize", () => {
  it("sizes the stamp to 15% of the overlay width, preserving aspect ratio", () => {
    expect(computeInitialStampSize(300, 120, 1000)).toEqual({ w: 150, h: 60 });
  });
});

describe("computeInitialSignatureSize", () => {
  it("caps width at 35% of overlay width when height allows it", () => {
    // 500x180 image, overlay 1000x800 -> maxW=350, maxH=96
    // width-capped: w=350, h=126 -> exceeds maxH=96, so height-capped instead
    expect(computeInitialSignatureSize(500, 180, 1000, 800)).toEqual({
      w: 500 * (96 / 180),
      h: 96,
    });
  });

  it("caps by width when the image is wide and short enough to fit the height cap", () => {
    // 500x100 image, overlay 1000x800 -> maxW=350, maxH=96
    // width-capped: w=350, h=70 -> fits under maxH=96, so width cap wins
    expect(computeInitialSignatureSize(500, 100, 1000, 800)).toEqual({ w: 350, h: 70 });
  });
});

describe("clampPosition", () => {
  it("leaves position unchanged when fully inside the container", () => {
    expect(clampPosition(10, 10, 50, 50, 200, 200)).toEqual({ x: 10, y: 10 });
  });

  it("clamps negative positions to 0", () => {
    expect(clampPosition(-30, -5, 50, 50, 200, 200)).toEqual({ x: 0, y: 0 });
  });

  it("clamps positions that would push the item past the right/bottom edge", () => {
    expect(clampPosition(190, 190, 50, 50, 200, 200)).toEqual({ x: 150, y: 150 });
  });
});

describe("computePdfDrawRect", () => {
  it("scales x/width directly and flips the y axis (PDF origin is bottom-left)", () => {
    // overlay 1000x800 maps to a PDF page of 500x400 (half scale)
    // item at (100, 50) sized 200x100 in overlay space
    const result = computePdfDrawRect({ x: 100, y: 50, w: 200, h: 100 }, 1000, 800, 500, 400);

    expect(result.x).toBe(50); // 100 * 0.5
    expect(result.width).toBe(100); // 200 * 0.5
    expect(result.height).toBe(50); // 100 * 0.5
    // y = pageHeight - (item.y + item.h) * scaleY = 400 - (50 + 100) * 0.5 = 400 - 75 = 325
    expect(result.y).toBe(325);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pdfStamping.test.ts`
Expected: FAIL — `Cannot find module './pdfStamping'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeInitialStampSize(
  imgWidth: number,
  imgHeight: number,
  overlayWidth: number,
): { w: number; h: number } {
  const w = Math.round(overlayWidth * 0.15);
  const h = Math.round(imgHeight * (w / imgWidth));
  return { w, h };
}

export function computeInitialSignatureSize(
  imgWidth: number,
  imgHeight: number,
  overlayWidth: number,
  overlayHeight: number,
): { w: number; h: number } {
  const maxW = overlayWidth * 0.35;
  const maxH = overlayHeight * 0.12;
  let w = Math.min(imgWidth, maxW);
  let h = imgHeight * (w / imgWidth);
  if (h > maxH) {
    h = maxH;
    w = imgWidth * (h / imgHeight);
  }
  return { w, h };
}

export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(containerWidth - w, x)),
    y: Math.max(0, Math.min(containerHeight - h, y)),
  };
}

export function computePdfDrawRect(
  item: OverlayRect,
  overlayWidth: number,
  overlayHeight: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scaleX = pageWidth / overlayWidth;
  const scaleY = pageHeight / overlayHeight;
  return {
    x: item.x * scaleX,
    y: pageHeight - (item.y + item.h) * scaleY,
    width: item.w * scaleX,
    height: item.h * scaleY,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pdfStamping.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfStamping.ts src/lib/pdfStamping.test.ts
git commit -m "feat: add pure placement/scaling math for PDF stamping"
```

---

### Task 5: Server actions for seals and signatures

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/actions.ts`
- Test: `src/app/(app)/(admin)/document-stamps/actions.test.ts`

These rely entirely on RLS (the regular authenticated client, not the admin/service-role client) — no manual permission check needed in the action itself, matching the pattern already used by `companies/actions.ts` and `role-profiles/actions.ts` in this codebase (RLS is the enforcement; the admin-client + manual-check pattern in `users/actions.ts` is only needed there because that action uses `createAdminClient()` to call the Auth admin API, which bypasses RLS).

- [ ] **Step 1: Write the failing tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { deleteSeal, deleteSignature, saveSignature, uploadSeal } from "./actions";

function mockSupabase({
  uploadError = null,
  insertError = null,
  removeError = null,
  deleteError = null,
  userId = "user-1",
}: {
  uploadError?: { message: string } | null;
  insertError?: { message: string } | null;
  removeError?: { message: string } | null;
  deleteError?: { message: string } | null;
  userId?: string;
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        remove: vi.fn().mockResolvedValue({ error: removeError }),
      }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: deleteError }),
      }),
    }),
  };
}

function formDataFor(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadSeal", () => {
  it("rejects when required fields are missing", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);

    const result = await uploadSeal(formDataFor({ companyId: "", name: "", file: "" }));

    expect(result.error).toBe("Completa todos los campos");
  });

  it("uploads the file and inserts the row when everything succeeds", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const file = new File(["png-bytes"], "sello.png", { type: "image/png" });

    const result = await uploadSeal(formDataFor({ companyId: "company-1", name: "Sello oficial", file }));

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("company-seals");
    expect(supabase.from).toHaveBeenCalledWith("company_seals");
  });

  it("surfaces the storage error and does not insert a row if upload fails", async () => {
    const supabase = mockSupabase({ uploadError: { message: "upload failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const file = new File(["png-bytes"], "sello.png", { type: "image/png" });

    const result = await uploadSeal(formDataFor({ companyId: "company-1", name: "Sello oficial", file }));

    expect(result.error).toBe("upload failed");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("deleteSeal", () => {
  it("removes the storage object and deletes the row", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteSeal("seal-1", "company-1/123_sello.png");

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("company-seals");
  });
});

describe("saveSignature", () => {
  it("rejects when there is no authenticated user", async () => {
    const supabase = mockSupabase();
    supabase.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveSignature("data:image/png;base64,AAAA");

    expect(result.error).toBe("No autorizado");
  });

  it("uploads the decoded PNG under the user's own folder and inserts the row", async () => {
    const supabase = mockSupabase({ userId: "user-42" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveSignature("data:image/png;base64,AAAA");

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("user-signatures");
    expect(supabase.from).toHaveBeenCalledWith("user_signatures");
  });
});

describe("deleteSignature", () => {
  it("removes the storage object and deletes the row", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteSignature("sig-1", "user-42/firma_123.png");

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("user-signatures");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/(admin)/document-stamps/actions.test.ts"`
Expected: FAIL — `./actions` module not found.

- [ ] **Step 3: Write the implementation**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ActionResult {
  error?: string;
}

export async function uploadSeal(formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const name = String(formData.get("name") ?? "");
  const file = formData.get("file");

  if (!companyId || !name || !(file instanceof File) || file.size === 0) {
    return { error: "Completa todos los campos" };
  }

  const supabase = await createClient();
  const path = `${companyId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("company-seals")
    .upload(path, file, { contentType: file.type || "image/png" });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await supabase.from("company_seals").insert({
    company_id: companyId,
    name,
    storage_path: path,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/document-stamps");
  return {};
}

export async function deleteSeal(id: string, storagePath: string): Promise<ActionResult> {
  const supabase = await createClient();

  await supabase.storage.from("company-seals").remove([storagePath]);

  const { error } = await supabase.from("company_seals").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/document-stamps");
  return {};
}

export async function saveSignature(dataUrl: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  const path = `${user.id}/firma_${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("user-signatures")
    .upload(path, bytes, { contentType: "image/png" });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await supabase.from("user_signatures").insert({
    user_id: user.id,
    storage_path: path,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/document-stamps");
  return {};
}

export async function deleteSignature(id: string, storagePath: string): Promise<ActionResult> {
  const supabase = await createClient();

  await supabase.storage.from("user-signatures").remove([storagePath]);

  const { error } = await supabase.from("user_signatures").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/document-stamps");
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/(admin)/document-stamps/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/actions.ts" "src/app/(app)/(admin)/document-stamps/actions.test.ts"
git commit -m "feat: add server actions for seals and signatures"
```

---

### Task 6: Page shell — permission gate + data fetching

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SealWithUrl {
  id: string;
  name: string;
  storagePath: string;
  companyName: string;
  url: string;
}

export interface SignatureWithUrl {
  id: string;
  storagePath: string;
  url: string;
}

export default async function DocumentStampsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "document_stamps",
  });
  if (!flagsRows?.[0]?.can_add) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  const { data: seals } = await supabase
    .from("company_seals")
    .select("id, name, storage_path, companies(name)")
    .order("name");

  const sealsWithUrls: SealWithUrl[] = await Promise.all(
    (seals ?? []).map(async (s) => {
      const { data } = await supabase.storage
        .from("company-seals")
        .createSignedUrl(s.storage_path, 3600);
      return {
        id: s.id,
        name: s.name,
        storagePath: s.storage_path,
        companyName: (s.companies as unknown as { name: string } | null)?.name ?? "",
        url: data?.signedUrl ?? "",
      };
    }),
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: signatures } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signaturesWithUrls: SignatureWithUrl[] = await Promise.all(
    (signatures ?? []).map(async (s) => {
      const { data } = await supabase.storage
        .from("user-signatures")
        .createSignedUrl(s.storage_path, 3600);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Sellos y Firmas</h1>
      <p className="text-sm text-muted-foreground">
        Carga un PDF, agrégale sellos, firmas o texto, y descárgalo. El documento nunca se sube a
        la plataforma — solo se procesa en tu navegador.
      </p>
    </div>
  );
}
```

This intentionally renders just the header for now — Tasks 7-12 add the actual seal management UI and the PDF tool itself as separate components plugged into this page, so each can be built and reviewed independently.

- [ ] **Step 2: Manual verification**

Run `npm run dev`, log in as a user whose profile has `can_add` on `document_stamps` (Super Admin has it by default per Task 2's seed), visit `/document-stamps`. Expected: page renders with the header and description, no errors. Log in as a user without that permission and confirm visiting `/document-stamps` redirects to `/`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/page.tsx"
git commit -m "feat: add document-stamps page shell with permission gate"
```

---

### Task 7: Seal management UI

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/SealsManager.tsx`
- Modify: `src/app/(app)/(admin)/document-stamps/page.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteSeal, uploadSeal } from "./actions";
import type { SealWithUrl } from "./page";

interface Company {
  id: string;
  name: string;
}

export function SealsManager({
  companies,
  seals,
}: {
  companies: Company[];
  seals: SealWithUrl[];
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo PNG");
      return;
    }

    const formData = new FormData();
    formData.set("companyId", companyId);
    formData.set("name", name);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadSeal(formData);
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  function remove(id: string, storagePath: string) {
    startTransition(async () => {
      await deleteSeal(id, storagePath);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Sellos de empresa</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Empresa">
              {(value: string) => companies.find((c) => c.id === value)?.name ?? "Empresa"}
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
        <Input placeholder="Nombre del sello" value={name} onChange={(e) => setName(e.target.value)} />
        <Input ref={fileInputRef} type="file" accept="image/png" />
        <Button onClick={submit} disabled={isPending || !companyId || !name}>
          Subir
        </Button>
      </div>
      {seals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay sellos todavía.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {seals.map((seal) => (
            <div key={seal.id} className="space-y-1 rounded border p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not a static asset */}
              <img src={seal.url} alt={seal.name} className="mx-auto h-16 object-contain" />
              <p className="truncate text-xs font-medium">{seal.name}</p>
              <p className="truncate text-xs text-muted-foreground">{seal.companyName}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => remove(seal.id, seal.storagePath)}
                disabled={isPending}
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `src/app/(app)/(admin)/document-stamps/page.tsx`, add the import and render it:

```tsx
import { SealsManager } from "./SealsManager";
```

Replace the closing of the returned JSX to include it:

```tsx
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Sellos y Firmas</h1>
      <p className="text-sm text-muted-foreground">
        Carga un PDF, agrégale sellos, firmas o texto, y descárgalo. El documento nunca se sube a
        la plataforma — solo se procesa en tu navegador.
      </p>
      <SealsManager companies={companies ?? []} seals={sealsWithUrls} />
    </div>
  );
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, visit `/document-stamps` as a user with `can_add`, upload a PNG under a company, confirm it appears in the gallery with the company name, and that "Eliminar" removes it.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/SealsManager.tsx" "src/app/(app)/(admin)/document-stamps/page.tsx"
git commit -m "feat: add seal upload/list/delete UI"
```

---

### Task 8: Stamp picker dialog

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/StampPickerDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SealWithUrl } from "./page";

export function StampPickerDialog({
  seals,
  onPick,
}: {
  seals: SealWithUrl[];
  onPick: (seal: SealWithUrl) => void;
}) {
  const [open, setOpen] = useState(false);

  function pick(seal: SealWithUrl) {
    onPick(seal);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Sello</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Elige un sello</DialogTitle>
        </DialogHeader>
        {seals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay sellos disponibles todavía. Súbelos desde la sección &quot;Sellos de
            empresa&quot; más abajo.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {seals.map((seal) => (
              <button
                key={seal.id}
                type="button"
                className="space-y-1 rounded border p-2 text-center hover:bg-muted"
                onClick={() => pick(seal)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
                <img src={seal.url} alt={seal.name} className="mx-auto h-16 object-contain" />
                <p className="truncate text-xs font-medium">{seal.name}</p>
                <p className="truncate text-xs text-muted-foreground">{seal.companyName}</p>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

This manages its own open state (same pattern as `TextItemDialog` and `SignatureDialog`), closing itself immediately after a seal is picked.

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/StampPickerDialog.tsx"
git commit -m "feat: add stamp picker dialog"
```

---

### Task 9: Text item dialog

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/TextItemDialog.tsx`

This ports `showTextModal`/`renderTextToDataUrl` from `app.js` — rendering styled text to an offscreen canvas and returning it as a PNG data URL, so it can be treated identically to a stamp/signature image by the overlay and by pdf-lib.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TextItemResult {
  dataUrl: string;
  width: number;
  height: number;
}

function renderTextToDataUrl(
  text: string,
  fontSize: number,
  color: string,
  bold: boolean,
  italic: boolean,
  underline: boolean,
): { dataUrl: string; width: number; height: number } {
  const dpr = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  let fontStyle = "";
  if (italic) fontStyle += "italic ";
  if (bold) fontStyle += "bold ";
  const font = `${fontStyle}${fontSize * dpr}px Arial, sans-serif`;
  ctx.font = font;

  const lines = text.split("\n");
  let maxW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxW) maxW = m.width;
  }

  const lineH = fontSize * dpr * 1.3;
  const pad = fontSize * dpr * 0.3;
  const ulHeight = underline ? Math.max(3, Math.round(fontSize * dpr * 0.08)) : 0;
  const extraH = underline ? ulHeight * 2 : 0;
  const cw = Math.ceil(maxW + pad * 2);
  const ch = Math.ceil(lines.length * lineH + pad * 2 + extraH);
  canvas.width = cw;
  canvas.height = ch;

  ctx.scale(dpr, dpr);
  ctx.font = `${fontStyle}${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";

  for (let j = 0; j < lines.length; j++) {
    ctx.fillText(lines[j], pad / dpr, (pad + j * lineH) / dpr);
    if (underline) {
      const yPos = (pad + (j + 1) * lineH - lineH * 0.15 + ulHeight) / dpr;
      const m = ctx.measureText(lines[j]);
      ctx.fillRect(pad / dpr, yPos, m.width, ulHeight / dpr);
    }
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: cw / dpr, height: ch / dpr };
}

export function TextItemDialog({ onAdd }: { onAdd: (result: TextItemResult) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(28);
  const [color, setColor] = useState("#000000");
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  function accept() {
    if (!text.trim()) return;
    const { dataUrl, width, height } = renderTextToDataUrl(text, fontSize, color, bold, italic, underline);
    onAdd({ dataUrl, width, height });
    setText("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Texto</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escriba el texto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="text-content">Texto</Label>
            <textarea
              id="text-content"
              className="w-full rounded border p-2 text-sm"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="text-size">Tamaño</Label>
              <Input
                id="text-size"
                type="number"
                min={8}
                max={200}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10) || 28)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="text-color">Color</Label>
              <Input
                id="text-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />
              Negrita
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />
              Cursiva
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={underline}
                onChange={(e) => setUnderline(e.target.checked)}
              />
              Subrayado
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={accept} disabled={!text.trim()}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/TextItemDialog.tsx"
git commit -m "feat: add text item dialog with canvas-rendered styled text"
```

---

### Task 10: Signature dialog (draw + reuse saved signatures)

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/SignatureDialog.tsx`

Ports `showSignModal`/`loadSavedSignatures` from `app.js`. Saved signatures come in as a prop from the server (`page.tsx`, Task 6) — after `saveSignature`/`deleteSignature` succeed, `revalidatePath("/document-stamps")` (already wired in Task 5) refreshes that prop automatically, matching how every other form in this app stays in sync (e.g. `CompanyForm` → `createCompany` → `revalidatePath`).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteSignature, saveSignature } from "./actions";
import type { SignatureWithUrl } from "./page";

export function SignatureDialog({
  signatures,
  onPick,
}: {
  signatures: SignatureWithUrl[];
  onPick: (dataUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(2);
  const [isPending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointCountRef = useRef(0);

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
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
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

  function acceptDrawn() {
    const canvas = canvasRef.current;
    if (!canvas || pointCountRef.current < 3) return;
    const dataUrl = canvas.toDataURL("image/png");
    startTransition(async () => {
      await saveSignature(dataUrl);
      onPick(dataUrl);
      setOpen(false);
      clear();
    });
  }

  function pickSaved(url: string) {
    onPick(url);
    setOpen(false);
  }

  function removeSaved(id: string, storagePath: string) {
    startTransition(async () => {
      await deleteSignature(id, storagePath);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Firma</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Firma</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={440}
            height={160}
            className="w-full rounded border bg-white"
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            onTouchStart={onDown}
            onTouchMove={onMove}
            onTouchEnd={onUp}
          />
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              Grosor
              <input
                type="range"
                min={1}
                max={6}
                value={lineWidth}
                onChange={(e) => setLineWidth(parseFloat(e.target.value))}
              />
            </label>
            <Button variant="outline" size="sm" onClick={clear}>
              Borrar
            </Button>
          </div>
          {signatures.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Firmas guardadas</p>
              <div className="flex flex-wrap gap-2">
                {signatures.map((sig) => (
                  <div key={sig.id} className="relative rounded border p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
                    <img
                      src={sig.url}
                      alt="Firma guardada"
                      className="h-12 cursor-pointer object-contain"
                      onClick={() => pickSaved(sig.url)}
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-xs text-white"
                      onClick={() => removeSaved(sig.id, sig.storagePath)}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={acceptDrawn} disabled={isPending}>
            Usar firma dibujada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/SignatureDialog.tsx"
git commit -m "feat: add signature drawing dialog with saved-signature reuse"
```

---

### Task 11: PDF viewer/editor — the main tool

**Files:**
- Create: `src/app/(app)/(admin)/document-stamps/PdfStamperTool.tsx`

This is the core piece, porting `app.js`'s PDF rendering, item overlay (drag/resize/delete), and pdf-lib save logic into a React component. It uses the pure helpers from Task 4 for all placement math.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { StampPickerDialog } from "./StampPickerDialog";
import { TextItemDialog, type TextItemResult } from "./TextItemDialog";
import { SignatureDialog } from "./SignatureDialog";
import {
  clampPosition,
  computeInitialSignatureSize,
  computeInitialStampSize,
  computePdfDrawRect,
} from "@/lib/pdfStamping";
import type { SealWithUrl, SignatureWithUrl } from "./page";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";

interface PageItem {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function PdfStamperTool({
  seals,
  signatures,
}: {
  seals: SealWithUrl[];
  signatures: SignatureWithUrl[];
}) {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });
  const [items, setItems] = useState<Record<number, PageItem[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Arrastra un PDF o ábrelo con el botón");
  const [nextId, setNextId] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);

  async function renderPage(doc: pdfjsLib.PDFDocumentProxy, pageNum: number) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    setOverlaySize({ width: viewport.width, height: viewport.height });
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  }

  async function loadFile(file: File) {
    setStatus("Cargando PDF...");
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    setPdfBytes(bytes);
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    setPdfDoc(doc);
    setTotalPages(doc.numPages);
    setCurrentPage(1);
    setItems({});
    setSelectedId(null);
    await renderPage(doc, 1);
    setStatus(`PDF cargado: ${file.name}`);
  }

  function goToPage(pageNum: number) {
    if (!pdfDoc || pageNum < 1 || pageNum > totalPages) return;
    setCurrentPage(pageNum);
    renderPage(pdfDoc, pageNum);
  }

  function addItem(item: PageItem) {
    setItems((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] ?? []), item],
    }));
    setSelectedId(item.id);
  }

  async function handlePickStamp(seal: SealWithUrl) {
    const img = await loadImage(seal.url);
    const { w, h } = computeInitialStampSize(img.naturalWidth, img.naturalHeight, overlaySize.width);
    addItem({
      id: `item_${nextId}`,
      dataUrl: seal.url,
      x: (overlaySize.width - w) / 2,
      y: (overlaySize.height - h) / 2,
      w,
      h,
    });
    setNextId((n) => n + 1);
    setStatus("Sello añadido. Arrástralo a la posición deseada.");
  }

  async function handlePickSignature(dataUrl: string) {
    const img = await loadImage(dataUrl);
    const { w, h } = computeInitialSignatureSize(
      img.naturalWidth,
      img.naturalHeight,
      overlaySize.width,
      overlaySize.height,
    );
    addItem({
      id: `item_${nextId}`,
      dataUrl,
      x: (overlaySize.width - w) / 2,
      y: (overlaySize.height - h) / 2,
      w,
      h,
    });
    setNextId((n) => n + 1);
    setStatus("Firma añadida. Arrástrala a la posición deseada.");
  }

  function handleAddText({ dataUrl, width, height }: TextItemResult) {
    const maxW = overlaySize.width * 0.5;
    const w = Math.min(width, maxW);
    const h = height * (w / width);
    addItem({
      id: `item_${nextId}`,
      dataUrl,
      x: (overlaySize.width - w) / 2,
      y: (overlaySize.height - h) / 3,
      w,
      h,
    });
    setNextId((n) => n + 1);
    setStatus("Texto añadido.");
  }

  function deleteSelected() {
    if (!selectedId) return;
    setItems((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] ?? []).filter((i) => i.id !== selectedId),
    }));
    setSelectedId(null);
  }

  function onItemMouseDown(e: React.MouseEvent, item: PageItem) {
    e.preventDefault();
    setSelectedId(item.id);
    dragRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y };
  }

  function onResizeMouseDown(e: React.MouseEvent, item: PageItem) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, origW: item.w, origH: item.h };
  }

  function onOverlayMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const { id, startX, startY, origX, origY } = dragRef.current;
      const pageItems = items[currentPage] ?? [];
      const item = pageItems.find((i) => i.id === id);
      if (!item) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const { x, y } = clampPosition(
        origX + dx,
        origY + dy,
        item.w,
        item.h,
        overlaySize.width,
        overlaySize.height,
      );
      setItems((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] ?? []).map((i) => (i.id === id ? { ...i, x, y } : i)),
      }));
    }
    if (resizeRef.current) {
      const { id, startX, startY, origW, origH } = resizeRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const w = Math.max(20, origW + dx);
      const h = Math.max(20, origH + dy);
      setItems((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] ?? []).map((i) => (i.id === id ? { ...i, w, h } : i)),
      }));
    }
  }

  function onOverlayMouseUp() {
    dragRef.current = null;
    resizeRef.current = null;
  }

  async function downloadPdf() {
    if (!pdfBytes) return;
    const hasItems = Object.values(items).some((pageItems) => pageItems.length > 0);
    if (!hasItems) {
      setStatus("No hay elementos para guardar");
      return;
    }

    setStatus("Generando PDF...");
    const doc = await PDFDocument.load(pdfBytes);

    for (const [pageNumStr, pageItems] of Object.entries(items)) {
      if (pageItems.length === 0) continue;
      const pageNum = parseInt(pageNumStr, 10);
      const page = doc.getPage(pageNum - 1);
      const pageSize = page.getSize();

      for (const item of pageItems) {
        const response = await fetch(item.dataUrl);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const embedded = await doc.embedPng(bytes);
        const rect = computePdfDrawRect(
          item,
          overlaySize.width,
          overlaySize.height,
          pageSize.width,
          pageSize.height,
        );
        page.drawImage(embedded, rect);
      }
    }

    const savedBytes = await doc.save();
    const blob = new Blob([savedBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "documento_sellado.pdf";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("PDF descargado.");
  }

  const currentItems = items[currentPage] ?? [];

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          Abrir PDF
        </Button>
        <StampPickerDialog seals={seals} onPick={handlePickStamp} />
        <TextItemDialog onAdd={handleAddText} />
        <SignatureDialog signatures={signatures} onPick={handlePickSignature} />
        <Button variant="outline" onClick={deleteSelected} disabled={!selectedId}>
          Eliminar elemento
        </Button>
        <Button onClick={downloadPdf} disabled={!pdfDoc}>
          Descargar
        </Button>
      </div>

      {pdfDoc && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            Anterior
          </Button>
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{status}</p>

      <div
        className="relative inline-block"
        onMouseMove={onOverlayMouseMove}
        onMouseUp={onOverlayMouseUp}
        onMouseLeave={onOverlayMouseUp}
      >
        <canvas ref={canvasRef} className="border" />
        {currentItems.map((item) => (
          // eslint-disable-next-line @next/next/no-img-element -- data URL / signed URL overlay item, not a static asset
          <div
            key={item.id}
            className={`absolute border ${item.id === selectedId ? "border-2 border-[#04B1AF]" : "border-transparent"}`}
            style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
            onMouseDown={(e) => onItemMouseDown(e, item)}
          >
            <img src={item.dataUrl} alt="" className="h-full w-full object-contain" draggable={false} />
            <div
              className="absolute -right-1 -bottom-1 h-3 w-3 cursor-se-resize bg-[#04B1AF]"
              onMouseDown={(e) => onResizeMouseDown(e, item)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `src/app/(app)/(admin)/document-stamps/page.tsx`, add the import and render it above `SealsManager`:

```tsx
import { PdfStamperTool } from "./PdfStamperTool";
```

```tsx
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Sellos y Firmas</h1>
      <p className="text-sm text-muted-foreground">
        Carga un PDF, agrégale sellos, firmas o texto, y descárgalo. El documento nunca se sube a
        la plataforma — solo se procesa en tu navegador.
      </p>
      <PdfStamperTool seals={sealsWithUrls} signatures={signaturesWithUrls} />
      <SealsManager companies={companies ?? []} seals={sealsWithUrls} />
    </div>
  );
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, visit `/document-stamps`, click "Abrir PDF" and choose any local PDF file. Confirm:
1. The first page renders in the canvas.
2. Clicking "Sello" shows the seal gallery (upload one first via the seals section below if empty), picking one places it centered on the page.
3. The stamp can be dragged and resized (bottom-right handle) and deleted.
4. "Firma" lets you draw on the canvas and place it; drawn signatures appear in "Firmas guardadas" on reopening the dialog.
5. "Texto" lets you type styled text and places it as an item.
6. "Descargar" produces a PDF file with all placed items visible in the correct positions when opened in a PDF viewer.
7. Multi-page PDFs: items placed on page 1 stay on page 1 when navigating to page 2 and back.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/(admin)/document-stamps/PdfStamperTool.tsx" "src/app/(app)/(admin)/document-stamps/page.tsx"
git commit -m "feat: add PDF viewer/editor tool with stamp, signature, and text placement"
```

---

### Task 12: Sidebar navigation link

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Add the permission to the layout**

In `src/app/(app)/layout.tsx`, add to the `permissions` destructuring and pass a new prop to `AppShell`:

```tsx
      canManageSettings={Boolean(permissions.get("settings")?.can_manage)}
      canUseDocumentStamps={Boolean(permissions.get("document_stamps")?.can_add)}
      onLogout={logout}
```

(Add the new line right after the existing `canManageSettings` line — don't remove anything else in that component call.)

- [ ] **Step 2: Add the prop and nav link to the Sidebar**

In `src/app/(app)/Sidebar.tsx`, add `FileSignature` to the `lucide-react` import list, add `canUseDocumentStamps: boolean;` to both the destructured props and the type annotation (alongside `canManageSettings`), and add a new entry to `mainLinks` (not `settingsLinks`, since this is a working tool, not an admin config screen):

```tsx
  const mainLinks: NavLink[] = [
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canUseDocumentStamps ? [{ href: "/document-stamps", label: "Sellos y Firmas", icon: FileSignature }] : []),
    ...(canManageUsers ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: builds successfully with no TypeScript errors (both files' prop types must match exactly).

- [ ] **Step 4: Manual verification**

Log in as a user with `can_add` on `document_stamps` — confirm "Sellos y Firmas" appears in the sidebar and links to the working page. Log in as a user without it — confirm the link does not appear.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"
git commit -m "feat: add Sellos y Firmas link to sidebar navigation"
```

---

### Task 13: Full end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all unit and integration tests pass, including the new ones from Tasks 2-3-4-5.

- [ ] **Step 2: Run lint and build**

Run: `npm run lint && npm run build`
Expected: no errors (pre-existing `<img>` warning in `ContactForm.tsx` is expected and unrelated).

- [ ] **Step 3: Manual walkthrough**

1. As a Super Admin, visit `/role-profiles` and confirm the "Sellos y Firmas" module row appears with a `can_add` toggle; try granting it to a different profile and confirm a user on that profile now sees the module too.
2. Upload seals for at least two different companies, confirm the gallery shows all of them together with each one's company name.
3. Full stamping flow: open a multi-page PDF, add a seal on page 1, a signature on page 2, and text on page 1; download and open the result to confirm everything appears in the right place on the right pages.
4. Confirm a saved signature persists after closing and reopening the "Firma" dialog, and that deleting it removes it from the list.
5. Confirm `git log` shows one commit per task and `git status` is clean.
