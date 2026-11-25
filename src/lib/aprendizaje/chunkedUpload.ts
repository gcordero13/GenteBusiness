// Graph upload sessions need every chunk except the last to be a multiple
// of 320 KiB; 5 MiB (16 x 320 KiB) is Microsoft's recommended size.
export const UPLOAD_CHUNK_BYTES = 16 * 320 * 1024;

export function chunkRanges(totalBytes: number, chunkBytes = UPLOAD_CHUNK_BYTES): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (let start = 0; start < totalBytes; start += chunkBytes) {
    ranges.push({ start, end: Math.min(start + chunkBytes, totalBytes) - 1 });
  }
  return ranges;
}

interface GraphDriveItem {
  id: string;
  parentReference: { driveId: string };
}

/**
 * Uploads a file to a Graph upload session from the browser. The uploadUrl
 * is pre-authenticated, so no Authorization header is sent (Graph rejects
 * it). Intermediate chunks answer 202; the last one answers 200/201 with
 * the created drive item.
 */
export async function uploadFileInChunks(
  file: Blob,
  uploadUrl: string,
  options: { onProgress?: (fraction: number) => void; fetchImpl?: typeof fetch; chunkBytes?: number } = {},
): Promise<{ driveId: string; itemId: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const total = file.size;

  for (const { start, end } of chunkRanges(total, options.chunkBytes)) {
    const res = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end}/${total}` },
      body: file.slice(start, end + 1),
    });
    if (!res.ok) throw new Error(`La subida falló (${res.status})`);
    options.onProgress?.((end + 1) / total);
    if (res.status === 200 || res.status === 201) {
      const item = (await res.json()) as GraphDriveItem;
      return { driveId: item.parentReference.driveId, itemId: item.id };
    }
  }
  throw new Error("La subida terminó sin confirmar el archivo");
}
