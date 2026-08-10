import { describe, expect, it, vi } from "vitest";
import { fetchNewEvents, parseAcsEventResponse } from "./hikvision.js";

vi.mock("digest-fetch", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ AcsEvent: { InfoList: [] } }),
        }),
      };
    }),
  };
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

describe("fetchNewEvents", () => {
  it("POSTs an AcsEvent search with the expected URL, method, and body shape", async () => {
    const DigestFetch = (await import("digest-fetch")).default;
    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const startTime = new Date("2026-08-10T00:00:00.000Z");
    const endTime = new Date("2026-08-10T23:59:59.000Z");

    await fetchNewEvents(device, startTime, endTime);

    expect(DigestFetch).toHaveBeenCalledWith("admin", "secret");
    const instance = (DigestFetch as unknown as { mock: { results: { value: { fetch: ReturnType<typeof vi.fn> } }[] } })
      .mock.results[0].value;
    expect(instance.fetch).toHaveBeenCalledWith(
      "http://192.168.1.50/ISAPI/AccessControl/AcsEvent?format=json",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const call = instance.fetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.AcsEventCond).toMatchObject({
      searchResultPosition: 0,
      maxResults: 200,
      major: 0,
      minor: 0,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
    expect(typeof sentBody.AcsEventCond.searchID).toBe("string");
  });

  it("throws a descriptive error when the device responds with a non-ok HTTP status", async () => {
    const DigestFetch = (await import("digest-fetch")).default;
    (DigestFetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { fetch: vi.fn().mockResolvedValue({ ok: false, status: 401 }) };
    });

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "wrong" };
    await expect(fetchNewEvents(device, new Date(), new Date())).rejects.toThrow(/192\.168\.1\.50.*401/);
  });

  it("paginates through multiple pages when a page returns a full batch (numOfMatches equals the page size)", async () => {
    const DigestFetch = (await import("digest-fetch")).default;
    const fetchMock = vi
      .fn()
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
    (DigestFetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { fetch: fetchMock };
    });

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const { punches, hitPageCap } = await fetchNewEvents(
      device,
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-10T23:59:59.000Z"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.AcsEventCond.searchResultPosition).toBe(200);
    expect(punches.map((p) => p.employeeNoString)).toEqual(["1", "3"]);
    expect(hitPageCap).toBe(false);
  });

  it("stops after a bounded number of pages to avoid an unbounded loop if a device keeps reporting full pages", async () => {
    const DigestFetch = (await import("digest-fetch")).default;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AcsEvent: {
          numOfMatches: 200,
          InfoList: [{ major: 5, minor: 75, time: "2026-08-10T08:00:00-04:00", employeeNoString: "1" }],
        },
      }),
    });
    (DigestFetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { fetch: fetchMock };
    });

    const device = { ipAddress: "192.168.1.50", username: "admin", password: "secret" };
    const { hitPageCap } = await fetchNewEvents(device, new Date(), new Date());

    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(hitPageCap).toBe(true);
  });
});
