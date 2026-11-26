import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
/** Rows each table returns for the lookup, keyed by the column filtered first. */
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
vi.mock("@/lib/sharepoint", () => ({ getSharePointDownloadUrl: async () => "https://sharepoint.example/download" }));

const { GET } = await import("./route");

const call = () =>
  GET(new Request("https://x.test/api/aprendizaje/archivo/d1/i1"), { params: Promise.resolve({ driveId: "d1", itemId: "i1" }) });

function permisos(canManage: boolean) {
  rpc.mockImplementation(async (name: string) =>
    name === "get_my_module_permissions" ? { data: [{ can_view: true, can_manage: canManage }] } : { data: false },
  );
}

describe("GET /api/aprendizaje/archivo — certificate signature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rows = { firma_drive_id: [{ id: "c1" }] };
  });

  it("lets a manager preview the signature", async () => {
    permisos(true);
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://sharepoint.example/download");
  });

  it("hides the signature from learners", async () => {
    permisos(false);
    expect((await call()).status).toBe(403);
  });
});
