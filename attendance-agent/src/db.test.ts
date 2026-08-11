import { describe, expect, it } from "bun:test";
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

describe("db", () => {
  it("upserts and lists devices", () => {
    const db = openDb(":memory:");
    upsertDevices(db, [
      { id: "d1", name: "Entrada", ipAddress: "192.168.1.50", username: "admin", password: "secret" },
    ]);
    expect(listDevices(db)).toEqual([
      { id: "d1", name: "Entrada", ipAddress: "192.168.1.50", username: "admin", password: "secret" },
    ]);
  });

  it("updates an existing device on re-upsert instead of duplicating it", () => {
    const db = openDb(":memory:");
    upsertDevices(db, [
      { id: "d1", name: "Entrada", ipAddress: "192.168.1.50", username: "admin", password: "old" },
    ]);
    upsertDevices(db, [
      { id: "d1", name: "Entrada Principal", ipAddress: "192.168.1.51", username: "admin", password: "new" },
    ]);
    const devices = listDevices(db);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "d1",
      name: "Entrada Principal",
      ipAddress: "192.168.1.51",
      username: "admin",
      password: "new",
    });
  });

  it("inserts a new punch and reports it as unsynced", () => {
    const db = openDb(":memory:");
    const inserted = insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    expect(inserted).toBe(true);
    expect(pendingCount(db)).toBe(1);
    const unsynced = unsyncedPunches(db);
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0]).toMatchObject({
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      synced: false,
    });
  });

  it("ignores a duplicate punch for the same device/employee/timestamp", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    const insertedAgain = insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1-retry",
    });
    expect(insertedAgain).toBe(false);
    expect(pendingCount(db)).toBe(1);
  });

  it("marks punches as synced and excludes them from unsyncedPunches", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    const [punch] = unsyncedPunches(db);
    markSynced(db, [punch.id]);
    expect(unsyncedPunches(db)).toHaveLength(0);
    expect(pendingCount(db)).toBe(0);
  });

  it("returns null lastPunchTime for a device with no local punches yet", () => {
    const db = openDb(":memory:");
    expect(lastPunchTime(db, "d1")).toBeNull();
  });

  it("returns the max punched_at for a device with punches", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "43",
      punchedAt: "2026-08-10T09:00:00.000Z",
      rawEventId: "evt-2",
    });
    expect(lastPunchTime(db, "d1")).toBe("2026-08-10T09:00:00.000Z");
  });

  it("returns the most recent punches first, up to the given limit", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "43",
      punchedAt: "2026-08-10T09:00:00.000Z",
      rawEventId: "evt-2",
    });
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "44",
      punchedAt: "2026-08-10T10:00:00.000Z",
      rawEventId: "evt-3",
    });

    const limited = recentPunches(db, 2);
    expect(limited).toHaveLength(2);
    expect(limited.map((p) => p.employeeNoString)).toEqual(["44", "43"]);

    const all = recentPunches(db, 20);
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.employeeNoString)).toEqual(["44", "43", "42"]);
  });
});
