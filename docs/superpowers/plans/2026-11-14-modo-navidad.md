# Modo Navidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin toggle a festive, app-wide snow + string-lights overlay on and off from Settings.

**Architecture:** One new boolean column on the existing `platform_settings` singleton row, read once in the root layout and passed to a single decorative client component. No new tables, no new permissions, no per-page logic — mirrors the exact pattern already used for the platform logo and login background in `src/app/(app)/(admin)/settings/`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + supabase-js), Bun (no node.exe — use `bun`/`bunx` for every command), Vitest for tests.

---

### Task 1: Migration file + apply it to the live project

**Files:**
- Create: `supabase/migrations/20261114120000_platform_settings_christmas_mode.sql`
- Create (scratch, not committed): a temp bun script to run the same SQL against the live project via the existing `__migration_exec` RPC channel

- [ ] **Step 1: Write the migration file**

```sql
-- Lets an admin toggle a festive, purely decorative overlay (falling snow +
-- a string-lights garland) across the whole app from Settings. No other
-- styling changes anywhere - confirmed with the user, who wanted an
-- overlay only, never a reskin of existing colors/buttons.
alter table public.platform_settings
  add column christmas_mode_enabled boolean not null default false;
```

- [ ] **Step 2: Apply the same SQL to the live NEW project**

This repo's Supabase CLI cannot reach the live project's database from this machine (no direct Postgres access, no Docker). The live project currently has a temporary `public.__migration_exec(sql text)` RPC function (service_role-only) left over from the data migration, callable via `supabase-js`. Use it once, with a throwaway script — do not commit this script.

Write a file at `C:\Users\gcordero\AppData\Local\Temp\claude\<scratchpad>\apply-christmas-mode-migration.ts` (use your own scratchpad directory) with:

```ts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.migration") });

const newClient = createClient(process.env.NEW_SUPABASE_URL!, process.env.NEW_SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { error } = await newClient.rpc("__migration_exec", {
  sql: "alter table public.platform_settings add column christmas_mode_enabled boolean not null default false;",
});
console.log({ error });
```

Run it from the repo root (so `.env.migration` resolves):

```bash
bun C:\Users\gcordero\AppData\Local\Temp\claude\<scratchpad>\apply-christmas-mode-migration.ts
```

Expected: `{ error: null }`. If it fails with "column already exists", the migration was already applied — treat as success and move on.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20261114120000_platform_settings_christmas_mode.sql
git commit -m "feat(settings): add platform_settings.christmas_mode_enabled column

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `getChristmasModeEnabled()` in platformSettings.ts

**Files:**
- Modify: `src/lib/platformSettings.ts`

- [ ] **Step 1: Add the getter**

Add this function to the existing file (keep `getPlatformLogoUrl` and `getLoginBackgroundUrl` as they are):

```ts
export async function getChristmasModeEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("christmas_mode_enabled")
    .eq("id", true)
    .maybeSingle();
  return data?.christmas_mode_enabled ?? false;
}
```

The full file should now read:

```ts
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

export async function getLoginBackgroundUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("login_background_url")
    .eq("id", true)
    .maybeSingle();
  return data?.login_background_url ?? null;
}

export async function getChristmasModeEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("christmas_mode_enabled")
    .eq("id", true)
    .maybeSingle();
  return data?.christmas_mode_enabled ?? false;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/platformSettings.ts
git commit -m "feat(settings): add getChristmasModeEnabled helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `ChristmasDecor` overlay component

**Files:**
- Create: `src/components/ChristmasDecor.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";

const SNOWFLAKES = [
  { left: "8%", size: 5, duration: 10, delay: 0 },
  { left: "20%", size: 3, duration: 13, delay: 1.5 },
  { left: "34%", size: 6, duration: 11, delay: 3 },
  { left: "48%", size: 4, duration: 14, delay: 0.5 },
  { left: "62%", size: 3, duration: 12, delay: 4 },
  { left: "74%", size: 5, duration: 15, delay: 2 },
  { left: "86%", size: 4, duration: 10.5, delay: 3.5 },
  { left: "14%", size: 3, duration: 16, delay: 5 },
  { left: "58%", size: 3, duration: 13.5, delay: 1 },
  { left: "92%", size: 5, duration: 11.5, delay: 2.5 },
] as const;

const LIGHT_COLORS = ["#ef4444", "#22c55e", "#fbbf24"] as const;
const BULB_COUNT = 16;

export function ChristmasDecor({ enabled }: { enabled: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  if (!enabled) return null;

  const bulbs = Array.from({ length: BULB_COUNT }, (_, i) => ({
    cx: `${(i / (BULB_COUNT - 1)) * 100}%`,
    color: LIGHT_COLORS[i % LIGHT_COLORS.length],
    cy: i % 2 === 0 ? 6 : 16,
  }));

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, overflow: "hidden" }}
    >
      <svg width="100%" height="24" style={{ position: "absolute", top: 0, left: 0 }}>
        <polyline
          points={bulbs.map((b) => `${b.cx},${b.cy}`).join(" ")}
          fill="none"
          stroke="#d4af37"
          strokeWidth={1.5}
          opacity={0.6}
        />
        {bulbs.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r={4} fill={b.color} />
        ))}
      </svg>
      {!reducedMotion &&
        SNOWFLAKES.map((flake, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "-5%",
              left: flake.left,
              width: flake.size,
              height: flake.size,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 0 3px rgba(255,255,255,0.8)",
              animation: `christmas-decor-fall ${flake.duration}s linear ${flake.delay}s infinite`,
            }}
          />
        ))}
      <style>{`
        @keyframes christmas-decor-fall {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: .9; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
```

Notes for whoever implements this:
- `pointerEvents: "none"` on the outer wrapper means this never blocks clicks on anything underneath, anywhere in the app.
- `zIndex: 40` is deliberately below the app's dialogs (`z-50` in `src/components/ui/dialog.tsx`), so a modal always renders above the decoration instead of snow drifting over dialog content.
- When the user has `prefers-reduced-motion: reduce` set, the snowflakes are skipped entirely (not just paused) and only the static string-lights garland shows — this still satisfies the spec's "static frame instead of hidden entirely" requirement for the lights, while avoiding motion for the snow specifically (there's no sensible "static snow frame" — frozen mid-air dots would look like a bug, not a design choice, so omitting them reads better than faking a static version).

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChristmasDecor.tsx
git commit -m "feat(settings): add ChristmasDecor overlay component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire `ChristmasDecor` into the root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Make the layout async and render the overlay**

Replace the full contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import { ChristmasDecor } from "@/components/ChristmasDecor";
import { getChristmasModeEnabled } from "@/lib/platformSettings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Icons are handled by the icon.tsx/apple-icon.tsx file conventions
// (auto-linked by Next) instead of a manual `icons` field here — those
// routes composite the logo onto a solid background so it stays visible
// regardless of what's uploaded, which a manual override here would bypass.
export const metadata: Metadata = {
  title: "Gente Sánchez Business",
  description: "Plataforma interna de Gente Sánchez Business",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GSB",
  },
};

export const viewport: Viewport = {
  themeColor: "#04b1af",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const christmasModeEnabled = await getChristmasModeEnabled();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <RegisterServiceWorker />
        <ChristmasDecor enabled={christmasModeEnabled} />
        {children}
      </body>
    </html>
  );
}
```

This covers every route in the app (authenticated pages and the public `/login`, `/forgot-password`, `/reset-password` pages alike), since they all share this root layout.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(settings): render ChristmasDecor in the root layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `saveChristmasMode` action + test

**Files:**
- Modify: `src/app/(app)/(admin)/settings/actions.ts`
- Modify: `src/app/(app)/(admin)/settings/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Add this import to the top of `actions.test.ts`, alongside the existing one:

```ts
import { saveSmtpSettings, savePlatformLogo, saveChristmasMode } from "./actions";
```

(replace the existing `import { saveSmtpSettings, savePlatformLogo } from "./actions";` line with the one above)

Then add this new `describe` block at the end of the file:

```ts
describe("saveChristmasMode", () => {
  it("rejects callers without can_manage on the settings module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await saveChristmasMode(true);

    expect(result.error).toBe("No autorizado");
  });

  it("updates the platform_settings row when authorized", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      ...mockServerClient({ can_manage: true }),
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }),
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveChristmasMode(true);

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("platform_settings");
    expect(supabase.from().update).toHaveBeenCalledWith({
      christmas_mode_enabled: true,
    });
    expect(eq).toHaveBeenCalledWith("id", true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/app/\(app\)/\(admin\)/settings/actions.test.ts`
Expected: FAIL — `saveChristmasMode` is not exported from `./actions`.

- [ ] **Step 3: Implement `saveChristmasMode`**

Add this function to `src/app/(app)/(admin)/settings/actions.ts`, after `saveLoginBackground`:

```ts
export async function saveChristmasMode(enabled: boolean): Promise<ActionResult> {
  if (!(await callerCanManageSettings())) {
    return { error: "No autorizado" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ christmas_mode_enabled: enabled })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return {};
}
```

`revalidatePath("/", "layout")` invalidates the root layout everywhere (not just one page), since this flag is read once in `src/app/layout.tsx` and affects every route.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/app/\(app\)/\(admin\)/settings/actions.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/(admin)/settings/actions.ts" "src/app/(app)/(admin)/settings/actions.test.ts"
git commit -m "feat(settings): add saveChristmasMode server action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `ChristmasModeForm` toggle component

**Files:**
- Create: `src/app/(app)/(admin)/settings/ChristmasModeForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { saveChristmasMode } from "./actions";

export function ChristmasModeForm({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(next: boolean) {
    setEnabled(next);
    setSuccess(false);
    setError(null);
    startTransition(async () => {
      const result = await saveChristmasMode(next);
      if (result.error) {
        setError(result.error);
        setEnabled(!next);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Modo Navidad</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Guardado.</p>}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="christmas-mode"
          checked={enabled}
          disabled={isPending}
          onChange={(e) => submit(e.target.checked)}
          className="size-4 rounded border-zinc-300 accent-[#04B1AF]"
        />
        <Label htmlFor="christmas-mode">Activar nieve y luces navideñas en todo el portal</Label>
      </div>
    </div>
  );
}
```

This toggle saves immediately on click (no separate "Guardar" button) — the right pattern for a single on/off switch, unlike the logo/background forms which need an explicit save because they also handle a file upload step first.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/settings/ChristmasModeForm.tsx"
git commit -m "feat(settings): add ChristmasModeForm toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the form into the Settings page

**Files:**
- Modify: `src/app/(app)/(admin)/settings/page.tsx`

- [ ] **Step 1: Fetch the flag and render the form**

Replace the full contents of `src/app/(app)/(admin)/settings/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfig } from "@/lib/supabase/managementApi";
import { getPlatformLogoUrl, getLoginBackgroundUrl, getChristmasModeEnabled } from "@/lib/platformSettings";
import { PlatformLogoForm } from "./PlatformLogoForm";
import { LoginBackgroundForm } from "./LoginBackgroundForm";
import { SmtpSettingsForm } from "./SmtpSettingsForm";
import { ChristmasModeForm } from "./ChristmasModeForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "settings",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  // getAuthConfig() calls the Supabase Management API and throws on any
  // failure (e.g. an expired/invalid access token) — caught here so that
  // failure only disables the SMTP form below, instead of taking down the
  // whole page (including the unrelated logo/background upload forms).
  let config: Record<string, unknown> = {};
  let authConfigError: string | null = null;
  try {
    config = await getAuthConfig();
  } catch (err) {
    authConfigError = err instanceof Error ? err.message : "No se pudo leer la configuración de autenticación";
  }

  const [logoUrl, loginBackgroundUrl, christmasModeEnabled] = await Promise.all([
    getPlatformLogoUrl(),
    getLoginBackgroundUrl(),
    getChristmasModeEnabled(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <PlatformLogoForm initialLogoUrl={logoUrl} />
      <LoginBackgroundForm initialBackgroundUrl={loginBackgroundUrl} />
      <ChristmasModeForm initialEnabled={christmasModeEnabled} />
      <div>
        <h2 className="text-lg font-semibold">Configuración de correo</h2>
        <p className="text-sm text-muted-foreground">
          Define el servidor de correo (SMTP) que se usa para enviar invitaciones y
          recuperación de clave a los usuarios.
        </p>
      </div>
      {authConfigError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudo cargar la configuración de correo: {authConfigError}. El token de acceso de Supabase
          probablemente expiró — genera uno nuevo y actualízalo en Vercel.
        </p>
      ) : (
        <SmtpSettingsForm
          initial={{
            smtp_host: String(config.smtp_host ?? ""),
            smtp_port: String(config.smtp_port ?? ""),
            smtp_user: String(config.smtp_user ?? ""),
            smtp_sender_name: String(config.smtp_sender_name ?? ""),
            smtp_admin_email: String(config.smtp_admin_email ?? ""),
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/settings/page.tsx"
git commit -m "feat(settings): show the Christmas mode toggle on the Settings page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `bunx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 2: Run the settings test suite**

Run: `bunx vitest run src/app/\(app\)/\(admin\)/settings/actions.test.ts`
Expected: all tests pass, including the two new `saveChristmasMode` tests.

- [ ] **Step 3: Preview deploy**

Run: `bunx vercel`
Expected: a preview URL. Open it, log in, go to **Configuración**, confirm the "Modo Navidad" toggle appears, turn it on, and confirm snow + string lights appear across the app (try both an authenticated page and `/login` in an incognito tab). Turn it back off and confirm the overlay disappears.

Do **not** run `bunx vercel --prod` — report the preview URL and wait for the user's explicit go-ahead before promoting to production.

- [ ] **Step 4: Report completion**

Summarize for the user: migration applied to the live project, all 8 tasks committed, preview URL, and that production deploy is pending their confirmation.
