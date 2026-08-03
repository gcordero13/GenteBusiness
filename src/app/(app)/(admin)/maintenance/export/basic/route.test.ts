import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

function mockSupabase({
  canView = true,
  records = [] as unknown[],
}: { canView?: boolean; records?: unknown[] } = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.lt = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockResolvedValue({ data: records });

  return {
    rpc: vi.fn().mockResolvedValue({ data: [{ can_view: canView }] }),
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /maintenance/export/basic", () => {
  it("rejects callers without can_view on the maintenance module", async () => {
    const supabase = mockSupabase({ canView: false });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/basic"));

    expect(response.status).toBe(403);
  });

  it("does not filter the query when type/year are absent", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/basic"));

    expect(supabase._builder.eq).not.toHaveBeenCalled();
    expect(supabase._builder.gte).not.toHaveBeenCalled();
  });

  it("filters by type and year when both are present", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/basic?type=correctivo&year=2026"));

    expect(supabase._builder.eq).toHaveBeenCalledWith("type", "correctivo");
    expect(supabase._builder.gte).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00.000Z");
    expect(supabase._builder.lt).toHaveBeenCalledWith("created_at", "2027-01-01T00:00:00.000Z");
  });

  it("returns a CSV with the Tipo column populated", async () => {
    const supabase = mockSupabase({
      records: [
        {
          type: "correctivo",
          first_name: "Ana",
          last_name: "García",
          company_name: "Sanchez Business Corp",
          department_name: "TI",
          status: "completado",
          created_at: "2026-07-28T10:00:00+00:00",
          app_users: { full_name: "Luis Pérez", email: "luis@example.com" },
          maintenance_surveys: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/basic"));
    const csv = await response.text();

    expect(csv).toContain("Correctivo");
  });
});
