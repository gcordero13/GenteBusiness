# Solicitudes de Vacaciones — Visual Redesign (Design)

**Status:** Approved by user ("procede").

## Goal

Restyle the already-implemented `/solicitudes/vacaciones` page to match two reference mockups the user provided (gradient hero banner, sidebar profile panel, icon-badge summary cards, pill-badge table), without changing any data-fetching logic, prop contracts, or business logic already built and verified in the prior "profile and flow" plan (commit range `14ab4d6`..`0dcc161`).

This is a pure visual/layout pass. No new Supabase queries, no schema changes, no new server logic.

## Scope and explicit non-goals

Three elements visible in the mockups are deliberately **not** being built, each for a concrete reason:

1. **"En línea" (online) status dot on the avatar.** There is no presence/online concept anywhere in this codebase (no `is_online`/`last_seen` field, no realtime presence channel). Showing a static green dot would assert a fact the app has no way to know. Omitted.
2. **"SBC" logo/wordmark.** No brand wordmark exists anywhere else in the app — not in `Sidebar.tsx`, not as a header component. The platform's only existing logo concept (`src/app/appIcon.tsx`) falls back to plain "GSB" text, not "SBC", and is scoped to the PWA icon only. Adding a one-off wordmark to just this page would be inconsistent branding and belongs to a separate, app-wide initiative if ever wanted. Omitted.
3. **Chevron ("›") buttons on the summary cards.** In the mockup these imply a drill-down to a detail view that doesn't exist for any of these cards. A button that goes nowhere is worse than no button. Omitted.

The mockups' photographic beach/palm-tree illustration is replaced with an **icon-based decorative collage** (lucide-react icons: `Sun`, `Palmtree`, `Waves`, at low opacity) plus a soft blurred color blob, reusing the exact decorative pattern already established in `TodayBirthdayCard.tsx` / `BirthdaysWidget.tsx` (`animate-blob`/`animate-blob-delayed` CSS classes in `src/app/globals.css`). This avoids needing to source, host, or license a photographic asset, and keeps the page visually consistent with the rest of the app's existing decoration style.

## Architecture

One new presentational component, three restyled components, and one small interface addition:

| File | Change |
|---|---|
| `src/app/(app)/solicitudes/vacaciones/SolicitudesHeroBanner.tsx` | **New.** Gradient banner, title/subtitle, decorative icon collage, a slot (`children`) for the "Nueva solicitud" button. |
| `src/app/(app)/solicitudes/vacaciones/SolicitudesProfileHeader.tsx` | Restyled from a horizontal bar to a tall sidebar card. **Same props** (`name`, `position`, `photoUrl`, `tenure`) — no caller changes needed beyond layout. |
| `src/app/(app)/solicitudes/vacaciones/SolicitudesSummaryCards.tsx` | Restyled: each card gets a circular icon badge and a tinted gradient background instead of a flat tint. **Same props**, no interface change. |
| `src/app/(app)/solicitudes/vacaciones/SolicitudesTable.tsx` | Restyled: the Tipo and Estado cells become icon+label pill badges instead of plain text / shadcn `Badge`. **Same `SolicitudRequestRow` interface**, no data change — this is a rendering change inside the existing `<TableCell>`s only. |
| `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx` | Add one new optional prop, `triggerClassName?: string`, so the trigger `Button`'s classes can be overridden when the dialog is rendered inside the hero banner (where the default teal `bg-primary` button would be low-contrast against the teal gradient). Also add a `Plus` icon to the trigger label, matching the mockup's "+ Nueva solicitud". Fully backward compatible — omitting the prop keeps today's appearance. |
| `src/app/(app)/solicitudes/vacaciones/page.tsx` | Layout change only: hero banner above a two-column grid (280px sidebar + flexible content) on large screens, single column on mobile. No new queries, no changed props passed to children (aside from the new `triggerClassName` on `NewVacationRequestDialog`). |
| `src/app/(app)/solicitudes/vacaciones/RequestFlowDialog.tsx` | Unchanged. Its existing ghost icon-button trigger and `STATE_ICON`/`STATE_COLOR` scheme already match the new palette; no edits needed. |

## Component details

### 1. `SolicitudesHeroBanner` (new)

A purely presentational wrapper. Takes no data props — just a `children` slot for the "Nueva solicitud" trigger, so it has no dependency on `NewVacationRequestDialog` or any server data.

- Container: `rounded-3xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 px-6 py-6 text-white shadow-md sm:px-8 sm:py-8`, `relative overflow-hidden`.
- Decorative layer (`aria-hidden`, `pointer-events-none`, `absolute inset-0`, hidden below `sm:`): one `animate-blob` blurred circle (`bg-white/10 blur-3xl`) plus three low-opacity (`opacity-20`–`opacity-25`) lucide icons positioned along the right edge: `Sun`, `Palmtree` (larger, anchored bottom-right), `Waves` (small, near the bottom).
- Content row (`relative z-10`, `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`):
  - Left: a white/20-tinted rounded icon badge (`CalendarCheck`) + `<h1>` "Solicitudes de Permisos y Vacaciones" + a subdued subtitle "Gestiona y da seguimiento a tus solicitudes de permisos y vacaciones".
  - Right: `{children}` — where `page.tsx` renders `<NewVacationRequestDialog triggerClassName="..." />`.

### 2. `SolicitudesProfileHeader` (restyled, same props)

Changes from a horizontal bar to a vertical sidebar card:

- Container: `rounded-2xl border bg-card p-6`, `flex flex-col items-center gap-2 text-center` (centered, not left-aligned).
- Avatar: enlarged to `size-32 border-4 border-white shadow-lg` (matches the "large hero avatar" treatment already established in `TodayBirthdayCard.tsx`), `AvatarFallback` at `text-3xl`.
- Name: `text-lg font-bold`.
- Position: `text-sm text-muted-foreground` (only rendered if `position` is non-null — same conditional already in place).
- A `my-2 h-px w-full bg-border` divider, shown only when there's a tenure line to separate from the name/position block above (mirrors the existing `(position || tenure) &&` conditional, just split across two blocks now).
- Tenure row: `Building2` icon (reusing the icon already imported elsewhere in this app for "company/org" contexts) + `{tenure} en la empresa`, `flex items-center justify-center gap-1.5 text-sm text-muted-foreground`.
- Wellbeing message (new, static, always shown — not data-driven): a tinted rounded panel — `mt-2 flex items-center gap-2 rounded-xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-3 text-left text-sm` — containing a `Handshake` icon and the text "Tu bienestar también es parte de nuestro equipo".

### 3. `SolicitudesSummaryCards` (restyled, same props)

Each existing card (`Mis solicitudes en trámite`, `Por aprobar`, `Días aprobados`, `Última vacación`, `Próxima vacación`) keeps its exact visibility logic (2 always-visible + 3 conditional) and its exact data. Only the visual treatment of the card shell and its label row changes:

- Card shell: `rounded-2xl border p-5` with a soft two-stop gradient background per card's existing accent color (e.g. `bg-gradient-to-br from-[#04B1AF]/10 to-[#04B1AF]/5` for the teal card, `from-orange-100 to-orange-50` for "Por aprobar", `from-emerald-100 to-emerald-50` for "Días aprobados", `from-blue-100 to-blue-50` for both vacation cards) instead of today's flat single-tint background.
- Label row: the icon moves from an inline `size-4` glyph next to the uppercase label into a standalone circular badge above/beside the label — `flex size-10 shrink-0 items-center justify-center rounded-full` using each card's own accent color at a higher opacity than the shell background (e.g. the teal card's badge is `bg-[#04B1AF]/20` sitting on the card's `/10→/5` gradient shell) — containing the same icon already used today (`Hourglass`, `ClipboardCheck`, `CalendarCheck`, `History`, `Plane`) at `size-5`, `aria-hidden` preserved.
- Numbers/body content (counts, date ranges via `formatFechaEs`) are unchanged in content and placement, just restyled with the new shell.

### 4. `SolicitudesTable` (restyled cells only, same interface)

- **Tipo cell:** replace the plain `<span>{TIPO_LABEL[r.tipo]}</span>` with a pill: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium`, color + icon per `tipo`:
  - `vacaciones`: `Plane`, blue (`bg-blue-50 text-blue-700`)
  - `personal`: `User`, violet (`bg-violet-50 text-violet-700`)
  - `familiar`: `Users`, pink (`bg-pink-50 text-pink-700`)
  - `medico`: `Stethoscope`, red (`bg-red-50 text-red-700`)
  - `perdida`: `AlertTriangle`, slate (`bg-slate-100 text-slate-700`)
  - `tramites`: `FileText`, amber (`bg-amber-50 text-amber-700`)
  - `otro`: `MoreHorizontal`, slate (`bg-slate-100 text-slate-700`)
  
  The "Ver documento" attachment link stays exactly where it is today, below the pill.
- **Estado cell:** replace the shadcn `Badge` with a pill using the same three-state color scheme `RequestFlowDialog.tsx` already established (`CheckCircle2`/green for `aprobado`, `XCircle`/red for `rechazado`, `Clock`/amber for both `pendiente_*` states), so a user sees the same color+icon language in the table row and inside the flow dialog.
- Column headers, filter controls, search, pagination text, empty states, and the `Flujo`/action columns are untouched.

### 5. `page.tsx` layout

- Container widens from `max-w-5xl` to `max-w-6xl` (room for the 280px sidebar without cramping the table).
- Replaces today's `<div className="flex items-center justify-between"><h1>...</h1><NewVacationRequestDialog /></div>` block with `<SolicitudesHeroBanner><NewVacationRequestDialog triggerClassName="border-white/30 bg-white/15 text-white hover:bg-white/25" /></SolicitudesHeroBanner>`.
- Below the banner:
  - If `myContact` is present: `<div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">` with `SolicitudesProfileHeader` as the first child and a `<div className="space-y-6">` wrapping `SolicitudesSummaryCards` + `SolicitudesTable` as the second child.
  - If `myContact` is `null` (defensive case, unchanged from today): skip the grid/sidebar entirely and render `SolicitudesSummaryCards` + `SolicitudesTable` directly in a `space-y-6` block at full width, so there's no empty 280px gutter when there's no profile to show.

## Responsive behavior

- Below `lg:`, the grid collapses to a single column: profile card renders first (stacked above), summary cards and table follow underneath, full width.
- The hero banner's decorative icon collage is hidden below `sm:` (`hidden sm:block`) so it never competes with the title/button on narrow screens; the gradient background and text remain at all widths.
- No horizontal scroll should be introduced at any width — the table already handles overflow via its existing wrapper; this redesign doesn't change that.

## Accessibility

- All decorative icons (banner collage, card icon badges, pill-badge icons) get `aria-hidden="true"`, consistent with the existing codebase convention already applied in `SolicitudesSummaryCards.tsx` and `RequestFlowDialog.tsx`.
- The `animate-blob` decorative element inherits the existing `prefers-reduced-motion` handling already defined once in `globals.css` — no new media query needed.
- Color is never the only signal for Estado/Tipo — each pill always pairs its color with an icon and a text label (matches `RequestFlowDialog`'s existing pattern).

## Testing

This is a styling-only change with no new business logic, so no new unit tests are required. Verification is: `bunx tsc --noEmit` clean, `bunx eslint` clean, existing `vacationRequestSummary.test.ts` / `vacationRequestFlow.test.ts` suites still passing unchanged (their underlying functions aren't touched), plus a manual visual/responsive smoke test:

1. Desktop width: confirm the hero banner, sidebar profile card, summary cards, and table all render without horizontal overflow.
2. Mobile width (~375px): confirm the layout stacks to a single column in the order banner → profile → summary cards → table, with no overflow.
3. A user with no matching `contacts` row (`myContact === null`): confirm the page renders the banner + summary cards + table at full width with no empty gutter where the profile card would have been.
4. Confirm every Tipo value (`vacaciones`, `personal`, `familiar`, `medico`, `perdida`, `tramites`, `otro`) renders a pill with a label (no missing icon/undefined color).
5. Confirm each Estado value (`aprobado`, `rechazado`, `pendiente_supervisor`, `pendiente_rrhh`) renders with the correct color/icon pairing, matching the colors already used in the Flujo dialog.
6. Toggle OS/browser "reduce motion" and confirm the banner's decorative blob stops animating.
