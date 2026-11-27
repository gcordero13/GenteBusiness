import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard (production outage, 2026-11-27): the project page's
// server-rendered header called initials() imported from the "use client"
// AssigneePicker, and every project page failed with "This page couldn't
// load". Modules that server components render or call must never import
// from a "use client" module in this folder.
const DIR = join(process.cwd(), "src/app/(app)/planificacion/proyectos");
const SERVER_SAFE = ["visual.ts", "progress.ts", "Distintivos.tsx", "ProyectoEncabezado.tsx", "taskTree.ts"];

function localImports(source: string): string[] {
  return [...source.matchAll(/from\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
}

function resolve(name: string): string | null {
  for (const ext of ["", ".ts", ".tsx"]) {
    const path = join(DIR, `${name}${ext}`);
    if (existsSync(path) && !path.endsWith(DIR)) return path;
  }
  return null;
}

const isClientModule = (path: string) => /^\s*["']use client["']/.test(readFileSync(path, "utf8"));

describe("server-safe Proyectos modules", () => {
  it.each(SERVER_SAFE)("%s imports nothing from a \"use client\" module", (file) => {
    const source = readFileSync(join(DIR, file), "utf8");
    expect(isClientModule(join(DIR, file))).toBe(false);
    const offending = localImports(source).filter((name) => {
      const path = resolve(name);
      // Type-only imports are erased at build time and are harmless.
      const typeOnly = new RegExp(`import\\s+type\\s+[^;]*from\\s+"\\./${name}"`).test(source);
      return path !== null && !typeOnly && isClientModule(path);
    });
    expect(offending).toEqual([]);
  });
});
