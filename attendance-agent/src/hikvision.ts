import { digestFetch } from "./digestAuth.ts";

interface AcsEventInfo {
  employeeNoString?: string;
  time?: string;
}

export interface RawPunch {
  employeeNoString: string;
  punchedAt: string;
  rawEventId: string;
}

export function parseAcsEventResponse(body: unknown): RawPunch[] {
  const rawInfoList = (body as { AcsEvent?: { InfoList?: AcsEventInfo[] | AcsEventInfo } })?.AcsEvent?.InfoList;
  const infoList = Array.isArray(rawInfoList) ? rawInfoList : rawInfoList ? [rawInfoList] : [];
  return infoList
    .filter(
      (entry): entry is Required<AcsEventInfo> =>
        Boolean(entry.employeeNoString && entry.time && !Number.isNaN(new Date(entry.time).getTime())),
    )
    .map((entry) => ({
      employeeNoString: entry.employeeNoString,
      punchedAt: new Date(entry.time).toISOString(),
      rawEventId: `${entry.employeeNoString}-${entry.time}`,
    }));
}

export interface DeviceCredentials {
  ipAddress: string;
  username: string;
  password: string;
}

/**
 * Formats a Date as "YYYY-MM-DDTHH:mm:ss±HH:mm" (local time, explicit
 * numeric UTC offset, no milliseconds) instead of Date.toISOString()'s
 * always-UTC "...Z" format with milliseconds. Confirmed by hand against a
 * real DS-K1T321EFWX terminal (firmware V3.9.3): a request using
 * toISOString()'s format was rejected with a generic "badJsonFormat" error,
 * while the exact same request using this local-offset format succeeded -
 * the device's date parser is stricter than plain JSON syntax validation
 * would suggest from the error name alone.
 */
export function formatLocalIso(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${offsetHours}:${offsetMins}`
  );
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
            startTime: formatLocalIso(startTime),
            endTime: formatLocalIso(endTime),
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
