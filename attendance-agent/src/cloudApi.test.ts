import { afterEach, describe, expect, it, mock } from "bun:test";
import { fetchDevices, postPunches } from "./cloudApi.ts";

const originalFetch = globalThis.fetch;

describe("cloudApi", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchDevices sends the shared secret as a Bearer token and returns the device list", async () => {
    const fetchMock = mock(async (_url: string, _options: RequestInit) => ({
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
    const fetchMock = mock(async (_url: string, _options: RequestInit) => ({
      ok: true,
      json: async () => ({ synced: [] }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await postPunches({ baseUrl: "https://example.com", secret: "shh" }, [
      { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api/attendance/punches");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ Authorization: "Bearer shh", "Content-Type": "application/json" });
    expect(JSON.parse(options.body as string)).toEqual({
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
