# Attendance Agent — Bun Single-Executable Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the attendance agent's Node.js-plus-folder distribution with a single self-contained `.exe` — no Node.js install, no `npm install`, no build step required on the deployment (office) PC.

**Architecture:** Port the already-built, already-reviewed agent (`attendance-agent/`, from `docs/superpowers/plans/2026-08-10-attendance-hikvision-agent.md`'s Tasks 9-15) from Node.js + `better-sqlite3` + `vitest` to **Bun** + Bun's built-in `bun:sqlite` + Bun's built-in `bun:test`, then compile it with `bun build --compile` into one standalone executable that bundles the Bun runtime, `bun:sqlite`, and all application code together. The install-to-Windows-Startup step folds into the same executable (`attendance-agent.exe --install-startup`) instead of shipping a second compiled artifact.

**Why this is a real architecture change, not a small tweak:** the original design (`docs/superpowers/specs/2026-08-10-attendance-hikvision-agent-design.md`) explicitly chose Node.js + a plain folder specifically because `better-sqlite3` is a native addon that doesn't bundle cleanly into a single-executable build. That constraint is what's changing here — Bun ships SQLite as a built-in (`bun:sqlite`), not an npm native addon, which sidesteps the exact problem that ruled out a single-exe build the first time. This was confirmed by hand before writing this plan: `bun build --compile` was run against a real `bun:sqlite`-using script and produced a working, self-contained ~98 MB `.exe` with no external dependencies.

**Tech Stack:** Bun 1.3+ (installed at `~/.bun/bin` on the dev machine that builds the executable — end users never need it), `bun:sqlite` (built-in), `bun:test` (built-in), `@types/bun` (dev-only, for editor/type-check support). **`digest-fetch` was removed mid-migration** (see fact #8 below) — HTTP Digest auth is now implemented by hand in `src/digestAuth.ts` using Bun's native `Bun.CryptoHasher`.

**Key technical facts confirmed by hand-testing before writing this plan** (so the tasks below can give exact code, not guesses):

1. **`bun:sqlite`'s named-parameter binding requires the sigil prefix on BOTH the SQL placeholder and the JS object key** — e.g. SQL `values ($deviceId, $employeeNoString)` must be called as `stmt.run({ $deviceId: "...", $employeeNoString: "..." })`. This differs from `better-sqlite3`, which strips the `@` and expects bare keys (`{ deviceId: "..." }`). Getting this wrong doesn't throw — it silently binds nothing and the statement affects 0 rows, which is exactly the kind of bug that would only surface as "nothing is being saved" with no error.
2. **WAL mode is set via `db.exec("PRAGMA journal_mode = WAL;")`**, not a `.pragma()` method — `bun:sqlite`'s `Database` doesn't have `better-sqlite3`'s `.pragma()` convenience method.
3. **`.run()` returns `{ changes, lastInsertRowid }`** — the same shape as `better-sqlite3`, so `insertPunchIfNew`'s `result.changes > 0` check needs no logic change.
4. **A compiled Bun executable's `import.meta.dir`/`import.meta.path` resolve to a *virtual* bundle path** (e.g. `B:\~BUN\root\...`), not the executable's real location on disk — unusable for finding files next to the exe. **`process.execPath` correctly resolves to the real, current filesystem path of the running executable**, confirmed even after the exe is copied/renamed. So real-file resolution (the SQLite DB file, a `.env` file sitting next to the exe) must use `dirname(process.execPath)`, never `import.meta.dir`.
5. **`process.execPath` is *not* reliable in dev mode** (`bun run src/index.ts`, not compiled) — there, it points at the Bun binary itself (`.../bun.exe`), not the project. Distinguish the two cases by checking whether `basename(process.execPath)` is `bun`/`bun.exe`: if so, we're in dev mode and `import.meta.dir` gives the right (real) directory; otherwise we're compiled and `dirname(process.execPath)` gives the right directory. Both cases were confirmed by hand.
6. **Bun auto-loads a `.env` file, but only from the current working directory, not from the executable's own directory.** Confirmed by hand: running a compiled exe from a different `cwd` than the one containing its `.env` file does NOT pick up that `.env`. Since a Windows-Startup-launched `.exe` cannot be assumed to start with a helpful `cwd`, the agent must **explicitly** read and parse a `.env` file located via `dirname(process.execPath)` (in compiled mode) — relying on Bun's automatic loading is not safe here. This also means the `dotenv` npm package (used in the Node.js version) is no longer needed at all; write ~15 lines of manual parsing instead.
7. **Global `fetch`, `crypto.randomUUID()`, and `AbortSignal.timeout()` all work identically under Bun** — confirmed by hand, no code changes needed anywhere these are used (`hikvision.ts`, `cloudApi.ts`).

8. **`digest-fetch` cannot be used in a `bun build --compile`d executable — discovered during this plan's own Task 8, not caught by any earlier test.** `bun test`/`bun run` both work fine, because they use Bun's own module loader directly. But compiling literally anything that constructs a `DigestFetch` instance and calls `.fetch()` on it crashes at runtime with `ReferenceError: require is not defined`, traced (by hand, with a minimal reproduction outside this project) to `digest-fetch`'s transitive dependency `js-sha256`, which contains `var crypto = eval("require('crypto')")` — a deliberate obfuscation some npm packages use to hide a Node-only `require` call from static bundler analysis (so bundlers don't try to polyfill it for a browser build). Bun's compiler doesn't see through the `eval()` either, but *unlike* a plain `require('crypto')` (which Bun's Node-compat layer handles fine in a compiled binary — confirmed separately), this specific evaluated form breaks. **Fix: `digest-fetch` was removed entirely** (along with its `js-sha256`/`js-sha512`/`md5`/etc. dependency tree) and replaced with `src/digestAuth.ts`, a ~50-line hand-written RFC 2617 Digest-auth implementation using only `fetch`, `crypto.randomUUID()`, and `Bun.CryptoHasher("md5")` (Bun's own native hasher — confirmed working both under `bun run` and compiled, since it never touches Node's `crypto` module or `require` at all). Verified correct against a real digest-challenge/response test server (both interpreted and compiled) before being adopted.

9. **`mkdirSync(dir, { recursive: true })` can throw `EEXIST` even though `dir` already exists, in a compiled Bun executable — also only found by running the real compiled `.exe`.** Reproduced specifically against `installStartup()`'s real target path (`%APPDATA%\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`, a folder that always already exists on a real Windows PC) — synthetic test paths of similar depth/structure did not reproduce it, so the exact trigger condition wasn't fully isolated, but the practical fix is simple and unconditionally safe: check `existsSync(dir)` first and only call `mkdirSync` if it's actually missing, rather than trusting `recursive: true`'s documented Node.js no-op-on-existing-directory behavior inside a compiled binary. Since the Startup folder always exists already, this bug would have failed on every single real `--install-startup` run, not as an edge case.

## File Structure

All work happens inside the existing `attendance-agent/` folder (this migration replaces its contents, it does not create a new top-level folder).

| File | Change |
|---|---|
| `attendance-agent/package.json` | Rewritten: drop `better-sqlite3`, `@types/better-sqlite3`, `dotenv`, `vitest`; add `@types/bun`; new scripts (`test`, `build`, `dev`) |
| `attendance-agent/tsconfig.json` | Rewritten for Bun's bundler resolution + `bun-types` |
| `attendance-agent/vitest.config.ts` | **Deleted** (no longer used) |
| `attendance-agent/package-lock.json` | **Deleted**, replaced by `bun.lock` |
| `attendance-agent/.gitignore` | Updated: drop `dist/` rule (no longer produced), add `*.exe` |
| `attendance-agent/src/paths.ts` | **New** — the dev-vs-compiled directory resolution helper (fact 4/5 above), shared by `db.ts`'s caller and the env loader |
| `attendance-agent/src/db.ts` | Ported to `bun:sqlite` (facts 1-3 above) |
| `attendance-agent/src/db.test.ts` | Ported to `bun:test` |
| `attendance-agent/src/hikvision.ts` | Unchanged logic; import path only |
| `attendance-agent/src/hikvision.test.ts` | Ported to `bun:test`'s mocking API |
| `attendance-agent/src/cloudApi.ts` | Unchanged logic |
| `attendance-agent/src/cloudApi.test.ts` | Ported to `bun:test`'s mocking API (manual global `fetch` stub/restore, no `vi.stubGlobal`) |
| `attendance-agent/src/monitor.ts` | Unchanged logic |
| `attendance-agent/src/monitor.test.ts` | Import path only (`vitest` → `bun:test`) |
| `attendance-agent/src/index.ts` | Drop `dotenv`; add manual `.env` loading via `paths.ts` (fact 6); resolve the SQLite DB path via `paths.ts` instead of a bare relative filename; add an `--install-startup` CLI branch (replaces `installStartup.ts`) |
| `attendance-agent/src/installStartup.ts` | **Deleted** — folded into `index.ts` |
| `attendance-agent/README.md` | Rewritten for the new one-file deployment flow |

---

### Task 1: Remove Node-specific project files, scaffold the Bun project

**Files:**
- Delete: `attendance-agent/vitest.config.ts`, `attendance-agent/package-lock.json`, `attendance-agent/src/digestFetch.d.ts` (confirm it doesn't exist — it was already removed during the original Task 11's hardening; if it's not there, that's correct, skip)
- Modify: `attendance-agent/package.json`, `attendance-agent/tsconfig.json`, `attendance-agent/.gitignore`

- [ ] **Step 1: Remove obsolete files**

```bash
cd attendance-agent
rm -f vitest.config.ts package-lock.json
rm -rf node_modules
```

- [ ] **Step 2: Replace `package.json`**

```json
{
  "name": "attendance-agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "test": "bun test",
    "build": "bun build ./src/index.ts --compile --outfile attendance-agent.exe"
  },
  "dependencies": {
    "digest-fetch": "^3.1.1"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14"
  }
}
```

- [ ] **Step 3: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

(Fixed after Task 2 found the gap: every later task in this plan uses `.ts`-extension relative imports, Bun's own convention — TypeScript 5.9's `moduleResolution: "bundler"` doesn't permit that by default without `allowImportingTsExtensions: true`, confirmed by hand.)

- [ ] **Step 4: Update `.gitignore`**

```
node_modules/
*.exe
*.db
*.db-wal
*.db-shm
```

(Drops the old `dist/` rule — `bun build --compile` writes directly to the named `.exe`, there's no intermediate `dist/` folder anymore. `bun.lock`, generated in the next step, should NOT be gitignored — commit it, same reasoning as committing `package-lock.json` before.)

- [ ] **Step 5: Install dependencies**

Run: `cd attendance-agent && bun install`
Expected: installs cleanly, generates `bun.lock`.

- [ ] **Step 6: Commit**

```bash
git add attendance-agent/package.json attendance-agent/tsconfig.json attendance-agent/.gitignore attendance-agent/bun.lock
git rm attendance-agent/vitest.config.ts attendance-agent/package-lock.json
git commit -m "chore: switch attendance-agent's project scaffold from Node.js to Bun"
```

(If `attendance-agent/src/digestFetch.d.ts` exists for some reason, `git rm` it too in this commit — it shouldn't, since it was already deleted in the original plan's Task 11 hardening pass, but confirm.)

---

### Task 2: Directory-resolution helper (`paths.ts`)

**Files:**
- Create: `attendance-agent/src/paths.ts`
- Test: `attendance-agent/src/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `attendance-agent/src/paths.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { basename } from "node:path";
import { getAppDir } from "./paths.ts";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd attendance-agent && bun test paths.test.ts`
Expected: FAIL — `Cannot find module './paths.ts'` (or similar "module not found")

- [ ] **Step 3: Write `paths.ts`**

Create `attendance-agent/src/paths.ts`:

```ts
import { basename, dirname } from "node:path";

/**
 * Resolves the real, on-disk directory this program should treat as "home" -
 * for locating the local SQLite database and an .env file next to it.
 *
 * `process.execPath` is the running executable's real path when compiled with
 * `bun build --compile` (confirmed correct even after the exe is copied or
 * renamed), but under `bun run`/`bun test` (not compiled) it instead points at
 * the `bun` binary itself, which has nothing to do with this project. Detect
 * that case by checking the execPath's basename and fall back to
 * `import.meta.dir`, which - unlike in a compiled executable, where it
 * resolves to a virtual bundle path - correctly gives this file's real source
 * directory when not compiled.
 */
export function getAppDir(): string {
  const execBasename = basename(process.execPath).toLowerCase();
  const isRunningViaBunCli = execBasename === "bun" || execBasename === "bun.exe";
  return isRunningViaBunCli ? import.meta.dir : dirname(process.execPath);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd attendance-agent && bun test paths.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add attendance-agent/src/paths.ts attendance-agent/src/paths.test.ts
git commit -m "feat: add dev-vs-compiled directory resolution helper"
```

---

### Task 3: Port `db.ts` to `bun:sqlite`

**Files:**
- Modify: `attendance-agent/src/db.ts`
- Modify: `attendance-agent/src/db.test.ts`

- [ ] **Step 1: Update the test file's imports**

In `attendance-agent/src/db.test.ts`, change the first line from:

```ts
import { describe, expect, it } from "vitest";
```

to:

```ts
import { describe, expect, it } from "bun:test";
```

No other changes needed in this file — `bun:test`'s `describe`/`it`/`expect` API matches `vitest`'s for the plain assertions this file uses (`toEqual`, `toBe`, `toHaveLength`, `toMatchObject`, `toBeNull`). Keep every existing test case exactly as-is.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd attendance-agent && bun test db.test.ts`
Expected: FAIL — errors from the still-`better-sqlite3`-based `db.ts` (e.g. `Cannot find package 'better-sqlite3'`, since it was removed from `package.json` in Task 1) or param-binding failures. Either way, confirms the port is genuinely needed before Step 3.

- [ ] **Step 3: Rewrite `db.ts`**

Replace the entire contents of `attendance-agent/src/db.ts` with:

```ts
import { Database } from "bun:sqlite";

export interface StoredPunch {
  id: number;
  deviceId: string;
  employeeNoString: string;
  punchedAt: string;
  synced: boolean;
}

export interface StoredDevice {
  id: string;
  name: string;
  ipAddress: string;
  username: string;
  password: string;
}

export function openDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  initSchema(db);
  return db;
}

export function initSchema(db: Database): void {
  db.exec(`
    create table if not exists devices (
      id text primary key,
      name text not null,
      ip_address text not null,
      username text not null,
      password text not null
    );

    create table if not exists punches (
      id integer primary key autoincrement,
      device_id text not null,
      employee_no_string text not null,
      punched_at text not null,
      raw_event_id text,
      synced integer not null default 0,
      unique (device_id, employee_no_string, punched_at)
    );
  `);
}

export function upsertDevices(db: Database, devices: StoredDevice[]): void {
  const stmt = db.prepare(`
    insert into devices (id, name, ip_address, username, password)
    values ($id, $name, $ipAddress, $username, $password)
    on conflict(id) do update set
      name = excluded.name,
      ip_address = excluded.ip_address,
      username = excluded.username,
      password = excluded.password
  `);
  const insertMany = db.transaction((rows: StoredDevice[]) => {
    for (const row of rows) {
      stmt.run({
        $id: row.id,
        $name: row.name,
        $ipAddress: row.ipAddress,
        $username: row.username,
        $password: row.password,
      });
    }
  });
  insertMany(devices);
}

export function listDevices(db: Database): StoredDevice[] {
  return db
    .query("select id, name, ip_address as ipAddress, username, password from devices")
    .all() as StoredDevice[];
}

export function insertPunchIfNew(
  db: Database,
  punch: { deviceId: string; employeeNoString: string; punchedAt: string; rawEventId: string | null },
): boolean {
  const result = db
    .prepare(
      `insert or ignore into punches (device_id, employee_no_string, punched_at, raw_event_id)
       values ($deviceId, $employeeNoString, $punchedAt, $rawEventId)`,
    )
    .run({
      $deviceId: punch.deviceId,
      $employeeNoString: punch.employeeNoString,
      $punchedAt: punch.punchedAt,
      $rawEventId: punch.rawEventId,
    });
  return result.changes > 0;
}

export function unsyncedPunches(db: Database): StoredPunch[] {
  const rows = db
    .query(
      `select id, device_id as deviceId, employee_no_string as employeeNoString, punched_at as punchedAt, synced
       from punches where synced = 0 order by punched_at asc`,
    )
    .all() as { id: number; deviceId: string; employeeNoString: string; punchedAt: string; synced: number }[];
  return rows.map((r) => ({ ...r, synced: Boolean(r.synced) }));
}

export function markSynced(db: Database, ids: number[]): void {
  if (ids.length === 0) return;
  const stmt = db.prepare("update punches set synced = 1 where id = $id");
  const markMany = db.transaction((idList: number[]) => {
    for (const id of idList) stmt.run({ $id: id });
  });
  markMany(ids);
}

export function recentPunches(db: Database, limit: number): StoredPunch[] {
  const rows = db
    .query(
      `select id, device_id as deviceId, employee_no_string as employeeNoString, punched_at as punchedAt, synced
       from punches order by punched_at desc limit $limit`,
    )
    .all({ $limit: limit }) as { id: number; deviceId: string; employeeNoString: string; punchedAt: string; synced: number }[];
  return rows.map((r) => ({ ...r, synced: Boolean(r.synced) }));
}

export function lastPunchTime(db: Database, deviceId: string): string | null {
  const row = db
    .query("select max(punched_at) as maxTime from punches where device_id = $deviceId")
    .get({ $deviceId: deviceId }) as { maxTime: string | null };
  return row.maxTime;
}

export function pendingCount(db: Database): number {
  const row = db.query("select count(*) as count from punches where synced = 0").get() as { count: number };
  return row.count;
}
```

Note every named parameter now uses a `$`-prefixed key in both the SQL text and the JS object passed to `.run()`/`.get()`/`.all()` — this is `bun:sqlite`'s binding convention (see the plan's "Key technical facts" #1). `db.query(sql)` is used instead of `better-sqlite3`'s `db.prepare(sql)` for read-only statements that don't need to be reused as a named `const stmt` (both exist on `bun:sqlite`'s `Database` and behave the same for this purpose; `db.prepare` is kept for the two statements this file explicitly reuses across a loop via `db.transaction`, matching the original code's structure as closely as possible).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd attendance-agent && bun test db.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add attendance-agent/src/db.ts attendance-agent/src/db.test.ts
git commit -m "feat: port the local SQLite layer from better-sqlite3 to bun:sqlite"
```

---

### Task 4: Port `hikvision.ts` and its tests

**Files:**
- Modify: `attendance-agent/src/hikvision.ts`
- Modify: `attendance-agent/src/hikvision.test.ts`

No logic changes are needed in `hikvision.ts` itself — `digest-fetch`, `fetch`, `crypto.randomUUID()`, and `AbortSignal.timeout()` all work identically under Bun (confirmed by hand). Only the test file's mocking approach changes, since `bun:test` doesn't have `vitest`'s `vi.mock(moduleSpecifier, factory)` — the equivalent is `mock.module(moduleSpecifier, factory)`.

- [ ] **Step 1: Confirm `hikvision.ts` needs no changes**

Read the current `attendance-agent/src/hikvision.ts` and confirm it has no `vitest`-specific or Node-specific-only imports (it shouldn't — it only imports `digest-fetch` and uses ambient globals). No edit needed to this file.

- [ ] **Step 2: Port `hikvision.test.ts`**

Replace the entire contents of `attendance-agent/src/hikvision.test.ts` with:

```ts
import { describe, expect, it, mock } from "bun:test";
import { parseAcsEventResponse } from "./hikvision.ts";

describe("parseAcsEventResponse", () => {
  it("extracts employee number and ISO punch time from a typical AcsEvent response", () => {
    const fixture = {
      AcsEvent: {
        searchID: "abc",
        responseStatusStrg: "OK",
        numOfMatches: 1,
        totalMatches: 1,
        InfoList: [
          {
            major: 5,
            minor: 75,
            time: "2026-08-10T08:03:12-04:00",
            employeeNoString: "42",
            name: "Juan Perez",
          },
        ],
      },
    };

    const punches = parseAcsEventResponse(fixture);

    expect(punches).toEqual([
      {
        employeeNoString: "42",
        punchedAt: new Date("2026-08-10T08:03:12-04:00").toISOString(),
        rawEventId: "42-2026-08-10T08:03:12-04:00",
      },
    ]);
  });

  it("skips entries with no employeeNoString (e.g. door-open events unrelated to a person)", () => {
    const fixture = {
      AcsEvent: {
        InfoList: [{ major: 5, minor: 38, time: "2026-08-10T08:00:00-04:00" }],
      },
    };

    expect(parseAcsEventResponse(fixture)).toEqual([]);
  });

  it("returns an empty array when InfoList is missing entirely (no events in range)", () => {
    expect(parseAcsEventResponse({ AcsEvent: { searchID: "abc", numOfMatches: 0 } })).toEqual([]);
  });

  it("skips an entry whose time value can't be parsed into a valid date, without dropping other entries", () => {
    const fixture = {
      AcsEvent: {
        InfoList: [
          { major: 5, minor: 75, time: "not-a-real-timestamp", employeeNoString: "42" },
          { major: 5, minor: 75, time: "2026-08-10T08:03:12-04:00", employeeNoString: "43" },
        ],
      },
    };

    const punches = parseAcsEventResponse(fixture);

    expect(punches).toEqual([
      {
        employeeNoString: "43",
        punchedAt: new Date("2026-08-10T08:03:12-04:00").toISOString(),
        rawEventId: "43-2026-08-10T08:03:12-04:00",
      },
    ]);
  });

  it("handles InfoList arriving as a single object instead of an array (observed on some Hikvision firmware with exactly one match)", () => {
    const fixture = {
      AcsEvent: {
        InfoList: { major: 5, minor: 75, time: "2026-08-10T08:03:12-04:00", employeeNoString: "42" },
      },
    };

    const punches = parseAcsEventResponse(fixture);

    expect(punches).toEqual([
      {
        employeeNoString: "42",
        punchedAt: new Date("2026-08-10T08:03:12-04:00").toISOString(),
        rawEventId: "42-2026-08-10T08:03:12-04:00",
      },
    ]);
  });
});

describe("fetchNewEvents", () => {
  it("POSTs an AcsEvent search with the expected URL, method, and body shape", async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      json: async () => ({ AcsEvent: { numOfMatches: 0, InfoList: [] } }),
    }));
    mock.module("digest-fetch", () => ({
      default: class {
        constructor(
          public user: string,
          public password: string,
        ) {}
        fetch = fetchMock;
      },
    }));
    const { fetchNewEvents } = await import(`./hikvision.ts?t=${Date.now()}`);

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const startTime = new Date("2026-08-10T00:00:00.000Z");
    const endTime = new Date("2026-08-10T23:59:59.000Z");
    await fetchNewEvents(device, startTime, endTime);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://192.168.1.50/ISAPI/AccessControl/AcsEvent?format=json");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    const sentBody = JSON.parse(options.body);
    expect(sentBody.AcsEventCond).toMatchObject({
      searchResultPosition: 0,
      maxResults: 200,
      major: 0,
      minor: 0,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
  });

  it("throws a descriptive error when the device responds with a non-ok HTTP status", async () => {
    mock.module("digest-fetch", () => ({
      default: class {
        fetch = mock(async () => ({ ok: false, status: 401 }));
      },
    }));
    const { fetchNewEvents } = await import(`./hikvision.ts?t=${Date.now()}`);

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "wrong" };
    await expect(fetchNewEvents(device, new Date(), new Date())).rejects.toThrow(/192\.168\.1\.50.*401/);
  });

  it("paginates through multiple pages when a page returns a full batch (numOfMatches equals the page size)", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          AcsEvent: {
            numOfMatches: 200,
            InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:00:00-04:00", employeeNoString: "1" }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          AcsEvent: {
            numOfMatches: 1,
            InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:02:00-04:00", employeeNoString: "3" }],
          },
        }),
      });
    mock.module("digest-fetch", () => ({
      default: class {
        fetch = fetchMock;
      },
    }));
    const { fetchNewEvents } = await import(`./hikvision.ts?t=${Date.now()}`);

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const result = await fetchNewEvents(
      device,
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-10T23:59:59.000Z"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.AcsEventCond.searchResultPosition).toBe(200);
    expect(result.punches.map((p) => p.employeeNoString)).toEqual(["1", "3"]);
    expect(result.hitPageCap).toBe(false);
  });

  it("stops after a bounded number of pages and reports hitPageCap when a device keeps reporting full pages", async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      json: async () => ({
        AcsEvent: {
          numOfMatches: 200,
          InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:00:00-04:00", employeeNoString: "1" }],
        },
      }),
    }));
    mock.module("digest-fetch", () => ({
      default: class {
        fetch = fetchMock;
      },
    }));
    const { fetchNewEvents } = await import(`./hikvision.ts?t=${Date.now()}`);

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const result = await fetchNewEvents(device, new Date(), new Date());

    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(result.hitPageCap).toBe(true);
  });
});
```

This mirrors the exact test coverage the Node.js version had (parser edge cases, request-shape assertion, error-throwing, pagination, and the page-cap signal), adapted to `bun:test`'s `mock.module()` for mocking the `digest-fetch` import. The `?t=${Date.now()}` cache-busting suffix on each dynamic `import()` is needed because `mock.module()` replaces a module's implementation for subsequent imports of that specifier — importing `hikvision.ts` fresh in each test (rather than via the file's top-level static import) ensures each test's `mock.module()` call is actually in effect when `hikvision.ts`'s own `import DigestFetch from "digest-fetch"` line resolves.

- [ ] **Step 3: Run the tests**

Run: `cd attendance-agent && bun test hikvision.test.ts`
Expected: PASS (9/9 — 5 parser tests + 4 fetchNewEvents tests; an earlier draft of this plan miscounted this as 10/5, fixed after Task 4 caught it)

If `mock.module()`'s exact behavior around re-importing the module under test doesn't work as written above (this is the one part of this task with real uncertainty, since `bun:test`'s module-mocking API has evolved across Bun versions), adjust the mocking mechanics to whatever actually works on the installed Bun version — the important thing to preserve is: no live network/device call, and the same assertions (request shape, error message, pagination behavior, page-cap signal) all still get verified. If you have to deviate from the exact code above, report DONE_WITH_CONCERNS explaining what changed and why.

- [ ] **Step 4: Commit**

```bash
git add attendance-agent/src/hikvision.test.ts
git commit -m "feat: port hikvision.ts tests to bun:test's mocking API"
```

(No changes to `hikvision.ts` itself, so it's not part of this commit unless Step 1 found something that needed fixing.)

---

### Task 5: Port `cloudApi.ts` tests

**Files:**
- Modify: `attendance-agent/src/cloudApi.test.ts`

No logic changes needed in `cloudApi.ts` (global `fetch` and `AbortSignal.timeout` both work identically under Bun). Only the test file changes — `bun:test` has no `vi.stubGlobal`/`vi.unstubAllGlobals` equivalent, so global `fetch` is stubbed and restored manually.

- [ ] **Step 1: Confirm `cloudApi.ts` needs no changes**

Read the current `attendance-agent/src/cloudApi.ts` and confirm it has no `vitest`-specific imports. No edit needed.

- [ ] **Step 2: Port `cloudApi.test.ts`**

Replace the entire contents of `attendance-agent/src/cloudApi.test.ts` with:

```ts
import { afterEach, describe, expect, it, mock } from "bun:test";
import { fetchDevices, postPunches } from "./cloudApi.ts";

const originalFetch = globalThis.fetch;

describe("cloudApi", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchDevices sends the shared secret as a Bearer token and returns the device list", async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      json: async () => ({
        devices: [
          { id: "d1", name: "Entrada", ip_address: "192.168.1.50", username: "admin", password: "secret" },
        ],
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const devices = await fetchDevices({ baseUrl: "https://example.com", secret: "shh" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api/attendance/devices");
    expect(options.headers).toEqual({ Authorization: "Bearer shh" });
    expect(devices).toEqual([
      { id: "d1", name: "Entrada", ip_address: "192.168.1.50", username: "admin", password: "secret" },
    ]);
  });

  it("fetchDevices throws with the response body detail when the cloud API responds with a non-2xx status", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":"Unauthorized"}',
    })) as unknown as typeof fetch;

    await expect(fetchDevices({ baseUrl: "https://example.com", secret: "wrong" })).rejects.toThrow(
      'HTTP 401 - {"error":"Unauthorized"}',
    );
  });

  it("falls back to a plain HTTP-status message when the response body can't be read", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error("body already consumed");
      },
    })) as unknown as typeof fetch;

    await expect(fetchDevices({ baseUrl: "https://example.com", secret: "shh" })).rejects.toThrow("HTTP 500");
  });

  it("postPunches sends the batch as JSON with the Bearer token", async () => {
    const fetchMock = mock(async () => ({ ok: true, json: async () => ({ synced: [] }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await postPunches({ baseUrl: "https://example.com", secret: "shh" }, [
      { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api/attendance/punches");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ Authorization: "Bearer shh", "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toEqual({
      punches: [{ device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" }],
    });
  });

  it("postPunches throws with the response body detail when the cloud API rejects the batch", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":"Unauthorized"}',
    })) as unknown as typeof fetch;

    await expect(
      postPunches({ baseUrl: "https://example.com", secret: "wrong" }, [
        { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
      ]),
    ).rejects.toThrow('HTTP 401 - {"error":"Unauthorized"}');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd attendance-agent && bun test cloudApi.test.ts`
Expected: PASS (5/5)

- [ ] **Step 4: Commit**

```bash
git add attendance-agent/src/cloudApi.test.ts
git commit -m "feat: port cloudApi.ts tests to bun:test with manual fetch stubbing"
```

---

### Task 6: Port `monitor.ts` test imports

**Files:**
- Modify: `attendance-agent/src/monitor.test.ts`

No logic changes needed anywhere — this file doesn't mock anything, it's pure input/output assertions.

- [ ] **Step 1: Update the import**

In `attendance-agent/src/monitor.test.ts`, change:

```ts
import { describe, expect, it } from "vitest";
import { renderMonitor } from "./monitor.js";
```

to:

```ts
import { describe, expect, it } from "bun:test";
import { renderMonitor } from "./monitor.ts";
```

(Bun's module resolution works with `.ts` extensions directly in relative imports, unlike the Node/`NodeNext` convention that required a `.js` extension pointing at the not-yet-compiled `.ts` source. Update every relative import across every file in this migration from `./foo.js` to `./foo.ts` for consistency — Task 3-5 above already show this for the files they touch; double-check this file too since it wasn't otherwise modified.)

No other changes — keep all 3 existing test cases exactly as-is.

- [ ] **Step 2: Run the tests**

Run: `cd attendance-agent && bun test monitor.test.ts`
Expected: PASS (3/3)

- [ ] **Step 3: Commit**

```bash
git add attendance-agent/src/monitor.test.ts
git commit -m "feat: port monitor.ts test imports to bun:test"
```

---

### Task 7: Rewrite `index.ts` — drop dotenv, resolve paths via `paths.ts`, fold in `--install-startup`

**Files:**
- Modify: `attendance-agent/src/index.ts`
- Delete: `attendance-agent/src/installStartup.ts`

No test file for this task (consistent with the original plan — pure wiring/orchestration, verified manually).

- [ ] **Step 1: Replace `index.ts`**

Replace the entire contents of `attendance-agent/src/index.ts` with:

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import {
  openDb,
  upsertDevices,
  listDevices,
  insertPunchIfNew,
  unsyncedPunches,
  markSynced,
  recentPunches,
  pendingCount,
  lastPunchTime,
} from "./db.ts";
import { fetchDevices, postPunches } from "./cloudApi.ts";
import { fetchNewEvents } from "./hikvision.ts";
import { renderMonitor, draw } from "./monitor.ts";
import { getAppDir } from "./paths.ts";

const appDir = getAppDir();

function loadEnvFile(): void {
  const envPath = join(appDir, ".env");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf-8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function installStartup(): void {
  const startupDir = join(
    homedir(),
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  const destPath = join(startupDir, basename(process.execPath));
  // Fixed after Task 8's smoke test caught a real bug: a compiled
  // `bun build --compile` executable can throw EEXIST from
  // `mkdirSync(dir, { recursive: true })` even though the dir already
  // exists - reproduced specifically against this real, deep,
  // always-already-existing Windows folder. Since the Startup folder always
  // already exists on a real PC, this failed every single time in practice,
  // not just as an edge case. Guard with existsSync instead of trusting
  // `recursive: true` to no-op on an existing directory.
  if (!existsSync(startupDir)) {
    mkdirSync(startupDir, { recursive: true });
  }
  copyFileSync(process.execPath, destPath);
  console.log(`Instalado: ${destPath}`);
  console.log("El agente se iniciará automáticamente la próxima vez que Windows inicie sesión.");
}

if (process.argv.includes("--install-startup")) {
  installStartup();
  process.exit(0);
}

loadEnvFile();

const cloudConfig = {
  baseUrl: requireEnv("CLOUD_API_BASE_URL"),
  secret: requireEnv("ATTENDANCE_AGENT_SECRET"),
};

const db = openDb(join(appDir, "attendance-agent.db"));
let lastError: string | null = null;

let refreshing = false;
async function refreshDevices(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const devices = await fetchDevices(cloudConfig);
    upsertDevices(
      db,
      devices.map((d) => ({
        id: d.id,
        name: d.name,
        ipAddress: d.ip_address,
        username: d.username,
        password: d.password,
      })),
    );
    lastError = null;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    refreshing = false;
  }
}

let polling = false;
async function pollDevices(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    for (const device of listDevices(db)) {
      try {
        const since = lastPunchTime(db, device.id);
        const startTime = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const endTime = new Date();
        const { punches: events, hitPageCap } = await fetchNewEvents(device, startTime, endTime);
        for (const event of events) {
          insertPunchIfNew(db, {
            deviceId: device.id,
            employeeNoString: event.employeeNoString,
            punchedAt: event.punchedAt,
            rawEventId: event.rawEventId,
          });
        }
        if (hitPageCap) {
          lastError = `${device.name}: recibió más de ${events.length} ponches en un solo ciclo; algunos registros antiguos podrían no haberse sincronizado`;
        }
      } catch (err) {
        lastError = `${device.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    polling = false;
  }
}

let syncing = false;
async function syncPunches(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const pending = unsyncedPunches(db);
    if (pending.length === 0) return;
    await postPunches(
      cloudConfig,
      pending.map((p) => ({
        device_id: p.deviceId,
        employee_no_string: p.employeeNoString,
        punched_at: p.punchedAt,
      })),
    );
    markSynced(
      db,
      pending.map((p) => p.id),
    );
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    syncing = false;
  }
}

function renderTick(): void {
  try {
    draw(
      renderMonitor({
        recent: recentPunches(db, 20),
        pendingCount: pendingCount(db),
        deviceCount: listDevices(db).length,
        lastError,
      }),
    );
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

async function main(): Promise<void> {
  await refreshDevices();
  renderTick();

  setInterval(() => {
    refreshDevices()
      .catch((err) => {
        lastError = err instanceof Error ? err.message : String(err);
      })
      .finally(renderTick);
  }, 5 * 60 * 1000);
  setInterval(() => {
    pollDevices()
      .catch((err) => {
        lastError = err instanceof Error ? err.message : String(err);
      })
      .finally(renderTick);
  }, 20 * 1000);
  setInterval(() => {
    syncPunches()
      .catch((err) => {
        lastError = err instanceof Error ? err.message : String(err);
      })
      .finally(renderTick);
  }, 25 * 1000);
}

main();
```

Changes from the Node.js version, all justified by this plan's "Key technical facts": no `import "dotenv/config"` (replaced by `loadEnvFile()`, rooted at `appDir` from `paths.ts`, not cwd); `openDb(join(appDir, "attendance-agent.db"))` instead of a bare relative filename (so the DB always lives next to the real executable regardless of launch-time `cwd`); a new `--install-startup` CLI branch at the top, checked and handled (then `process.exit(0)`) before anything else runs, so `attendance-agent.exe --install-startup` is now the entire "installer" — no separate compiled artifact. `installStartup()` copies the running executable itself (`process.execPath`, using the same "real path even if renamed/copied" guarantee from this plan's fact #4) into the real Startup folder under its own current filename (`basename(process.execPath)`, so if the user renamed it, the Startup copy keeps that name too). Every relative import uses `.ts` extensions (Bun's convention, not Node's `NodeNext` `.js`-pointing-at-`.ts` convention).

All orchestration logic (re-entrancy guards, per-device error isolation, exception-safe `renderTick`, `hitPageCap` signal, `.catch().finally()` on every interval) is preserved byte-for-byte from the already-twice-hardened Node.js version — none of that logic depended on Node.js specifically, so none of it needed to change.

- [ ] **Step 2: Delete `installStartup.ts`**

```bash
git rm attendance-agent/src/installStartup.ts
```

- [ ] **Step 3: Verify it type-checks and starts (without a real `.env`, confirm the expected failure)**

Run: `cd attendance-agent && bunx tsc --noEmit`
Expected: no errors.

Run: `cd attendance-agent && bun run dev`
Expected: prints `Error: Missing required environment variable: CLOUD_API_BASE_URL` and exits non-zero (there's no `.env` file in the repo, only `.env.example` — this confirms `requireEnv` and the new `loadEnvFile()` path resolution didn't silently break anything, and fails the same clear way the Node.js version did).

- [ ] **Step 4: Commit**

```bash
git add attendance-agent/src/index.ts
git commit -m "feat: port index.ts to Bun - drop dotenv, resolve paths via paths.ts, fold --install-startup into the main executable"
```

---

### Task 7b: Replace `digest-fetch` with a hand-written Digest-auth implementation

**Discovered mid-migration, during Task 8's own build-and-smoke-test step** (see "Key technical fact" #8 above for the full root-cause story) — building the executable and running it standalone (exactly as Task 8 instructs) crashed immediately on the first Hikvision poll with `ReferenceError: require is not defined`, traced by hand to `digest-fetch`'s transitive dependency `js-sha256` hiding a Node-only `require('crypto')` behind `eval(...)` to dodge static bundler analysis, which breaks specifically under `bun build --compile`. `bun test`/`bun run dev` never caught this because they don't go through the compiled bundling path at all. This task removes `digest-fetch` and its whole dependency tree, replacing it with a small hand-written implementation that only uses Bun-native APIs confirmed to survive compilation.

**Files:**
- Create: `attendance-agent/src/digestAuth.ts`
- Create: `attendance-agent/src/digestAuth.test.ts`
- Modify: `attendance-agent/src/hikvision.ts`
- Modify: `attendance-agent/src/hikvision.test.ts`
- Modify: `attendance-agent/package.json` (remove the `digest-fetch` dependency)

- [ ] **Step 1: Write the failing tests**

Create `attendance-agent/src/digestAuth.test.ts`:

```ts
import { afterEach, describe, expect, it, mock } from "bun:test";
import { digestFetch } from "./digestAuth.ts";

const originalFetch = globalThis.fetch;

describe("digestFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the response directly when no 401 challenge is issued", async () => {
    const fetchMock = mock(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await digestFetch("http://example.com/x", "admin", "secret", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it("returns the 401 response as-is when it has no Digest WWW-Authenticate header", async () => {
    const fetchMock = mock(async () => ({ ok: false, status: 401, headers: new Headers() }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await digestFetch("http://example.com/x", "admin", "secret", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });

  it("retries with a correctly-computed Digest Authorization header after a 401 challenge", async () => {
    function md5(text: string): string {
      const hasher = new Bun.CryptoHasher("md5");
      hasher.update(text);
      return hasher.digest("hex");
    }

    const realm = "TestRealm";
    const nonce = "dcd98b7102dd2f0e8b11d0f600bfb0c093";
    const username = "admin";
    const password = "secret123";

    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({
          "WWW-Authenticate": `Digest realm="${realm}", qop="auth", nonce="${nonce}", opaque="abc123"`,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await digestFetch("http://192.168.1.50/ISAPI/test?format=json", username, password, { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryOptions] = fetchMock.mock.calls[1];
    const authHeader = (retryOptions.headers as Record<string, string>).Authorization;
    expect(authHeader).toContain(`username="${username}"`);
    expect(authHeader).toContain(`realm="${realm}"`);
    expect(authHeader).toContain(`nonce="${nonce}"`);
    expect(authHeader).toContain('uri="/ISAPI/test?format=json"');

    // Independently recompute the expected response digest using the same
    // algorithm (with the actual nc/cnonce the client sent, since cnonce is
    // randomly generated per call) and confirm it matches - proving the
    // digest math itself is correct, not just that *a* response field exists.
    const ncMatch = authHeader.match(/nc=(\w+)/);
    const cnonceMatch = authHeader.match(/cnonce="([^"]+)"/);
    const responseMatch = authHeader.match(/response="([^"]+)"/);
    expect(ncMatch).not.toBeNull();
    expect(cnonceMatch).not.toBeNull();
    expect(responseMatch).not.toBeNull();
    const nc = ncMatch![1];
    const cnonce = cnonceMatch![1];
    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`POST:/ISAPI/test?format=json`);
    const expectedResponse = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    expect(responseMatch![1]).toBe(expectedResponse);
  });

  it("passes the abort signal through to both the initial and retried requests", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ "WWW-Authenticate": 'Digest realm="R", qop="auth", nonce="N"' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const controller = new AbortController();
    await digestFetch("http://example.com/x", "admin", "secret", { method: "GET", signal: controller.signal });

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[1][1].signal).toBe(controller.signal);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd attendance-agent && bun test digestAuth.test.ts`
Expected: FAIL — `Cannot find module './digestAuth.ts'`

- [ ] **Step 3: Write `digestAuth.ts`**

Create `attendance-agent/src/digestAuth.ts`:

```ts
function md5(text: string): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(text);
  return hasher.digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    result[match[1]] = match[2] ?? match[3];
  }
  return result;
}

export interface DigestFetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * Performs an HTTP request with RFC 2617 Digest authentication, retrying
 * once with credentials after an initial 401 challenge. Implemented by hand
 * (rather than via the `digest-fetch` npm package) because `digest-fetch`'s
 * transitive dependency `js-sha256` hides its `require('crypto')` call
 * behind `eval(...)` specifically to dodge static bundler analysis - which
 * breaks under `bun build --compile` (confirmed by hand: a compiled
 * executable that merely constructs a `DigestFetch` instance crashes with
 * `ReferenceError: require is not defined` the first time it's used). This
 * implementation only uses Bun's native `Bun.CryptoHasher` (confirmed
 * working both under `bun run` and compiled) and never touches Node's
 * `crypto` module or `require` at all.
 */
export async function digestFetch(
  url: string,
  username: string,
  password: string,
  options: DigestFetchOptions,
): Promise<Response> {
  const initialResponse = await fetch(url, { ...options, headers: options.headers, signal: options.signal });
  if (initialResponse.status !== 401) return initialResponse;

  const wwwAuth = initialResponse.headers.get("www-authenticate");
  if (!wwwAuth || !wwwAuth.toLowerCase().startsWith("digest ")) return initialResponse;

  const challenge = parseDigestChallenge(wwwAuth.slice(wwwAuth.indexOf(" ") + 1));
  const { realm, nonce, qop, opaque } = challenge;
  const parsedUrl = new URL(url);
  const uri = parsedUrl.pathname + parsedUrl.search;
  const method = options.method;
  const nc = "00000001";
  const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const authParts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    qop ? `qop=${qop}` : null,
    qop ? `nc=${nc}` : null,
    qop ? `cnonce="${cnonce}"` : null,
    `response="${response}"`,
    opaque ? `opaque="${opaque}"` : null,
  ].filter((v): v is string => v !== null);

  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Digest ${authParts.join(", ")}` },
    signal: options.signal,
  });
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd attendance-agent && bun test digestAuth.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Update `hikvision.ts` to use `digestFetch` instead of `digest-fetch`**

Replace the `import DigestFetch from "digest-fetch";` line and the `fetchNewEvents` function in `attendance-agent/src/hikvision.ts` — everything above `export interface DeviceCredentials` (i.e. `parseAcsEventResponse` and its supporting `AcsEventInfo` interface) is untouched. Replace from the import line through the end of the file with:

```ts
import { digestFetch } from "./digestAuth.ts";

// ... (AcsEventInfo interface, RawPunch interface, parseAcsEventResponse function - unchanged) ...

export interface DeviceCredentials {
  ipAddress: string;
  username: string;
  password: string;
}

const PAGE_SIZE = 200;
// Assumes the device returns time-windowed AcsEvent search results in
// ascending chronological order, so a capped fetch's already-captured
// punches still advance lastPunchTime correctly and the next poll picks
// up right after them. If a device is ever confirmed to return results
// in a different order, this self-healing property breaks and a capped
// fetch could permanently skip older events - watch for
// "hit the page cap" surfacing via FetchNewEventsResult.hitPageCap below.
const MAX_PAGES = 50;
const REQUEST_TIMEOUT_MS = 15_000;

export interface FetchNewEventsResult {
  punches: RawPunch[];
  hitPageCap: boolean;
}

export async function fetchNewEvents(
  device: DeviceCredentials,
  startTime: Date,
  endTime: Date,
): Promise<FetchNewEventsResult> {
  const allPunches: RawPunch[] = [];
  let hitPageCap = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await digestFetch(
      `http://${device.ipAddress}/ISAPI/AccessControl/AcsEvent?format=json`,
      device.username,
      device.password,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          AcsEventCond: {
            searchID: crypto.randomUUID(),
            searchResultPosition: page * PAGE_SIZE,
            maxResults: PAGE_SIZE,
            major: 0,
            minor: 0,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`Hikvision device ${device.ipAddress} returned HTTP ${response.status}`);
    }

    const body = await response.json();
    allPunches.push(...parseAcsEventResponse(body));

    const numOfMatches = (body as { AcsEvent?: { numOfMatches?: number } })?.AcsEvent?.numOfMatches ?? 0;
    if (numOfMatches < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) hitPageCap = true;
  }

  return { punches: allPunches, hitPageCap };
}
```

- [ ] **Step 6: Rewrite `hikvision.test.ts`'s `fetchNewEvents` tests**

Since `digestFetch` calls global `fetch` directly (no more constructed `DigestFetch` class instance to mock via `mock.module()`), replace the entire `describe("fetchNewEvents", ...)` block in `attendance-agent/src/hikvision.test.ts` with the simpler global-`fetch`-stubbing pattern already used in `cloudApi.test.ts` (leave the `describe("parseAcsEventResponse", ...)` block above it completely untouched):

```ts
const originalFetch = globalThis.fetch;

describe("fetchNewEvents", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs an AcsEvent search with the expected URL, method, and body shape", async () => {
    const fetchMock = mock(async (_url: string, _options: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ AcsEvent: { numOfMatches: 0, InfoList: [] } }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const startTime = new Date("2026-08-10T00:00:00.000Z");
    const endTime = new Date("2026-08-10T23:59:59.000Z");
    await fetchNewEvents(device, startTime, endTime);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://192.168.1.50/ISAPI/AccessControl/AcsEvent?format=json");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.AcsEventCond).toMatchObject({
      searchResultPosition: 0,
      maxResults: 200,
      major: 0,
      minor: 0,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
  });

  it("threads the device's username and password through to the Digest Authorization header", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({
          "WWW-Authenticate": 'Digest realm="DS-K1T321", qop="auth", nonce="abc123", opaque="xyz"',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ AcsEvent: { numOfMatches: 0, InfoList: [] } }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    await fetchNewEvents(device, new Date(), new Date());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallOptions = fetchMock.mock.calls[1][1];
    const authHeader = (secondCallOptions.headers as Record<string, string>).Authorization;
    expect(authHeader).toContain('username="admin"');
  });

  it("throws a descriptive error when the device responds with a non-ok HTTP status", async () => {
    globalThis.fetch = mock(async () => ({ ok: false, status: 401, headers: new Headers() })) as unknown as typeof fetch;

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "wrong" };
    await expect(fetchNewEvents(device, new Date(), new Date())).rejects.toThrow(/192\.168\.1\.50.*401/);
  });

  it("paginates through multiple pages when a page returns a full batch (numOfMatches equals the page size)", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          AcsEvent: {
            numOfMatches: 200,
            InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:00:00-04:00", employeeNoString: "1" }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          AcsEvent: {
            numOfMatches: 1,
            InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:02:00-04:00", employeeNoString: "3" }],
          },
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const result = await fetchNewEvents(
      device,
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-10T23:59:59.000Z"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondCallBody.AcsEventCond.searchResultPosition).toBe(200);
    expect(result.punches.map((p) => p.employeeNoString)).toEqual(["1", "3"]);
    expect(result.hitPageCap).toBe(false);
  });

  it("stops after a bounded number of pages and reports hitPageCap when a device keeps reporting full pages", async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        AcsEvent: {
          numOfMatches: 200,
          InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:00:00-04:00", employeeNoString: "1" }],
        },
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const result = await fetchNewEvents(device, new Date(), new Date());

    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(result.hitPageCap).toBe(true);
  });
});
```

Update the file's top `import` line accordingly: `import { afterEach, describe, expect, it, mock } from "bun:test";`.

- [ ] **Step 7: Remove `digest-fetch` from `package.json`**

In `attendance-agent/package.json`, remove the entire `"dependencies"` block's `"digest-fetch": "^3.1.1"` line (there will be no `dependencies` left at all — an empty `"dependencies": {}` or omitting the key entirely are both fine). Run `cd attendance-agent && bun install` afterward to regenerate `bun.lock` without it, and confirm `node_modules/digest-fetch`, `node_modules/js-sha256`, `node_modules/js-sha512`, `node_modules/md5`, `node_modules/base-64`, `node_modules/crypt`, `node_modules/charenc`, `node_modules/is-buffer` are all gone.

- [ ] **Step 8: Run the full suite and verify the build**

Run: `cd attendance-agent && bun test` — expected all tests pass (33 total: 8 `db.test.ts` + 10 `hikvision.test.ts` + 4 `digestAuth.test.ts` + 5 `cloudApi.test.ts` + 3 `monitor.test.ts` + 3 `paths.test.ts`).
Run: `cd attendance-agent && bunx tsc --noEmit` — expect clean.
Run: `cd attendance-agent && bun run build` — expect success.
Then repeat the exact smoke test from Task 8 below (compiled exe, standalone directory, real `.env`) and confirm it no longer crashes with the `require is not defined` error.

- [ ] **Step 9: Commit**

```bash
git add attendance-agent/src/digestAuth.ts attendance-agent/src/digestAuth.test.ts attendance-agent/src/hikvision.ts attendance-agent/src/hikvision.test.ts attendance-agent/package.json attendance-agent/bun.lock
git commit -m "fix: replace digest-fetch with a hand-written Digest-auth implementation

digest-fetch's transitive dependency js-sha256 hides a require('crypto')
call behind eval(...) to dodge static bundler analysis, which crashes
any bun build --compile'd executable that uses it with 'require is not
defined' - only discovered by actually running the compiled binary
(bun test/bun run never hit this path). Replaced with a ~50-line RFC
2617 implementation using only Bun.CryptoHasher, confirmed correct
against a real digest-challenge/response test server both interpreted
and compiled."
```

---

### Task 8: Build the real executable and manually smoke-test it

**Files:** none created/modified — this task runs the build and does a manual functional check, per the original plan's convention of manually verifying things that can't be unit-tested (a real compiled binary, real filesystem/Windows-Startup interaction).

- [ ] **Step 1: Run the full test suite one more time**

Run: `cd attendance-agent && bun test`
Expected: all tests pass (8 in `db.test.ts` + 10 in `hikvision.test.ts` + 4 in `digestAuth.test.ts` + 5 in `cloudApi.test.ts` + 3 in `monitor.test.ts` + 3 in `paths.test.ts` = 33 total — this count reflects the `recentPunches` test added during Task 3's review, the `isRunningViaBunCli` test added during Task 7's review, and Task 7b's `digest-fetch` replacement).

- [ ] **Step 2: Build the executable**

Run: `cd attendance-agent && bun run build`
Expected: produces `attendance-agent/attendance-agent.exe`, no errors. Note its size (expect roughly 80-100 MB — this bundles the entire Bun runtime plus `bun:sqlite`, which is why it's much larger than the old `dist/` folder was, and why the office PC needs zero additional installs).

- [ ] **Step 3: Smoke-test the compiled exe directly (not `bun run dev`)**

In a scratch directory OUTSIDE the git repo (so this doesn't risk leaving stray files in version control), copy the exe and a test `.env`:

```bash
mkdir -p /tmp/exe-smoke-test
cp attendance-agent/attendance-agent.exe /tmp/exe-smoke-test/
cd /tmp/exe-smoke-test
echo "CLOUD_API_BASE_URL=https://gente-business.vercel.app" > .env
echo "ATTENDANCE_AGENT_SECRET=<the real value from the Next.js app's Vercel env - ask the controller if you don't have it>" >> .env
./attendance-agent.exe
```

Expected: the console monitor renders (`=== Agente de Asistencia - Sanchez Business & Corp ===`, `Dispositivos registrados: 0`, etc. — 0 devices is correct since none are registered from this scratch location) and keeps updating. Press Ctrl+C to stop. This proves the exe is genuinely self-contained: it ran from a directory with no `node_modules`, no Bun install, nothing but the `.exe` and a `.env` file.

- [ ] **Step 4: Smoke-test `--install-startup`**

Still in `/tmp/exe-smoke-test`:

```bash
./attendance-agent.exe --install-startup
```

Expected: prints the "Instalado: ..." message with a path ending in `\Startup\attendance-agent.exe`, and exits immediately (does not start polling). Verify the file now exists at that path and is a copy of the same exe (e.g. compare file sizes). **Then immediately remove it** — this is a smoke test on the controller's own dev machine, not the real office PC, so leaving a real Startup entry behind would be an unwanted side effect exactly like the one caught and cleaned up during the original Node.js version's Task 15:

```bash
rm "$(powershell -NoProfile -Command '[Environment]::GetFolderPath("Startup")')\attendance-agent.exe"
```

(Adjust the removal command for whatever shell/OS the task actually runs on — the point is: confirm it worked, then clean it up, don't leave a real Startup-folder file behind on the dev machine.)

- [ ] **Step 5: Clean up the scratch test directory**

```bash
rm -rf /tmp/exe-smoke-test
```

- [ ] **Step 6: No commit for this task** (nothing to commit — the `.exe` itself is gitignored, and no source files changed). If Steps 1-4 all pass, proceed to Task 9. If anything fails, fix the underlying source in the relevant earlier task's files and re-run this task's verification from Step 1.

---

### Task 9: Rewrite the README for the one-file deployment flow

**Files:**
- Modify: `attendance-agent/README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# Attendance Agent

Runs on a Windows PC on the same network as the Hikvision terminal(s). Polls
each registered terminal every ~20 seconds, stores captures in a local SQLite
database (created next to this program), and syncs unsynced rows to the
GenteBusiness cloud API every ~25 seconds. Shows a live console view of
recent captures.

This is a single, self-contained `attendance-agent.exe` — no Node.js, no
installers, nothing else needs to be installed on the office PC to run it.

## Setup (one time, on the office PC)

1. Copy `attendance-agent.exe` to a permanent folder on the PC (for example,
   `C:\AttendanceAgent\`). Keep it in that same folder going forward — moving
   it later is fine, just make sure its `.env` file (next step) always stays
   right next to it.
2. In that same folder, create a plain text file named `.env` (not `.env.txt`
   - if Windows hides file extensions, use "Save As" and put quotes around
   the filename: `".env"`) with these two lines:
   ```
   ATTENDANCE_AGENT_SECRET=<must match the value set in the Next.js app's ATTENDANCE_AGENT_SECRET environment variable>
   CLOUD_API_BASE_URL=https://gente-business.vercel.app
   ```
3. Register each Hikvision terminal (name, IP, username, password) on the
   "Ponchadores" admin page in GenteBusiness (la IP y las credenciales del
   ponchador las debe tener quien instaló el equipo físicamente —
   normalmente se pueden confirmar desde el menú de red en la pantalla del
   propio ponchador). The agent picks these up automatically within 5 minutes
   of starting, no restart needed — if you register a terminal after already
   starting the agent in step 4 below, it's normal to see
   `Dispositivos registrados: 0` for up to 5 minutes; close the window and
   double-click the `.exe` again if you don't want to wait.
4. Test it manually first: double-click `attendance-agent.exe`. Run it
   directly like this (not with its output redirected to a file) - the live
   console monitor clears and redraws the screen, which only works in a real
   console window; if the output is piped or logged to a file instead, it
   will just keep appending instead of showing a clean live view. You should
   see the console monitor appear and update. Close the window (or Ctrl+C) to
   stop.
5. Once it's working, open a Command Prompt or PowerShell window in the same
   folder and run:
   ```
   .\attendance-agent.exe --install-startup
   ```
   This copies the program into your Windows Startup folder so it launches
   automatically the next time you log into Windows. To test that
   immediately without rebooting, double-click the copy it just made (the
   path is printed to the console).

## Troubleshooting

- **The window closes immediately with an error message, or shows an error
  and then a "Press any key to continue" prompt**: read the message above
  it - it's almost always a missing or misspelled line in `.env` (check both
  `ATTENDANCE_AGENT_SECRET` and `CLOUD_API_BASE_URL` are present, with no
  extra spaces or quotes around the values).
- **Console shows "Último error: ..."**: read the message — it names either
  a specific device (wrong IP/credentials/unreachable) or the cloud API
  (check `ATTENDANCE_AGENT_SECRET` matches on both sides). The agent keeps
  retrying automatically; nothing needs to be restarted.
- **The console window just keeps scrolling instead of showing a clean,
  updating view**: this means its output isn't going to a real interactive
  console (for example, it was started with output redirected to a log file,
  or from a launcher that captures output). Run it directly by
  double-clicking instead.
```

- [ ] **Step 2: Commit**

```bash
git add attendance-agent/README.md
git commit -m "docs: rewrite the README for the single-exe deployment flow"
```

---

### Task 10: Final checkpoint

- [ ] **Step 1: Run the full test suite one more time**

Run: `cd attendance-agent && bun test`
Expected: all tests pass (27 total, per Task 8 Step 1's count).

- [ ] **Step 2: Confirm the outer Next.js app's own test suite is unaffected**

Run: `npm test` from the repo root (not `attendance-agent/`).
Expected: same pre-existing pass/fail counts as before this migration (the known Supabase-auth-rate-limit flakiness, nothing else) — this migration touches nothing under `src/`/`supabase/`, so this is a pure regression check that the root `vitest.config.ts`'s `attendance-agent/**` exclusion (added earlier this session) still correctly keeps this project's `bun:sqlite`-dependent tests out of the Next.js app's own Node-based `vitest` run.

- [ ] **Step 3: Confirm no compiled/generated artifacts are tracked**

Run: `git status --porcelain` and `git status --porcelain --ignored | grep attendance-agent`.
Expected: clean working tree; `attendance-agent.exe`, `node_modules/`, and any `*.db` files show as ignored, not untracked-and-uncommitted.

- [ ] **Step 4: Report readiness**

Tell the user this migration is complete and ready for the same manual hardware verification the original plan's Task 16 called for (real Hikvision terminal, real office PC) — except now the deployment step is "copy one `.exe` and a `.env` file," not "install Node.js and run `npm install`/`npm run build`."
