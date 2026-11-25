import { describe, expect, it, vi } from "vitest";
import { chunkRanges, uploadFileInChunks, UPLOAD_CHUNK_BYTES } from "./chunkedUpload";

describe("chunkRanges", () => {
  it("uses 5 MiB chunks, a multiple of 320 KiB as Graph requires", () => {
    expect(UPLOAD_CHUNK_BYTES).toBe(5 * 1024 * 1024);
    expect(UPLOAD_CHUNK_BYTES % (320 * 1024)).toBe(0);
  });

  it("splits into inclusive byte ranges", () => {
    expect(chunkRanges(25, 10)).toEqual([
      { start: 0, end: 9 },
      { start: 10, end: 19 },
      { start: 20, end: 24 },
    ]);
    expect(chunkRanges(10, 10)).toEqual([{ start: 0, end: 9 }]);
    expect(chunkRanges(0, 10)).toEqual([]);
  });
});

describe("uploadFileInChunks", () => {
  function response(status: number, body: unknown = {}) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  it("PUTs each chunk with Content-Range and returns the created drive item", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(202))
      .mockResolvedValueOnce(response(202))
      .mockResolvedValueOnce(response(201, { id: "item-1", parentReference: { driveId: "drive-1" } }));
    const progress: number[] = [];

    const result = await uploadFileInChunks(new Blob(["x".repeat(25)]), "https://upload.example/session", {
      chunkBytes: 10,
      fetchImpl,
      onProgress: (f) => progress.push(f),
    });

    expect(result).toEqual({ driveId: "drive-1", itemId: "item-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [url, init] = fetchImpl.mock.calls[2];
    expect(url).toBe("https://upload.example/session");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Range"]).toBe("bytes 20-24/25");
    expect((init.body as Blob).size).toBe(5);
    expect(progress).toEqual([0.4, 0.8, 1]);
  });

  it("throws when a chunk fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(500));
    await expect(
      uploadFileInChunks(new Blob(["abc"]), "https://upload.example/session", { chunkBytes: 10, fetchImpl }),
    ).rejects.toThrow("La subida falló (500)");
  });

  it("throws when the last chunk does not return the drive item", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(202));
    await expect(
      uploadFileInChunks(new Blob(["abc"]), "https://upload.example/session", { chunkBytes: 10, fetchImpl }),
    ).rejects.toThrow("La subida terminó sin confirmar el archivo");
  });
});
