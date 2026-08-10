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

async function refreshDevices(): Promise<void> {
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
  }
}

async function pollDevices(): Promise<void> {
  for (const device of listDevices(db)) {
    try {
      const since = lastPunchTime(db, device.id);
      const startTime = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endTime = new Date();
      const events = await fetchNewEvents(device, startTime, endTime);
      for (const event of events) {
        insertPunchIfNew(db, {
          deviceId: device.id,
          employeeNoString: event.employeeNoString,
          punchedAt: event.punchedAt,
          rawEventId: event.rawEventId,
        });
      }
    } catch (err) {
      lastError = `${device.name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

async function syncPunches(): Promise<void> {
  const pending = unsyncedPunches(db);
  if (pending.length === 0) return;
  try {
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
  }
}

function renderTick(): void {
  draw(
    renderMonitor({
      recent: recentPunches(db, 20),
      pendingCount: pendingCount(db),
      deviceCount: listDevices(db).length,
      lastError,
    }),
  );
}

async function main(): Promise<void> {
  await refreshDevices();
  renderTick();

  setInterval(() => void refreshDevices().then(renderTick), 5 * 60 * 1000);
  setInterval(() => void pollDevices().then(renderTick), 20 * 1000);
  setInterval(() => void syncPunches().then(renderTick), 25 * 1000);
}

main();
