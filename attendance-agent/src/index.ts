import "dotenv/config";
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
} from "./db.js";
import { fetchDevices, postPunches } from "./cloudApi.js";
import { fetchNewEvents } from "./hikvision.js";
import { renderMonitor, draw } from "./monitor.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const cloudConfig = {
  baseUrl: requireEnv("CLOUD_API_BASE_URL"),
  secret: requireEnv("ATTENDANCE_AGENT_SECRET"),
};

const db = openDb("attendance-agent.db");
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
