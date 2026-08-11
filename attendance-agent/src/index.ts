import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
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
import { getAppDir, isRunningViaBunCli } from "./paths.ts";

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
  if (isRunningViaBunCli()) {
    throw new Error(
      "--install-startup must be run from the compiled attendance-agent.exe, not via `bun run` - " +
        "process.execPath would point at the Bun binary itself, not this program.",
    );
  }
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
  // Confirmed by hand: a compiled bun build --compile executable can throw
  // EEXIST from mkdirSync(dir, { recursive: true }) even though the dir
  // already exists - reproduced specifically against this real, deep,
  // always-already-existing Windows folder (synthetic test paths of similar
  // depth did not reproduce it). Since the Startup folder always already
  // exists on a real PC, this isn't an edge case - it would fail every time
  // in real deployment. Guard with existsSync instead of trusting
  // `recursive: true` to no-op on an existing directory.
  if (!existsSync(startupDir)) {
    mkdirSync(startupDir, { recursive: true });
  }
  copyFileSync(process.execPath, destPath);
  console.log(`Instalado: ${destPath}`);
  console.log("El agente se iniciará automáticamente la próxima vez que Windows inicie sesión.");
}

let cloudConfig: { baseUrl: string; secret: string };
let db: ReturnType<typeof openDb>;
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

async function waitForKeypressThenExit(code: number): Promise<never> {
  console.error("");
  console.error("Presiona Enter para cerrar esta ventana...");
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });
  process.exit(code);
}

async function bootstrap(): Promise<void> {
  if (process.argv.includes("--install-startup")) {
    installStartup();
    process.exit(0);
  }

  loadEnvFile();
  cloudConfig = {
    baseUrl: requireEnv("CLOUD_API_BASE_URL"),
    secret: requireEnv("ATTENDANCE_AGENT_SECRET"),
  };
  db = openDb(join(appDir, "attendance-agent.db"));

  await main();
}

bootstrap().catch(async (err) => {
  console.error("El agente no pudo iniciar:");
  console.error(err instanceof Error ? err.message : String(err));
  await waitForKeypressThenExit(1);
});
