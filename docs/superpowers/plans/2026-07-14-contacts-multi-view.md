# Agenda de Contactos — Múltiples Vistas (Tabla / Tarjetas / Agrupado / Organigrama) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/contacts` four interchangeable views over the same filtered contact list — the existing Table, a photo-forward Card/grid view, a Grouped-by-company view (collapsible sections), and an Org Chart view (expandable hierarchy based on `reports_to_id`) — switchable via a small view-switcher that preserves the current search/filter query params.

**Architecture:** `page.tsx` keeps doing the single data fetch (unchanged filtering logic) and now also reads a `view` search param (`table` | `cards` | `grouped` | `org`, default `table`). The existing inline table JSX is extracted into `ContactsTable.tsx` (pure presentational, same markup as today — a refactor, not a behavior change) so all four view components are peers of equal size or `page.tsx` becomes tiny. `ContactsCards.tsx` and `ContactsGrouped.tsx` reuse `ContactsTable`/the same row content patterns. `ContactsOrgChart.tsx` uses a new pure, unit-tested `buildOrgTree()` helper in `src/lib/contacts.ts` (same file as the existing `getUpcomingBirthdays`/`whatsappUrl`/`escapeIlikePattern` helpers) to turn the flat `reports_to_id` relationship into a nested tree, rendered with native `<details>`/`<summary>` (no new JS state needed — the browser handles expand/collapse). The view switcher is computed server-side in `page.tsx` (plain `<a>` links with query strings built from the already-destructured search params) — no client component needed for it.

**Tech Stack:** Next.js (App Router), Tailwind CSS, shadcn/ui (`table`, `avatar`, `badge` — all already added), `lucide-react` (already a dependency), Vitest for the new pure-function tests.

**Related spec:** builds on `docs/superpowers/specs/2026-07-13-agenda-telefonica-design.md`'s "Árbol organizacional" section (previously deferred to "Plan 3" — the user has now asked for it directly, so it's pulled forward into this plan) plus the freshly agreed Card and Grouped views.

---

### Task 1: `buildOrgTree` pure helper (TDD)

**Files:**
- Modify: `src/lib/contacts.ts`
- Modify: `src/lib/contacts.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/contacts.test.ts` (append, don't remove existing tests):
```typescript
import { buildOrgTree } from "./contacts";

describe("buildOrgTree", () => {
  it("nests a simple chain of supervisors", () => {
    const contacts = [
      { id: "a", name: "Ana (CEO)", position: "CEO", reports_to_id: null },
      { id: "b", name: "Beto (Gerente)", position: "Gerente", reports_to_id: "a" },
      { id: "c", name: "Carla (Analista)", position: "Analista", reports_to_id: "b" },
    ];

    const tree = buildOrgTree(contacts);

    expect(tree).toHaveLength(1);
    expect(tree[0].contact.id).toBe("a");
    expect(tree[0].reports).toHaveLength(1);
    expect(tree[0].reports[0].contact.id).toBe("b");
    expect(tree[0].reports[0].reports).toHaveLength(1);
    expect(tree[0].reports[0].reports[0].contact.id).toBe("c");
  });

  it("supports multiple roots when several contacts have no supervisor", () => {
    const contacts = [
      { id: "a", name: "Ana", position: null, reports_to_id: null },
      { id: "b", name: "Beto", position: null, reports_to_id: null },
    ];

    const tree = buildOrgTree(contacts);

    expect(tree.map((n) => n.contact.id).sort()).toEqual(["a", "b"]);
  });

  it("treats a contact whose supervisor is not in the list as a root", () => {
    const contacts = [
      { id: "a", name: "Ana", position: null, reports_to_id: "ghost-id-not-present" },
    ];

    const tree = buildOrgTree(contacts);

    expect(tree).toHaveLength(1);
    expect(tree[0].contact.id).toBe("a");
  });

  it("does not infinite-loop on a cyclic reports_to_id (defensive, shouldn't happen via the UI)", () => {
    const contacts = [
      { id: "a", name: "Ana", position: null, reports_to_id: "b" },
      { id: "b", name: "Beto", position: null, reports_to_id: "a" },
    ];

    expect(() => buildOrgTree(contacts)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: FAIL — `buildOrgTree` is not exported yet.

- [ ] **Step 3: Implement**

Add to `src/lib/contacts.ts`:
```typescript
export interface OrgTreeContact {
  id: string;
  name: string;
  position: string | null;
  reports_to_id: string | null;
}

export interface OrgTreeNode<T> {
  contact: T;
  reports: OrgTreeNode<T>[];
}

export function buildOrgTree<T extends OrgTreeContact>(contacts: T[]): OrgTreeNode<T>[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];

  for (const contact of contacts) {
    const supervisorId = contact.reports_to_id;
    if (supervisorId && byId.has(supervisorId)) {
      const list = childrenOf.get(supervisorId) ?? [];
      list.push(contact);
      childrenOf.set(supervisorId, list);
    } else {
      roots.push(contact);
    }
  }

  function toNode(contact: T, ancestors: Set<string>): OrgTreeNode<T> {
    const children = (childrenOf.get(contact.id) ?? [])
      .filter((child) => !ancestors.has(child.id))
      .map((child) => toNode(child, new Set(ancestors).add(contact.id)));
    return { contact, reports: children };
  }

  return roots.map((c) => toNode(c, new Set()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contacts.ts src/lib/contacts.test.ts
git commit -m "feat: add buildOrgTree helper for the org chart view"
```

---

### Task 2: Extract `ContactsTable` (pure refactor, no behavior change)

**Files:**
- Create: `src/app/(app)/contacts/ContactsTable.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Create `ContactsTable.tsx` with exactly the table markup currently inline in `page.tsx`**

`src/app/(app)/contacts/ContactsTable.tsx`:
```tsx
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
import { Mail, MessageCircle, Pencil } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  position: string | null;
  status: string;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  photo_url: string | null;
  companies: { name: string } | null;
  departments: { name: string } | null;
}

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  return (
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
        {contacts.map((c) => (
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
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 underline">
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
            <TableCell>{c.companies?.name}</TableCell>
            <TableCell>{c.departments?.name}</TableCell>
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
  );
}
```

Note the `companies`/`departments` prop types are now plain `{ name: string } | null` instead of the `as unknown as { name: string }` cast used inline before — `page.tsx` will map the raw Supabase rows into this shape when calling `ContactsTable`, keeping the cast in one place instead of scattered across every view.

- [ ] **Step 2: Update `page.tsx` to use it, keeping the empty-state branch**

In `src/app/(app)/contacts/page.tsx`, replace the inline `<Table>...</Table>` block (and its surrounding empty-state conditional) with:
```tsx
import { ContactsTable, type ContactRow } from "./ContactsTable";
// ...
const contactRows: ContactRow[] = (contacts ?? []).map((c) => ({
  id: c.id,
  first_name: c.first_name,
  last_name: c.last_name,
  email: c.email,
  position: c.position,
  status: c.status,
  fleet_phone: c.fleet_phone,
  has_whatsapp: c.has_whatsapp,
  photo_url: c.photo_url,
  companies: (c.companies as unknown as { name: string } | null) ?? null,
  departments: (c.departments as unknown as { name: string } | null) ?? null,
}));
// ...
{contactRows.length === 0 ? (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
    <BookUser className="size-8" />
    <p className="text-sm">No hay contactos todavía.</p>
    {flags.can_add && (
      <p className="text-xs">Crea el primero con el botón &quot;Nuevo contacto&quot;.</p>
    )}
  </div>
) : (
  <ContactsTable contacts={contactRows} />
)}
```
Remove the now-unused `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow`/`Avatar`/`AvatarFallback`/`AvatarImage`/`Badge`/`Mail`/`MessageCircle`/`Pencil` imports from `page.tsx` (they now live inside `ContactsTable.tsx`) — keep `BookUser` (used by the empty state) and `whatsappUrl`/`getUpcomingBirthdays`/`escapeIlikePattern` (still used directly in `page.tsx`'s query-building and birthdays widget).

- [ ] **Step 3: Verify (adapted, see override below)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/contacts/ContactsTable.tsx src/app/(app)/contacts/page.tsx
git commit -m "refactor: extract ContactsTable component from contacts page"
```

#### Override for Step 3

Run `npx tsc --noEmit` (no errors expected — this is a pure refactor) and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contacts` (expect a redirect, not a crash).

---

### Task 3: Card/grid view + view switcher

**Files:**
- Create: `src/app/(app)/contacts/ContactsCards.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Create the card view**

`src/app/(app)/contacts/ContactsCards.tsx`:
```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import type { ContactRow } from "./ContactsTable";

export function ContactsCards({ contacts }: { contacts: ContactRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {contacts.map((c) => (
        <div
          key={c.id}
          className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-shadow hover:shadow-md"
        >
          <Avatar className="size-16">
            <AvatarImage src={c.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-lg">
              {`${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <a href={`/contacts/${c.id}`} className="font-medium underline">
            {c.first_name} {c.last_name}
          </a>
          {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
          <p className="text-xs text-muted-foreground">
            {c.companies?.name}
            {c.companies?.name && c.departments?.name ? " · " : ""}
            {c.departments?.name}
          </p>
          <Badge variant={c.status === "active" ? "default" : "secondary"}>
            {c.status === "active" ? "Activo" : "Anulado"}
          </Badge>
          <div className="flex gap-3 pt-1">
            {c.email && (
              <a href={`mailto:${c.email}`} title={c.email}>
                <Mail className="size-4 text-muted-foreground hover:text-foreground" />
              </a>
            )}
            {c.fleet_phone && c.has_whatsapp && (
              <a href={whatsappUrl(c.fleet_phone)} target="_blank" rel="noopener noreferrer" title={c.fleet_phone}>
                <MessageCircle className="size-4 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire the view switcher and `view=cards` into `page.tsx`**

In `src/app/(app)/contacts/page.tsx`:
- Add `view?: string` to the `searchParams` type and destructure it: `const { q, company, department, showInactive, view } = await searchParams;`
- Add a helper right after destructuring:
```tsx
const activeView = view === "cards" ? "cards" : "table";
function viewHref(target: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (company) params.set("company", company);
  if (department) params.set("department", department);
  if (showInactive) params.set("showInactive", showInactive);
  params.set("view", target);
  return `/contacts?${params.toString()}`;
}
```
- Add a small switcher above `SearchFilters` (or beside the heading):
```tsx
<div className="flex gap-1 text-sm">
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
</div>
```
- Replace the final render branch (from Task 2) so it picks the component by `activeView`:
```tsx
{contactRows.length === 0 ? (
  /* ...unchanged empty state... */
) : activeView === "cards" ? (
  <ContactsCards contacts={contactRows} />
) : (
  <ContactsTable contacts={contactRows} />
)}
```
(Task 4 and Task 5 will extend this same `activeView`/switcher pattern with `"grouped"` and `"org"` — don't hardcode only two options in a way that's awkward to extend; a simple `if/else if` chain or small `Record` lookup is fine.)

- [ ] **Step 3: Verify (same override pattern as Task 2, applied to `/contacts?view=cards`)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/contacts/ContactsCards.tsx src/app/(app)/contacts/page.tsx
git commit -m "feat: add card/grid view and view switcher to contacts page"
```

---

### Task 4: Grouped-by-company view

**Files:**
- Create: `src/app/(app)/contacts/ContactsGrouped.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Create the grouped view (collapsible `<details>` sections, one per company, reusing `ContactsTable` inside each)**

`src/app/(app)/contacts/ContactsGrouped.tsx`:
```tsx
import { ContactsTable, type ContactRow } from "./ContactsTable";

export function ContactsGrouped({ contacts }: { contacts: ContactRow[] }) {
  const groups = new Map<string, ContactRow[]>();
  for (const contact of contacts) {
    const key = contact.companies?.name ?? "Sin empresa";
    const list = groups.get(key) ?? [];
    list.push(contact);
    groups.set(key, list);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      {sortedGroups.map(([companyName, groupContacts]) => (
        <details key={companyName} open className="rounded-lg border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            {companyName} ({groupContacts.length})
          </summary>
          <div className="border-t p-2">
            <ContactsTable contacts={groupContacts} />
          </div>
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire `view=grouped` into `page.tsx`**

Add a third switcher link (`viewHref("grouped")`, label "Agrupado"), extend `activeView` to also allow `"grouped"` (`view === "cards" ? "cards" : view === "grouped" ? "grouped" : view === "org" ? "org" : "table"` — go ahead and write the full 4-way ternary now even though Task 5 hasn't added `"org"` yet, so you don't have to touch this line again in Task 5), and extend the final render branch with an `activeView === "grouped"` case rendering `<ContactsGrouped contacts={contactRows} />`.

- [ ] **Step 3: Verify (same override pattern, applied to `/contacts?view=grouped`)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/contacts/ContactsGrouped.tsx src/app/(app)/contacts/page.tsx
git commit -m "feat: add grouped-by-company view to contacts page"
```

---

### Task 5: Org chart view

**Files:**
- Create: `src/app/(app)/contacts/ContactsOrgChart.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Create the org chart view using `buildOrgTree` (Task 1)**

`src/app/(app)/contacts/ContactsOrgChart.tsx`:
```tsx
import { buildOrgTree, type OrgTreeNode } from "@/lib/contacts";

interface OrgContact {
  id: string;
  name: string;
  position: string | null;
  reports_to_id: string | null;
}

function OrgNode({ node }: { node: OrgTreeNode<OrgContact> }) {
  return (
    <li>
      <details open>
        <summary className="cursor-pointer py-1 text-sm">
          <a href={`/contacts/${node.contact.id}`} className="underline">
            {node.contact.name}
          </a>
          {node.contact.position && (
            <span className="text-muted-foreground"> — {node.contact.position}</span>
          )}
        </summary>
        {node.reports.length > 0 && (
          <ul className="ml-4 space-y-1 border-l pl-4">
            {node.reports.map((child) => (
              <OrgNode key={child.contact.id} node={child} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

export function ContactsOrgChart({
  contacts,
}: {
  contacts: { id: string; first_name: string; last_name: string; position: string | null; reports_to_id: string | null }[];
}) {
  const tree = buildOrgTree(
    contacts.map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      position: c.position,
      reports_to_id: c.reports_to_id,
    })),
  );

  if (tree.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No hay relaciones de supervisor definidas todavía.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {tree.map((node) => (
        <OrgNode key={node.contact.id} node={node} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Add `reports_to_id` to the query and wire `view=org` into `page.tsx`**

- The `.select(...)` call in `page.tsx` must add `reports_to_id` to its column list (it's on the `contacts` table since Plan 1 Task 10, just not currently selected).
- Add `reports_to_id: string | null` to the `contactRows` mapping (Task 2's mapping) so `ContactsOrgChart` (and future consumers) can use it — note `ContactsTable`/`ContactsCards`/`ContactsGrouped` simply ignore the extra field, no changes needed there.
- Add the fourth switcher link (`viewHref("org")`, label "Organigrama") and finish the 4-way `activeView` ternary from Task 4.
- Extend the final render branch with an `activeView === "org"` case rendering `<ContactsOrgChart contacts={contactRows} />`.

- [ ] **Step 3: Verify (same override pattern, applied to `/contacts?view=org`)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/contacts/ContactsOrgChart.tsx src/app/(app)/contacts/page.tsx
git commit -m "feat: add org chart view to contacts page"
```

---

### Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** `npm test` — expect all tests passing, including the new `buildOrgTree` tests.
- [ ] **Step 2:** `npx tsc --noEmit` — expect clean.
- [ ] **Step 3:** Smoke-curl `/contacts`, `/contacts?view=cards`, `/contacts?view=grouped`, `/contacts?view=org` — all should respond with a redirect (no session via curl), not a 500.
