import DigestFetch from "digest-fetch";

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

export async function fetchNewEvents(
  device: DeviceCredentials,
  startTime: Date,
  endTime: Date,
): Promise<RawPunch[]> {
  const client = new DigestFetch(device.username, device.password);
  const response = await client.fetch(`http://${device.ipAddress}/ISAPI/AccessControl/AcsEvent?format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      AcsEventCond: {
        searchID: crypto.randomUUID(),
        searchResultPosition: 0,
        maxResults: 200,
        major: 0,
        minor: 0,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hikvision device ${device.ipAddress} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  return parseAcsEventResponse(body);
}
