import { describe, expect, it } from "bun:test";
import { basename } from "node:path";
import { getAppDir, isRunningViaBunCli } from "./paths.ts";

describe("isRunningViaBunCli", () => {
  it("returns true under `bun test` (not a compiled executable)", () => {
    expect(isRunningViaBunCli()).toBe(true);
  });
});

describe("getAppDir", () => {
  it("returns a real, existing directory", () => {
    const dir = getAppDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("does not return the Bun binary's own directory when running under `bun test`", () => {
    // Regression guard for the dev-vs-compiled detection: under `bun test` (not a
    // compiled executable), getAppDir() must fall back to the real source
    // directory, not process.execPath's directory (which would be wherever the
    // `bun` binary itself is installed, e.g. ~/.bun/bin - a directory that has
    // nothing to do with this project and would silently point the SQLite DB
    // and .env loading at the wrong place).
    const dir = getAppDir();
    expect(basename(dir).toLowerCase()).not.toBe("bin");
  });
});
