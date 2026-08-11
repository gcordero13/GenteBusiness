import { basename, dirname } from "node:path";

/**
 * True when running under `bun run`/`bun test` (process.execPath points at
 * the `bun` binary itself), false when running as a `bun build --compile`d
 * executable (process.execPath is the real path of that executable).
 */
export function isRunningViaBunCli(): boolean {
  const execBasename = basename(process.execPath).toLowerCase();
  return execBasename === "bun" || execBasename === "bun.exe";
}

/**
 * Resolves the real, on-disk directory this program should treat as "home" -
 * for locating the local SQLite database and an .env file next to it.
 *
 * `process.execPath` is the running executable's real path when compiled with
 * `bun build --compile` (confirmed correct even after the exe is copied or
 * renamed), but under `bun run`/`bun test` (not compiled) it instead points at
 * the `bun` binary itself, which has nothing to do with this project. Detect
 * that case via `isRunningViaBunCli()` and fall back to `import.meta.dir`,
 * which - unlike in a compiled executable, where it resolves to a virtual
 * bundle path - correctly gives this file's real source directory when not
 * compiled.
 */
export function getAppDir(): string {
  return isRunningViaBunCli() ? import.meta.dir : dirname(process.execPath);
}
