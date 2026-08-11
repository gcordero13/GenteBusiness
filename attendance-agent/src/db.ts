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
