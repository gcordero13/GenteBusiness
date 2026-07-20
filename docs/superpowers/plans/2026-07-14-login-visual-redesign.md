# Login Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default shadcn light styling of `src/app/login/page.tsx` with a dark, branded look (charcoal background, teal accent) per the approved design, scoped to this one file only.

**Architecture:** Same Server Component, same `login` Server Action, same `searchParams` error handling — only JSX markup and Tailwind classes change. Existing shadcn `Button`/`Input`/`Label` components are reused with `className` overrides (they merge via `cn()`/`tailwind-merge`, confirmed in `src/lib/utils.ts`), not replaced with raw HTML. No changes to `globals.css` or shadcn theme tokens — this styling is local to the login page.

**Tech Stack:** Next.js (App Router), Tailwind CSS (arbitrary value classes for brand hex colors), existing shadcn/ui components.

**Related spec:** `docs/superpowers/specs/2026-07-14-login-visual-redesign-design.md`

---

### Task 1: Restyle the login page

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Replace the page content**

`src/app/login/page.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1A1A1A] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center text-2xl font-semibold text-white">
          GenteBusiness
        </div>
        <div className="space-y-4 rounded-xl bg-[#1F1F1F] p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-white">Iniciar sesión</h1>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <form action={login} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-300">
                Correo
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                className="border-white/10 bg-[#1A1A1A] text-white placeholder:text-zinc-500 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/50"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="text-zinc-300">
                Clave
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="border-white/10 bg-[#1A1A1A] text-white placeholder:text-zinc-500 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/50"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]"
            >
              Entrar
            </Button>
          </form>
          <a
            href="/forgot-password"
            className="block text-sm text-zinc-400 underline hover:text-white"
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

Run: the dev server is already running on `http://localhost:3000`. Visit `/login` and confirm: dark charcoal page background, darker-still card with shadow, white "Iniciar sesión" heading, teal-focused inputs, solid teal "Entrar" button, readable error message in red-400 if you submit bad credentials, and the "¿Olvidaste tu clave?" link still navigates to `/forgot-password`.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "style: redesign login page with dark branded theme"
```
