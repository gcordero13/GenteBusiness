# Modernización Visual — Tema global, tablas y modales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the teal brand accent (already used on `/login`) to the whole app via shared theme tokens, and convert the four simple admin CRUD screens (Companies, Departments, Role Profiles, Users) from bare `<ul>`/plain `<table>` + always-visible inline forms into shadcn `Table` listings with a "create" action that opens in a `Dialog` modal instead of an inline form. Contacts (more fields: photo, supervisor) stays as its own page per the user's explicit choice — not touched by this plan.

**Architecture:** Theme change is a single edit to `src/app/globals.css`'s CSS custom properties (`--primary`, `--primary-foreground`, `--ring`) — every shadcn component already reads these tokens (`bg-primary`, `focus-visible:ring-ring`), so this one edit re-colors buttons/focus-rings app-wide with zero per-component changes. `/login` is unaffected (it already hardcodes its own explicit hex classes for its dark-card look, unrelated to these tokens). Each admin section's existing `*Form.tsx` client component is extended in place to own its own `open` state and render itself inside a `Dialog`/`DialogTrigger`/`DialogContent` (from the shadcn `dialog` component, already added to this repo — uses `@base-ui/react/dialog`, confirmed `open`/`onOpenChange` props match standard usage) rather than being a separate always-visible form — no new wrapper files. Each section's `page.tsx` swaps its `<ul>`/plain `<table>` for the shadcn `Table` primitives (already added, `src/components/ui/table.tsx`).

**Tech Stack:** Next.js (App Router), Tailwind CSS, shadcn/ui (`dialog`, `table`, `select` — all already added to this repo).

**Related spec:** informal — agreed inline during brainstorming (2026-07-14): apply teal accent app-wide (recommended option chosen), modals for Companies/Departments/Role Profiles/Users (contacts stays a full page).

---

### Task 1: Extend the brand accent to the global theme tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update the primary/ring tokens**

In `src/app/globals.css`, in the `:root` block, change:
```css
--primary: oklch(0.205 0 0);
--primary-foreground: oklch(0.985 0 0);
```
to:
```css
--primary: #04b1af;
--primary-foreground: #ffffff;
```
and change:
```css
--ring: oklch(0.708 0 0);
```
to:
```css
--ring: #04b1af;
```

In the `.dark` block, apply the same replacement to `--primary`, `--primary-foreground`, and `--ring` (currently `oklch(0.922 0 0)` / `oklch(0.205 0 0)` / `oklch(0.556 0 0)` respectively) — same three lines, same new values, so the accent stays consistent if dark mode is ever toggled on. Do not touch any other token (background/foreground/card/etc. stay as they are — this plan only changes the accent color, not the whole palette).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (should be unaffected — this is a CSS-only change, but confirms nothing else broke). Then, with the dev server running, curl a couple of pages to confirm no crash: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` and `http://localhost:3000/login`.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: extend teal brand accent to global theme tokens"
```

---

### Task 2: Companies — table + modal

**Files:**
- Modify: `src/app/(app)/(admin)/companies/page.tsx`
- Modify: `src/app/(app)/(admin)/companies/CompanyForm.tsx`

- [ ] **Step 1: Rewrite the form as a self-contained dialog**

`src/app/(app)/(admin)/companies/CompanyForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
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
import { createCompany } from "./actions";

export function CompanyForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createCompany(name);
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Nueva empresa</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva empresa</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre de la empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rewrite the page to use a table and move the form next to the heading**

`src/app/(app)/(admin)/companies/page.tsx`:
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
import { CompanyForm } from "./CompanyForm";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empresas</h1>
        <CompanyForm />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(companies ?? []).map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (adapted, see override below)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/(admin)/companies/page.tsx src/app/(app)/(admin)/companies/CompanyForm.tsx
git commit -m "feat: convert companies admin page to table + modal form"
```

#### Override for Step 3 (Manual Verification)

Cannot browser-test interactively. Instead: run `npx tsc --noEmit` (no errors expected), and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/companies` (expect a redirect, not a crash, since curl carries no session). Note full manual verification (opening the dialog, creating a company, seeing the table update) is deferred to the human's later pass.

---

### Task 3: Departments — table + modal (with a proper Select for company)

**Files:**
- Modify: `src/app/(app)/(admin)/departments/page.tsx`
- Modify: `src/app/(app)/(admin)/departments/DepartmentForm.tsx`

- [ ] **Step 1: Rewrite the form as a self-contained dialog, replacing the raw `<select>` with the shadcn `Select`**

`src/app/(app)/(admin)/departments/DepartmentForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
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
import { createDepartment } from "./actions";

interface Company {
  id: string;
  name: string;
}

export function DepartmentForm({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createDepartment(name, companyId);
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Nuevo departamento</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo departamento</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre del departamento"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona una empresa" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name || !companyId}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rewrite the page to use a table**

`src/app/(app)/(admin)/departments/page.tsx`:
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
import { DepartmentForm } from "./DepartmentForm";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, companies(name)")
    .order("name");
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Departamentos</h1>
        <DepartmentForm companies={companies ?? []} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Empresa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(departments ?? []).map((d) => (
            <TableRow key={d.id}>
              <TableCell>{d.name}</TableCell>
              <TableCell>{(d.companies as unknown as { name: string })?.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (same override pattern as Task 2, applied to `/departments`)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/(admin)/departments/page.tsx src/app/(app)/(admin)/departments/DepartmentForm.tsx
git commit -m "feat: convert departments admin page to table + modal form"
```

---

### Task 4: Role profiles — table + modal

**Files:**
- Modify: `src/app/(app)/(admin)/role-profiles/page.tsx`
- Modify: `src/app/(app)/(admin)/role-profiles/RoleProfileForm.tsx`

- [ ] **Step 1: Rewrite the form as a self-contained dialog (checkboxes unchanged, just wrapped)**

`src/app/(app)/(admin)/role-profiles/RoleProfileForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
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
import { saveRoleProfile } from "./actions";

const FLAG_KEYS = [
  "can_view",
  "can_add",
  "can_edit",
  "can_delete",
  "can_deactivate",
  "can_manage_platform",
] as const;

const FLAG_LABELS: Record<(typeof FLAG_KEYS)[number], string> = {
  can_view: "Ver",
  can_add: "Agregar",
  can_edit: "Editar",
  can_delete: "Eliminar",
  can_deactivate: "Anular",
  can_manage_platform: "Gestionar plataforma",
};

export function RoleProfileForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [flags, setFlags] = useState<Record<(typeof FLAG_KEYS)[number], boolean>>({
    can_view: false,
    can_add: false,
    can_edit: false,
    can_delete: false,
    can_deactivate: false,
    can_manage_platform: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveRoleProfile({ name, ...flags });
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Nuevo perfil</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo perfil de rol</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre del perfil"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 text-sm">
          {FLAG_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              {FLAG_LABELS[key]}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            Crear perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rewrite the page to use a table with checkmark columns instead of raw `true`/`false` text**

`src/app/(app)/(admin)/role-profiles/page.tsx`:
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
import { RoleProfileForm } from "./RoleProfileForm";

export default async function RoleProfilesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: profiles } = await supabase.from("role_profiles").select("*").order("name");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Perfiles de rol</h1>
        <RoleProfileForm />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Ver</TableHead>
            <TableHead>Agregar</TableHead>
            <TableHead>Editar</TableHead>
            <TableHead>Eliminar</TableHead>
            <TableHead>Anular</TableHead>
            <TableHead>Gestiona</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell>{profile.can_view ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_add ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_edit ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_delete ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_deactivate ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_manage_platform ? "✓" : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (same override pattern, applied to `/role-profiles`)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/(admin)/role-profiles/page.tsx src/app/(app)/(admin)/role-profiles/RoleProfileForm.tsx
git commit -m "feat: convert role profiles admin page to table + modal form"
```

---

### Task 5: Users — table + modal

**Files:**
- Modify: `src/app/(app)/(admin)/users/page.tsx`
- Modify: `src/app/(app)/(admin)/users/InviteUserForm.tsx`

- [ ] **Step 1: Rewrite the form as a self-contained dialog, replacing the raw `<select>` with the shadcn `Select`**

`src/app/(app)/(admin)/users/InviteUserForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
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
import { inviteUser } from "./actions";

interface Profile {
  id: string;
  name: string;
}

export function InviteUserForm({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleProfileId, setRoleProfileId] = useState(profiles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await inviteUser({ email, roleProfileId });
      setError(result.error ?? null);
      if (!result.error) {
        setEmail("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Invitar usuario</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="correo@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select value={roleProfileId} onValueChange={(v) => setRoleProfileId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona un perfil" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !email || !roleProfileId}>
            Invitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rewrite the page to use the shadcn `Table` instead of a plain `<table>`**

`src/app/(app)/(admin)/users/page.tsx`:
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
import { InviteUserForm } from "./InviteUserForm";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];

  if (!flags?.can_manage_platform) {
    redirect("/");
  }

  const { data: users } = await supabase
    .from("app_users")
    .select("id, email, full_name, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <InviteUserForm profiles={profiles ?? []} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Correo</TableHead>
            <TableHead>Perfil</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(users ?? []).map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{(u.role_profiles as unknown as { name: string })?.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (same override pattern, applied to `/users`)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/(admin)/users/page.tsx src/app/(app)/(admin)/users/InviteUserForm.tsx
git commit -m "feat: convert users admin page to table + modal form"
```

---

### Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test` — expected all tests still pass (this plan touches no server actions, RLS, or business logic, only presentation).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 3: Smoke-curl every touched route**

`/companies`, `/departments`, `/role-profiles`, `/users`, plus `/` and `/login` for good measure — all should respond with their expected redirect/200, no 500s.
