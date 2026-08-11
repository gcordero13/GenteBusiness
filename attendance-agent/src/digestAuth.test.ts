import { afterEach, describe, expect, it, mock } from "bun:test";
import { digestFetch } from "./digestAuth.ts";

const originalFetch = globalThis.fetch;

describe("digestFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the response directly when no 401 challenge is issued", async () => {
    const fetchMock = mock(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await digestFetch("http://example.com/x", "admin", "secret", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it("returns the 401 response as-is when it has no Digest WWW-Authenticate header", async () => {
    const fetchMock = mock(async () => ({ ok: false, status: 401, headers: new Headers() }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await digestFetch("http://example.com/x", "admin", "secret", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });

  it("retries with a correctly-computed Digest Authorization header after a 401 challenge", async () => {
    function md5(text: string): string {
      const hasher = new Bun.CryptoHasher("md5");
      hasher.update(text);
      return hasher.digest("hex");
    }

    const realm = "TestRealm";
    const nonce = "dcd98b7102dd2f0e8b11d0f600bfb0c093";
    const username = "admin";
    const password = "secret123";

    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({
          "WWW-Authenticate": `Digest realm="${realm}", qop="auth", nonce="${nonce}", opaque="abc123"`,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await digestFetch("http://192.168.1.50/ISAPI/test?format=json", username, password, { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryOptions] = fetchMock.mock.calls[1];
    const authHeader = (retryOptions.headers as Record<string, string>).Authorization;
    expect(authHeader).toContain(`username="${username}"`);
    expect(authHeader).toContain(`realm="${realm}"`);
    expect(authHeader).toContain(`nonce="${nonce}"`);
    expect(authHeader).toContain('uri="/ISAPI/test?format=json"');

    // Independently recompute the expected response digest using the same
    // algorithm (with the actual nc/cnonce the client sent, since cnonce is
    // randomly generated per call) and confirm it matches - proving the
    // digest math itself is correct, not just that *a* response field exists.
    const ncMatch = authHeader.match(/nc=(\w+)/);
    const cnonceMatch = authHeader.match(/cnonce="([^"]+)"/);
    const responseMatch = authHeader.match(/response="([^"]+)"/);
    expect(ncMatch).not.toBeNull();
    expect(cnonceMatch).not.toBeNull();
    expect(responseMatch).not.toBeNull();
    const nc = ncMatch![1];
    const cnonce = cnonceMatch![1];
    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`POST:/ISAPI/test?format=json`);
    const expectedResponse = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    expect(responseMatch![1]).toBe(expectedResponse);
  });

  it("passes the abort signal through to both the initial and retried requests", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ "WWW-Authenticate": 'Digest realm="R", qop="auth", nonce="N"' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const controller = new AbortController();
    await digestFetch("http://example.com/x", "admin", "secret", { method: "GET", signal: controller.signal });

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[1][1].signal).toBe(controller.signal);
  });
});
