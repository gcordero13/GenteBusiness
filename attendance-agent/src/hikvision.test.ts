import { afterEach, describe, expect, it, mock } from "bun:test";
import { fetchNewEvents, formatLocalIso, parseAcsEventResponse } from "./hikvision.ts";

describe("formatLocalIso", () => {
  // Computes the expected offset suffix the same way the implementation
  // does, rather than hardcoding e.g. "-04:00" - this test must pass
  // regardless of which timezone the machine running it is actually set to.
  function expectedOffsetSuffix(date: Date): string {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
    const mins = String(absOffset % 60).padStart(2, "0");
    return `${sign}${hours}:${mins}`;
  }

  it("formats local date/time components with the machine's actual UTC offset, not toISOString()'s UTC/Z format", () => {
    const date = new Date(2026, 7, 10, 6, 30, 47); // local: 2026-08-10 06:30:47
    const result = formatLocalIso(date);

    expect(result).toBe(`2026-08-10T06:30:47${expectedOffsetSuffix(date)}`);
    expect(result).not.toContain("Z");
    expect(result).not.toContain(".");
  });

  it("zero-pads single-digit month, day, hour, minute, and second", () => {
    const date = new Date(2026, 0, 5, 3, 4, 5); // local: 2026-01-05 03:04:05
    const result = formatLocalIso(date);

    expect(result).toBe(`2026-01-05T03:04:05${expectedOffsetSuffix(date)}`);
  });
});

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
      startTime: formatLocalIso(startTime),
      endTime: formatLocalIso(endTime),
    });
    // Confirmed by hand against a real DS-K1T321EFWX terminal: it rejects
    // toISOString()'s always-UTC "...Z" + milliseconds format with a
    // generic "badJsonFormat" error, so this specifically must NOT be what
    // gets sent.
    expect(sentBody.AcsEventCond.startTime).not.toBe(startTime.toISOString());
    expect(sentBody.AcsEventCond.startTime).not.toContain("Z");
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
