import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getSharePointDownloadUrl, uploadToSharePoint } from "./sharepoint";

const ORIGINAL_ENV = { ...process.env };

describe("uploadToSharePoint", () => {
  beforeEach(() => {
    process.env.ONEDRIVE_CLIENT_ID = "test-client-id";
    process.env.ONEDRIVE_CLIENT_SECRET = "test-secret";
    process.env.ONEDRIVE_TENANT_ID = "test-tenant-id";
    process.env.SHAREPOINT_SITE_URL = "https://fciudaddelsol.sharepoint.com/sites/GoServices";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  test("acquires a token, resolves the site, uploads the file, and returns the web URL", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = url.toString();
      calls.push(href);
      if (href.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
      }
      if (href.includes("/v1.0/sites/fciudaddelsol.sharepoint.com:/sites/GoServices")) {
        return new Response(JSON.stringify({ id: "fake-site-id" }), { status: 200 });
      }
      if (href.includes("/v1.0/sites/fake-site-id/drive/root:/")) {
        expect(init?.method).toBe("PUT");
        return new Response(
          JSON.stringify({
            webUrl: "https://fciudaddelsol.sharepoint.com/sites/GoServices/file.jpg",
            id: "fake-item-id",
            parentReference: { driveId: "fake-drive-id" },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as unknown as typeof fetch;

    const result = await uploadToSharePoint(new Uint8Array([1, 2, 3]).buffer, "file.jpg", "image/jpeg");

    expect(result).toEqual({
      webUrl: "https://fciudaddelsol.sharepoint.com/sites/GoServices/file.jpg",
      driveId: "fake-drive-id",
      itemId: "fake-item-id",
    });
    expect(calls.some((c) => c.includes("/oauth2/v2.0/token"))).toBe(true);
    expect(calls.some((c) => c.includes("/v1.0/sites/fciudaddelsol.sharepoint.com:/sites/GoServices"))).toBe(true);
  });

  test("throws when the token request fails", async () => {
    globalThis.fetch = vi.fn(async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch;
    await expect(uploadToSharePoint(new Uint8Array([1]).buffer, "file.jpg", "image/jpeg")).rejects.toThrow();
  });
});

describe("getSharePointDownloadUrl", () => {
  beforeEach(() => {
    process.env.ONEDRIVE_CLIENT_ID = "test-client-id";
    process.env.ONEDRIVE_CLIENT_SECRET = "test-secret";
    process.env.ONEDRIVE_TENANT_ID = "test-tenant-id";
    process.env.SHAREPOINT_SITE_URL = "https://fciudaddelsol.sharepoint.com/sites/GoServices";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  test("acquires a token and returns the fresh download URL", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
      }
      if (href.includes("/v1.0/drives/fake-drive-id/items/fake-item-id")) {
        return new Response(
          JSON.stringify({ "@microsoft.graph.downloadUrl": "https://download.example.com/fake-blob" }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as unknown as typeof fetch;

    const url = await getSharePointDownloadUrl("fake-drive-id", "fake-item-id");
    expect(url).toBe("https://download.example.com/fake-blob");
  });

  test("throws when the response has no download URL", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(getSharePointDownloadUrl("fake-drive-id", "fake-item-id")).rejects.toThrow();
  });
});
