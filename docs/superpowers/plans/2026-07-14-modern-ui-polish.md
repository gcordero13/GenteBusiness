# Modern UI Polish — Sidebar icons/collapse, contacts table, empty states — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app feel more modern and interactive: a collapsible icon-based sidebar, a richer contacts table (avatar, status badge, icon-based email/WhatsApp/edit actions), and proper empty states (icon + message) on every admin list so pages don't look bare before real data exists.

**Architecture:** `Sidebar.tsx` becomes a Client Component (`"use client"`) so it can hold collapse state (persisted to `localStorage`) — it still receives the `onLogout` Server Action as a prop from the Server Component layout and uses it in a `<form action={onLogout}>`, which Next.js explicitly supports (passing Server Actions as props into Client Components). The contacts list and every admin list (`companies`, `departments`, `role-profiles`, `users`) get a conditional empty-state block rendered instead of an empty `<Table>` when their data array has zero items. New shadcn components `avatar` and `badge` (already added to this repo, `src/components/ui/avatar.tsx` / `badge.tsx`) and `lucide-react` icons (already a dependency) are used — no new packages needed.

**Tech Stack:** Next.js (App Router), Tailwind CSS, shadcn/ui (`avatar`, `badge`, `table`, `dialog`, `select` — all already added), `lucide-react` (already a dependency).

**Related spec:** informal — agreed inline during brainstorming (2026-07-14): icon sidebar with collapse-to-icons toggle, richer contacts table (avatar/badge/icons), empty states everywhere data is currently absent.

---

### Task 1: Sidebar — icons + collapsible to icon-only

**Files:**
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Rewrite as a Client Component with collapse state**

`src/app/(app)/Sidebar.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  BookUser,
  Building2,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export function Sidebar({
  email,
  canView,
  canManagePlatform,
  onLogout,
}: {
  email?: string;
  canView: boolean;
  canManagePlatform: boolean;
  onLogout: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "true") {
      setCollapsed(true);
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  const mainLinks: NavLink[] = [
    ...(canView ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canManagePlatform ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];

  const settingsLinks: NavLink[] = canManagePlatform
    ? [
        { href: "/role-profiles", label: "Perfiles de rol", icon: ShieldCheck },
        { href: "/companies", label: "Empresas", icon: Building2 },
        { href: "/departments", label: "Departamentos", icon: Network },
      ]
    : [];

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r bg-card p-3 transition-all duration-150 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {!collapsed && <span className="text-lg font-semibold">GenteBusiness</span>}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>
        <nav className="space-y-1 text-sm">
          {mainLinks.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              title={label}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </a>
          ))}
          {settingsLinks.length > 0 && (
            <div className="space-y-1 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Settings className="size-3.5" />
                  Ajustes
                </p>
              )}
              {settingsLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  title={label}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </a>
              ))}
            </div>
          )}
        </nav>
      </div>
      <div className="space-y-2">
        {!collapsed && <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>}
        <form action={onLogout}>
          <Button
            type="submit"
            variant="outline"
            className={collapsed ? "w-full px-0" : "w-full justify-start gap-2"}
            title="Cerrar sesión"
          >
            <LogOut className="size-4" />
            {!collapsed && <span>Cerrar sesión</span>}
          </Button>
        </form>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Manual verification (adapted, see override below)**

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/Sidebar.tsx
git commit -m "feat: make sidebar collapsible with icons"
```

#### Override for Step 2

Cannot browser-test interactively. Run `npx tsc --noEmit` (no errors expected) and confirm via curl that `/` still responds (redirect without a session cookie, not a crash — the sidebar only renders once authenticated, but a crash in the component would still surface as a 500 rather than a 307). Note the collapse toggle itself needs the human's browser to click and confirm.

---

### Task 2: Contacts table — avatar, status badge, icon actions, empty state

**Files:**
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Rewrite the page**

`src/app/(app)/contacts/page.tsx`:
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BookUser, Mail, MessageCircle, Pencil } from "lucide-react";
import { escapeIlikePattern, getUpcomingBirthdays, whatsappUrl } from "@/lib/contacts";
import { SearchFilters } from "./SearchFilters";
import { BirthdaysWidget } from "./BirthdaysWidget";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    company?: string;
    department?: string;
    showInactive?: string;
  }>;
}) {
  const { q, company, department, showInactive } = await searchParams;

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  let query = supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, position, company_id, department_id, status, fleet_phone, has_whatsapp, birth_date, photo_url, companies(name), departments(name)",
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
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");

  const birthdayContacts = getUpcomingBirthdays(
    (contacts ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      birth_date: c.birth_date,
    })),
    new Date(),
    5,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Agenda de contactos</h1>
        {flags.can_add && (
          <a href="/contacts/new" className="text-sm underline">
            Nuevo contacto
          </a>
        )}
      </div>
      <BirthdaysWidget contacts={birthdayContacts} />
      <SearchFilters
        companies={companies ?? []}
        departments={departments ?? []}
        canSeeInactiveToggle={Boolean(flags.can_deactivate || flags.can_delete)}
      />
      {(contacts ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <BookUser className="size-8" />
          <p className="text-sm">No hay contactos todavía.</p>
          {flags.can_add && (
            <p className="text-xs">Crea el primero con el botón &quot;Nuevo contacto&quot;.</p>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Flota</TableHead>
              <TableHead>Puesto</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(contacts ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={c.photo_url ?? undefined} alt="" />
                      <AvatarFallback>
                        {`${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <a href={`/contacts/${c.id}`} className="underline">
                      {c.first_name} {c.last_name}
                    </a>
                  </div>
                </TableCell>
                <TableCell>
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 underline"
                    >
                      <Mail className="size-3.5" />
                      {c.email}
                    </a>
                  )}
                </TableCell>
                <TableCell>
                  {c.fleet_phone &&
                    (c.has_whatsapp ? (
                      <a
                        href={whatsappUrl(c.fleet_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        <MessageCircle className="size-3.5" />
                        {c.fleet_phone}
                      </a>
                    ) : (
                      c.fleet_phone
                    ))}
                </TableCell>
                <TableCell>{c.position}</TableCell>
                <TableCell>{(c.companies as unknown as { name: string })?.name}</TableCell>
                <TableCell>{(c.departments as unknown as { name: string })?.name}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>
                    {c.status === "active" ? "Activo" : "Anulado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <a href={`/contacts/${c.id}`} title="Editar">
                    <Pencil className="size-4 text-muted-foreground hover:text-foreground" />
                  </a>
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

Note: this reuses `escapeIlikePattern` (security fix already committed earlier in Plan 2) and `photo_url` (new column added to the `select()` — the `contacts` table already has this column since Plan 1 Task 10).

- [ ] **Step 2: Manual verification (adapted, see override below)**

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/contacts/page.tsx
git commit -m "feat: add avatar, status badge, icon actions, and empty state to contacts table"
```

#### Override for Step 2

Cannot browser-test interactively. Run `npx tsc --noEmit` and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contacts` (expect a redirect, not a crash). Note the empty-state message (no contacts exist yet) and the full avatar/badge/icon rendering are deferred to the human's later pass once they've created at least one contact.

---

### Task 3: Empty states for the other admin lists

**Files:**
- Modify: `src/app/(app)/(admin)/companies/page.tsx`
- Modify: `src/app/(app)/(admin)/departments/page.tsx`
- Modify: `src/app/(app)/(admin)/role-profiles/page.tsx`
- Modify: `src/app/(app)/(admin)/users/page.tsx`

- [ ] **Step 1: Companies — add empty state**

In `src/app/(app)/(admin)/companies/page.tsx`, import `Building2` from `lucide-react`, and wrap the existing `<Table>` in a conditional:
```tsx
{(companies ?? []).length === 0 ? (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
    <Building2 className="size-8" />
    <p className="text-sm">No hay empresas todavía.</p>
    <p className="text-xs">Crea la primera con el botón &quot;Nueva empresa&quot;.</p>
  </div>
) : (
  <Table>
    {/* ...unchanged existing Table/TableHeader/TableBody content... */}
  </Table>
)}
```

- [ ] **Step 2: Departments — add empty state (same pattern, `Network` icon, "No hay departamentos todavía.")**

- [ ] **Step 3: Role profiles — add empty state (same pattern, `ShieldCheck` icon, "No hay perfiles de rol todavía." — in practice this list is never empty after the seed migration, but the guard costs nothing and protects against a future manual deletion)**

- [ ] **Step 4: Users — add empty state (same pattern, `Users` icon from lucide-react, "No hay usuarios todavía." — in practice always has at least the bootstrap Super Admin, same defensive reasoning as Step 3)**

- [ ] **Step 5: Manual verification (adapted, see override below)**

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/(admin)/companies/page.tsx src/app/(app)/(admin)/departments/page.tsx src/app/(app)/(admin)/role-profiles/page.tsx src/app/(app)/(admin)/users/page.tsx
git commit -m "feat: add empty states to companies, departments, role profiles, and users lists"
```

#### Override for Step 5

Cannot browser-test interactively. Run `npx tsc --noEmit` and curl all four routes (expect redirects, not crashes). Note that `/companies` and `/departments` are currently actually empty (no data created yet), so a human checking in their browser should genuinely see the new empty-state message there; `/role-profiles` and `/users` already have data (the 3 seeded profiles, the bootstrap admin) so their empty-state branch won't be visually exercised right now — that's expected, not a bug.

---

### Task 4: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** `npm test` — expect all tests still passing (no business logic touched).
- [ ] **Step 2:** `npx tsc --noEmit` — expect clean.
- [ ] **Step 3:** Smoke-curl `/`, `/login`, `/contacts`, `/companies`, `/departments`, `/role-profiles`, `/users` — all should respond with their expected status code, no 500s.
