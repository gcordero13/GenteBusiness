import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const getSharePointPreviewUrl = vi.fn();
/** Rows each lookup returns, keyed by the column filtered first. */
let rows: Record<string, unknown[]> = {};

function from() {
  let key = "";
  const chain = {
    select: () => chain,
    eq: (column: string) => {
      if (!key) key = column;
      return chain;
    },
    limit: async () => ({ data: rows[key] ?? [] }),
  };
  return chain;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, rpc, from }) }));
vi.mock("@/lib/sharepoint", () => ({
  getSharePointPreviewUrl: (...a: unknown[]) => getSharePointPreviewUrl(...a),
}));

const { GET } = await import("./route");

const call = () =>
  GET(new Request("https://x.test/api/aprendizaje/archivo/d1/i1/vista"), {
    params: Promise.resolve({ driveId: "d1", itemId: "i1" }),
  });

describe("GET /api/aprendizaje/archivo/[driveId]/[itemId]/vista", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockResolvedValue({ data: false });
    rows = {};
  });

  it("returns Microsoft's viewer URL for a lesson guide the person can see", async () => {
    rows = { drive_id: [{ id: "a1" }] };
    getSharePointPreviewUrl.mockResolvedValue("https://viewer.example/embed?x=1");
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://viewer.example/embed?x=1" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getSharePointPreviewUrl).toHaveBeenCalledWith("d1", "i1");
  });

  it("refuses files of courses the person can't see", async () => {
    const res = await call();
    expect(res.status).toBe(403);
    expect(getSharePointPreviewUrl).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
  });

  it("offers the download when Microsoft can't preview it", async () => {
    rows = { drive_id: [{ id: "a1" }] };
    getSharePointPreviewUrl.mockRejectedValue(new Error("Graph 404"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "No se pudo mostrar este archivo aquí. Puedes descargarlo." });
  });
});
