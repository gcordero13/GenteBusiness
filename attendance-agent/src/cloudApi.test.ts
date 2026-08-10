import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDevices, postPunches } from "./cloudApi.js";

describe("cloudApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchDevices sends the shared secret as a Bearer token and returns the device list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        devices: [
          { id: "d1", name: "Entrada", ip_address: "192.168.1.50", username: "admin", password: "secret" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const devices = await fetchDevices({ baseUrl: "https://example.com", secret: "shh" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/attendance/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer shh" } }),
    );
    expect(devices).toEqual([
      { id: "d1", name: "Entrada", ip_address: "192.168.1.50", username: "admin", password: "secret" },
    ]);
  });

  it("fetchDevices throws with the response body detail when the cloud API responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"Unauthorized"}' }),
    );

    await expect(fetchDevices({ baseUrl: "https://example.com", secret: "wrong" })).rejects.toThrow(
      'HTTP 401 - {"error":"Unauthorized"}',
    );
  });

  it("falls back to a plain HTTP-status message when the response body can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error("body already consumed");
        },
      }),
    );

    await expect(fetchDevices({ baseUrl: "https://example.com", secret: "shh" })).rejects.toThrow("HTTP 500");
  });

  it("postPunches sends the batch as JSON with the Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ synced: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await postPunches({ baseUrl: "https://example.com", secret: "shh" }, [
      { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/attendance/punches",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer shh", "Content-Type": "application/json" },
        body: JSON.stringify({
          punches: [{ device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" }],
        }),
      }),
    );
  });

  it("postPunches throws with the response body detail when the cloud API rejects the batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"Unauthorized"}' }),
    );

    await expect(
      postPunches({ baseUrl: "https://example.com", secret: "wrong" }, [
        { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
      ]),
    ).rejects.toThrow('HTTP 401 - {"error":"Unauthorized"}');
  });
});
