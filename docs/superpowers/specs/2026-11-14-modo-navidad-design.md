# Modo Navidad — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an admin toggle a festive, app-wide "Christmas mode" on and off from Settings.

**Architecture:** A new boolean flag on the existing `platform_settings` singleton row drives a single decorative overlay component mounted in the root layout. No per-page logic, no new tables, no new permissions model — reuses the exact pattern already used for the platform logo and login background.

---

## What changes visually

When enabled, two purely decorative elements appear on **every page** (authenticated app pages and the public login/forgot-password/reset-password pages alike), layered above the content but non-interactive:

1. **Falling snow** — a handful of small white dots drift down the full viewport height on a slow, staggered CSS loop. Subtle, not distracting.
2. **String lights** — a thin garland (line + small colored bulbs: red, green, gold) pinned along the very top edge of the viewport, above the app header/login card.

No existing brand colors change. No button, card, or table anywhere is restyled. This is strictly an overlay, not a reskin — confirmed with the user, who explicitly preferred this over the more invasive red/green reskin option.

Animation respects `prefers-reduced-motion`: when set, the snow and lights render as a static frame (no motion) instead of being hidden entirely, so the decoration is still visible but doesn't move.

## Data model

Add one column to the existing `platform_settings` table (already a single-row table, `id boolean primary key default true`, holding `logo_url` and `login_background_url`):

```sql
alter table public.platform_settings
  add column christmas_mode_enabled boolean not null default false;
```

A normal Supabase migration file, applied the same way every other migration in this engagement has been applied.

## Components

- **`src/components/ChristmasDecor.tsx`** (new, client component) — renders the snow + lights overlay. Takes no props beyond `enabled: boolean`; renders `null` when `false`. Pure CSS animation, `position: fixed`, `pointer-events: none`, `z-index` high enough to sit above page content but never intercept clicks.
- **Root layout** (`src/app/layout.tsx`) — reads `platform_settings.christmas_mode_enabled` (same server-side fetch pattern already used for the logo) and renders `<ChristmasDecor enabled={...} />` once, app-wide. This covers both the authenticated app and the public auth pages, since they share the root layout.
- **`src/app/(app)/(admin)/settings/ChristmasModeForm.tsx`** (new) — a single toggle switch, following the exact structure of the existing `PlatformLogoForm.tsx` / `LoginBackgroundForm.tsx` in the same folder (same permission check, same save-and-revalidate pattern).
- **`actions.ts`** (same folder) — new `saveChristmasMode(enabled: boolean)` server action, mirroring `savePlatformLogo`: checks `callerCanManageSettings()`, updates the one row, revalidates `/settings` (and the root layout path so the toggle takes effect immediately everywhere).

## Testing

- Unit test for `saveChristmasMode` (mirrors the existing `savePlatformLogo` test in `actions.test.ts`): rejects when the caller lacks `can_manage` on the `settings` module; updates the row and revalidates on success.
- No visual/animation testing — this is non-interactive, decorative CSS; manual confirmation by the user in a preview deploy is the acceptance check.

## Out of scope (explicitly, to keep this small)

- No scheduling (auto-enable in December, auto-disable in January) — purely manual toggle, per the user's request ("que yo lo pueda activar y desactivar").
- No per-user opt-out beyond the OS-level `prefers-reduced-motion` setting.
- No sound, no confetti/other effects beyond snow + lights.
