# Solicitudes de Vacaciones — Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the already-working `/solicitudes/vacaciones` page (hero banner, sidebar profile card, icon-badge summary cards, pill-badge table) to match the user-approved mockups, with zero changes to data-fetching, business logic, or existing prop contracts beyond one additive optional prop.

**Architecture:** One new presentational component (`SolicitudesHeroBanner`), three restyled components with unchanged props (`SolicitudesProfileHeader`, `SolicitudesSummaryCards`, `SolicitudesTable`), one additive prop on `NewVacationRequestDialog`, and a `page.tsx` layout rewire. No new queries, no schema changes, no new test files (pure styling pass — see Testing section of the spec).

**Tech Stack:** Next.js 16 App Router, React Server Components, Tailwind v4 (CSS-token based, no `tailwind.config.*`), shadcn/base-ui components, lucide-react icons, Bun (never npm/npx/node).

**Spec:** `docs/superpowers/specs/2026-11-04-solicitudes-visual-redesign-design.md` (commit `526d080`)

---

## Task 1: Add `triggerClassName` prop + icon to `NewVacationRequestDialog`

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx`

Current full file content (153 lines) — relevant lines for this task are the import block (lines 1–15), the function signature (line 27), and the trigger (line 99):

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
import { createVacationRequest, type SolicitudTipo } from "./actions";
```

- [ ] **Step 1: Add the `Plus` icon import**

Change the import block to add a new `lucide-react` import right after the `"use client"` line:

```tsx
"use client";

import { Plus } from "lucide-react";
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
import { createVacationRequest, type SolicitudTipo } from "./actions";
```

- [ ] **Step 2: Add the `triggerClassName` prop to the function signature**

Find:

```tsx
export function NewVacationRequestDialog() {
```

Replace with:

```tsx
export function NewVacationRequestDialog({ triggerClassName }: { triggerClassName?: string } = {}) {
```

- [ ] **Step 3: Use the prop and add the `Plus` icon on the trigger button**

Find:

```tsx
      <DialogTrigger render={<Button>Nueva solicitud</Button>} />
```

Replace with:

```tsx
      <DialogTrigger
        render={
          <Button className={triggerClassName}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva solicitud
          </Button>
        }
      />
```

- [ ] **Step 4: Verify the file compiles and lints clean**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones/NewVacationRequestDialog.tsx`
Expected: no errors.

- [ ] **Step 5: Manually confirm nothing else calls this component with positional args**

Run: `grep -rn "NewVacationRequestDialog" src --include=*.tsx`
Expected: only `NewVacationRequestDialog.tsx` (the definition) and `page.tsx` (the one call site, which this plan updates in Task 6). Since the new prop is optional and the parameter destructures with a `= {}` default, `<NewVacationRequestDialog />` with no props still compiles — confirm Task 6 hasn't run yet so `page.tsx` still calls it with no args at this point, and `bunx tsc --noEmit` from Step 4 already proved that call site is still valid.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/NewVacationRequestDialog.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): add triggerClassName prop to NewVacationRequestDialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `SolicitudesHeroBanner`

**Files:**
- Create: `src/app/(app)/solicitudes/vacaciones/SolicitudesHeroBanner.tsx`

This is a new, self-contained presentational component with no props beyond an optional `children` slot for the "Nueva solicitud" button. It has no dependency on any other file changed by this plan and can be built and verified in isolation.

- [ ] **Step 1: Create the component**

Create `src/app/(app)/solicitudes/vacaciones/SolicitudesHeroBanner.tsx`:

```tsx
import { CalendarCheck, Palmtree, Sun, Waves } from "lucide-react";
import type { ReactNode } from "react";

interface SolicitudesHeroBannerProps {
  children?: ReactNode;
}

export function SolicitudesHeroBanner({ children }: SolicitudesHeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 px-6 py-6 text-white shadow-md sm:px-8 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        <div className="animate-blob absolute -top-10 right-10 size-32 rounded-full bg-white/10 blur-3xl" />
        <Sun className="absolute top-4 right-24 size-12 text-white opacity-25" />
        <Palmtree className="absolute -right-4 -bottom-6 size-32 text-white opacity-20" />
        <Waves className="absolute right-28 bottom-2 size-10 text-white opacity-25" />
      </div>
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <CalendarCheck className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Solicitudes de Permisos y Vacaciones</h1>
            <p className="text-sm text-white/85">Gestiona y da seguimiento a tus solicitudes de permisos y vacaciones</p>
          </div>
        </div>
        {children && <div className="relative z-10">{children}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints clean**

Run: `bunx tsc --noEmit`
Expected: no errors. (The component isn't imported anywhere yet, so this just confirms the file itself is syntactically and type-correct in isolation — `tsc` checks all files in the project regardless of import graph.)

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones/SolicitudesHeroBanner.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesHeroBanner.tsx
git commit -m "$(cat <<'EOF'
feat(solicitudes): add SolicitudesHeroBanner presentational component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Restyle `SolicitudesProfileHeader` into a sidebar card

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx`

**Current full file content:**

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

**`SolicitudesProfileHeaderProps` does not change** — `name`, `position`, `photoUrl`, `tenure` stay exactly as they are, so `page.tsx`'s call site (updated separately in Task 6) needs no prop changes, only a layout wrapper around it.

- [ ] **Step 1: Replace the file content**

Replace the entire file with:

```tsx
import { Building2, Handshake } from "lucide-react";
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
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-6 text-center">
      <Avatar className="size-32 border-4 border-white shadow-lg">
        <AvatarImage src={photoUrl ?? undefined} alt="" />
        <AvatarFallback className="text-3xl">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <p className="mt-2 text-lg font-bold">{name}</p>
      {position && <p className="text-sm text-muted-foreground">{position}</p>}

      {tenure && (
        <>
          <div className="my-2 h-px w-full bg-border" />
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-4" aria-hidden="true" />
            {tenure} en la empresa
          </div>
        </>
      )}

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-3 text-left text-sm">
        <Handshake className="size-5 shrink-0 text-[#04B1AF]" aria-hidden="true" />
        Tu bienestar también es parte de nuestro equipo
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints clean**

Run: `bunx tsc --noEmit`
Expected: no errors (the props interface is unchanged, so the existing call site in `page.tsx` — not yet modified — still type-checks).

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx
git commit -m "$(cat <<'EOF'
style(solicitudes): restyle profile header as a sidebar card

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Restyle `SolicitudesSummaryCards` with icon badges and gradient shells

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx`

**Current full file content:**

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

**`SolicitudesSummaryCardsProps` does not change.** All 5 cards keep their exact visibility conditions (`approval.visible`, `lastVacation &&`, `nextVacation &&`) and their exact data — only the visual shell of each card changes.

- [ ] **Step 1: Replace the file content**

Replace the entire file with:

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
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-gradient-to-br from-[#04B1AF]/10 to-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#04B1AF]/20">
            <Hourglass className="size-5 text-[#04B1AF]" aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Mis solicitudes en trámite
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold">{inProgressCount}</p>
      </div>

      {approval.visible && (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-100 to-orange-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-200">
              <ClipboardCheck className="size-5 text-orange-600" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Por aprobar</span>
          </div>
          <p className="mt-3 text-2xl font-bold">{approval.count}</p>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-200">
            <CalendarCheck className="size-5 text-emerald-700" aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Días aprobados ({year})
          </span>
        </div>
        <div className="mt-3 flex gap-6">
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
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-200">
              <History className="size-5 text-blue-700" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Última vacación</span>
          </div>
          <p className="mt-3 text-sm font-medium">
            Del {formatFechaEs(lastVacation.date_from)} al {formatFechaEs(lastVacation.date_to)}
          </p>
        </div>
      )}

      {nextVacation && (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-200">
              <Plane className="size-5 text-blue-700" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Próxima vacación</span>
          </div>
          <p className="mt-3 text-sm font-medium">
            Del {formatFechaEs(nextVacation.date_from)} al {formatFechaEs(nextVacation.date_to)}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints clean**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx`
Expected: no errors.

- [ ] **Step 3: Run the existing unit tests that exercise the data this component renders**

This component has no test file of its own (it never did — it's pure presentation over already-tested data), but confirm the functions feeding it are untouched and still green:

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts`
Expected: all tests pass (25/25), unchanged from before this task.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx
git commit -m "$(cat <<'EOF'
style(solicitudes): add icon badges and gradient shells to summary cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Restyle `SolicitudesTable`'s Tipo and Estado cells as pill badges

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx`

**Current full file content:**

```tsx
"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequestFlowDialog } from "./RequestFlowDialog";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  personal: "Personal",
  familiar: "Familiar",
  medico: "Médico",
  perdida: "Pérdida",
  tramites: "Trámites",
  otro: "Otro",
};

const ALL_VALUE = "__all__";

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

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

interface SolicitudesTableProps {
  requests: SolicitudRequestRow[];
  attachmentUrlByRequestId: Record<string, string>;
  signatures: SignatureWithUrl[];
  userId: string;
  canAuthorize: boolean;
}

export function SolicitudesTable({
  requests,
  attachmentUrlByRequestId,
  signatures,
  userId,
  canAuthorize,
}: SolicitudesTableProps) {
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState(ALL_VALUE);
  const [estadoFilter, setEstadoFilter] = useState(ALL_VALUE);

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>;
  }

  const searchTokens = normalizeForSearch(search.trim()).split(/\s+/).filter(Boolean);
  const filtered = requests.filter((r) => {
    if (tipoFilter !== ALL_VALUE && r.tipo !== tipoFilter) return false;
    if (estadoFilter !== ALL_VALUE && r.status !== estadoFilter) return false;
    if (searchTokens.length > 0) {
      const fullName = normalizeForSearch(`${r.first_name} ${r.last_name}`);
      if (!searchTokens.every((token) => fullName.includes(token))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por colaborador..."
          className="w-64"
          aria-label="Buscar por colaborador"
        />
        <Select value={tipoFilter} onValueChange={(value) => value && setTipoFilter(value)}>
          <SelectTrigger className="w-48" aria-label="Filtrar por tipo">
            <SelectValue>
              {(value: string) => (value === ALL_VALUE ? "Todos los tipos" : (TIPO_LABEL[value] ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estadoFilter} onValueChange={(value) => value && setEstadoFilter(value)}>
          <SelectTrigger className="w-56" aria-label="Filtrar por estado">
            <SelectValue>
              {(value: string) => (value === ALL_VALUE ? "Todos los estados" : (STATUS_LABEL[value] ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los estados</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes que coincidan con el filtro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
              <TableHead>Flujo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const isPendingSupervisorForMe = r.status === "pendiente_supervisor" && r.supervisor_app_user_id === userId;
              const isPendingRrhhForMe = r.status === "pendiente_rrhh" && canAuthorize;
              const attachmentUrl = attachmentUrlByRequestId[r.id];
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.first_name} {r.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                      {attachmentUrl && (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#04B1AF] hover:underline"
                        >
                          Ver documento
                        </a>
                      )}
                    </div>
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
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

**Only the Tipo and Estado `<TableCell>` contents change.** The `SolicitudRequestRow` interface, filtering logic, search, selects, column headers, attachment link, `isPendingSupervisorForMe`/`isPendingRrhhForMe` gating, `VacationRequestActions`, `RequestFlowDialog`, and both empty states are untouched.

- [ ] **Step 1: Replace the `Badge` import with the new pill icons, and add the Tipo/Estado pill lookup tables and helper components**

Find:

```tsx
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
```

Replace with:

```tsx
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MoreHorizontal,
  Plane,
  Stethoscope,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
```

Find:

```tsx
const ALL_VALUE = "__all__";
```

Replace with:

```tsx
const ALL_VALUE = "__all__";

const TIPO_PILL: Record<string, { icon: typeof Plane; className: string }> = {
  vacaciones: { icon: Plane, className: "bg-blue-50 text-blue-700" },
  personal: { icon: User, className: "bg-violet-50 text-violet-700" },
  familiar: { icon: Users, className: "bg-pink-50 text-pink-700" },
  medico: { icon: Stethoscope, className: "bg-red-50 text-red-700" },
  perdida: { icon: AlertTriangle, className: "bg-slate-100 text-slate-700" },
  tramites: { icon: FileText, className: "bg-amber-50 text-amber-700" },
  otro: { icon: MoreHorizontal, className: "bg-slate-100 text-slate-700" },
};

const ESTADO_PILL: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  aprobado: { icon: CheckCircle2, className: "bg-green-50 text-green-700" },
  rechazado: { icon: XCircle, className: "bg-red-50 text-red-700" },
  pendiente_supervisor: { icon: Clock, className: "bg-amber-50 text-amber-700" },
  pendiente_rrhh: { icon: Clock, className: "bg-amber-50 text-amber-700" },
};

function TipoPill({ tipo }: { tipo: string }) {
  const pill = TIPO_PILL[tipo] ?? { icon: MoreHorizontal, className: "bg-slate-100 text-slate-700" };
  const Icon = pill.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

function EstadoPill({ status }: { status: string }) {
  const pill = ESTADO_PILL[status] ?? { icon: Clock, className: "bg-slate-100 text-slate-700" };
  const Icon = pill.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
```

(Note: `TIPO_LABEL` and `STATUS_LABEL` are defined above this insertion point in the existing file — `TipoPill`/`EstadoPill` reference them as already-existing module-level constants, so insert the new block directly after `const ALL_VALUE = "__all__";` and before `function normalizeForSearch`.)

- [ ] **Step 2: Use the new pills in the table cells**

Find:

```tsx
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                      {attachmentUrl && (
```

Replace with:

```tsx
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <TipoPill tipo={r.tipo} />
                      {attachmentUrl && (
```

Find:

```tsx
                  <TableCell>
                    <Badge variant={r.status === "aprobado" ? "default" : r.status === "rechazado" ? "secondary" : "outline"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
```

Replace with:

```tsx
                  <TableCell>
                    <EstadoPill status={r.status} />
                  </TableCell>
```

- [ ] **Step 3: Verify it compiles and lints clean**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones/SolicitudesTable.tsx`
Expected: no errors. If eslint flags the `Badge` import as unused anywhere else, there is no other usage in this file — the import was fully replaced in Step 1.

- [ ] **Step 4: Manually verify every existing behavior survived**

Read the file back and confirm, line by line against the "current full file content" above, that **nothing changed** except: the import line, the new `TIPO_PILL`/`ESTADO_PILL`/`TipoPill`/`EstadoPill` block, and the two `<TableCell>` bodies touched in Step 2. Specifically confirm unchanged: `normalizeForSearch`, the `filtered` computation (tipo/estado/search filtering), both `<Select>` filter dropdowns, the two empty-state messages, the `<TableHead>` row (still exactly: Colaborador, Tipo, Período, Fechas, Estado, blank, Flujo), `isPendingSupervisorForMe`/`isPendingRrhhForMe` and their `VacationRequestActions` rendering, the `Período`/`Fechas` cells, and `RequestFlowDialog`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/SolicitudesTable.tsx
git commit -m "$(cat <<'EOF'
style(solicitudes): render Tipo and Estado as icon pill badges

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire the banner and sidebar grid into `page.tsx`

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/page.tsx`

**Files this task depends on (must already be done):** Tasks 1–5 (all of `NewVacationRequestDialog`, `SolicitudesHeroBanner`, `SolicitudesProfileHeader`, `SolicitudesSummaryCards`, `SolicitudesTable`).

**Current full file content:**

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

**Nothing above the `return` statement changes** — every query, signed-URL computation, and summary calculation stays exactly as-is. Only the JSX returned changes.

- [ ] **Step 1: Add the `SolicitudesHeroBanner` import**

Find:

```tsx
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { SolicitudesProfileHeader } from "./SolicitudesProfileHeader";
```

Replace with:

```tsx
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { SolicitudesHeroBanner } from "./SolicitudesHeroBanner";
import { SolicitudesProfileHeader } from "./SolicitudesProfileHeader";
```

- [ ] **Step 2: Replace the returned JSX**

Find:

```tsx
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

Replace with:

```tsx
  const summaryAndTable = (
    <div className="space-y-6">
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <SolicitudesHeroBanner>
        <NewVacationRequestDialog triggerClassName="border-white/30 bg-white/15 text-white hover:bg-white/25" />
      </SolicitudesHeroBanner>
      {myContact ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <SolicitudesProfileHeader
            name={`${myContact.first_name} ${myContact.last_name}`}
            position={myContact.position}
            photoUrl={myContact.photo_url}
            tenure={myContact.hire_date ? formatTenure(myContact.hire_date, today) : null}
          />
          {summaryAndTable}
        </div>
      ) : (
        summaryAndTable
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints clean**

Run: `bunx tsc --noEmit`
Expected: no errors. This is the step that proves the `triggerClassName` prop from Task 1 and the `children` prop from Task 2 are both wired correctly.

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones/page.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/page.tsx
git commit -m "$(cat <<'EOF'
style(solicitudes): wire hero banner and sidebar profile grid into page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification and preview deploy

**Files:** none (verification-only task).

- [ ] **Step 1: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors across the whole project.

- [ ] **Step 2: Full lint**

Run: `bunx eslint src/app/\(app\)/solicitudes/vacaciones`
Expected: no errors across all files in the directory (the 6 files touched/created by this plan, plus the untouched `RequestFlowDialog.tsx`, `NewVacationRequestDialog.tsx`'s untouched form body, `VacationRequestActions.tsx`, and `actions.ts`).

- [ ] **Step 3: Full test suite**

Run: `bunx vitest run src/lib/vacationRequestSummary.test.ts src/lib/vacationRequestFlow.test.ts`
Expected: all tests pass unchanged (25 + 9 = 34 tests), since this plan touched zero business logic.

- [ ] **Step 4: Confirm git status is clean**

Run: `git status`
Expected: working tree clean, all 6 commits from Tasks 1–6 present on `main` (this plan does not use a worktree, per this engagement's standing convention).

- [ ] **Step 5: Preview deploy**

Run: `bunx vercel`
Expected: a successful preview deployment (not production — do **not** pass `--prod`). Capture the resulting preview URL.

- [ ] **Step 6: Report to the user**

Report the preview URL to the user and ask them to manually verify these 6 points from the spec's Testing section:

1. Desktop width: confirm the hero banner, sidebar profile card, summary cards, and table all render without horizontal overflow.
2. Mobile width (~375px): confirm the layout stacks to a single column in the order banner → profile → summary cards → table, with no overflow.
3. A user with no matching `contacts` row (`myContact === null`): confirm the page renders the banner + summary cards + table at full width with no empty gutter where the profile card would have been.
4. Confirm every Tipo value (`vacaciones`, `personal`, `familiar`, `medico`, `perdida`, `tramites`, `otro`) renders a pill with a label (no missing icon/undefined color).
5. Confirm each Estado value (`aprobado`, `rechazado`, `pendiente_supervisor`, `pendiente_rrhh`) renders with the correct color/icon pairing, matching the colors already used in the Flujo dialog.
6. Toggle OS/browser "reduce motion" and confirm the banner's decorative blob stops animating.

**Do not run `bunx vercel --prod`** until the user explicitly confirms they want to deploy to production.

---

## Plan self-review notes

- **Spec coverage:** Every section of `2026-11-04-solicitudes-visual-redesign-design.md` maps to a task — hero banner (Task 2), profile sidebar (Task 3), summary card badges (Task 4), table pills (Task 5), page layout/grid incl. the `myContact === null` no-gutter case (Task 6), the `triggerClassName` additive prop (Task 1), responsive/accessibility requirements (baked into Tasks 2–6's exact classNames), and the manual smoke-test checklist (Task 7).
- **Type consistency:** `SolicitudesHeroBannerProps.children`, `SolicitudesProfileHeaderProps` (unchanged), `SolicitudesSummaryCardsProps` (unchanged), `SolicitudRequestRow` (unchanged), and the new `NewVacationRequestDialog({ triggerClassName })` signature are all used identically across the task that defines them and the task (6) that consumes them.
- **No placeholders:** every step shows exact code, exact find/replace text, and exact shell commands with expected output.
