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

describe("GET /maintenance/export/detailed", () => {
  it("rejects callers without can_view on the maintenance module", async () => {
    const supabase = mockSupabase({ canView: false });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/detailed"));

    expect(response.status).toBe(403);
  });

  it("filters by type and year when both are present", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/detailed?type=preventivo&year=2025"));

    expect(supabase._builder.eq).toHaveBeenCalledWith("type", "preventivo");
    expect(supabase._builder.gte).toHaveBeenCalledWith("created_at", "2025-01-01T00:00:00.000Z");
    expect(supabase._builder.lt).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00.000Z");
  });

  it("does not filter the query when type/year are absent", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await GET(new NextRequest("https://example.com/maintenance/export/detailed"));

    expect(supabase._builder.eq).not.toHaveBeenCalled();
    expect(supabase._builder.gte).not.toHaveBeenCalled();
  });

  it("includes the Correctivo field values in the CSV for a correctivo record", async () => {
    const supabase = mockSupabase({
      records: [
        {
          type: "correctivo",
          first_name: "Ana",
          last_name: "García",
          email: "ana@example.com",
          position: "Analista",
          company_name: "Sanchez Business Corp",
          department_name: "TI",
          status: "completado",
          created_at: "2026-07-28T10:00:00+00:00",
          completed_at: "2026-07-28T11:00:00+00:00",
          host_name: "DESKTOP-ANA",
          ram: "16 GB",
          os: "Windows 11",
          storage_total: "512 GB",
          storage_used: "200 GB",
          storage_free: "312 GB",
          restore_point_created: null,
          temp_files_cleaned: null,
          disk_defragmented: null,
          antivirus_updated: null,
          windows_updated: null,
          agenda_installed: null,
          apps_match_profile: null,
          wallpaper_installed: null,
          keyboard_cleaned: null,
          screen_cleaned: null,
          problema_reportado: "No enciende",
          diagnostico: "Fuente dañada",
          solucion_aplicada: "Se reemplazó la fuente",
          repuestos_piezas: "Fuente 500W",
          findings: null,
          observations: null,
          technician_signed_at: null,
          user_signed_at: null,
          app_users: { full_name: "Luis Pérez", email: "luis@example.com" },
          maintenance_surveys: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const response = await GET(new NextRequest("https://example.com/maintenance/export/detailed"));
    const csv = await response.text();

    expect(csv).toContain("No enciende");
    expect(csv).toContain("Fuente dañada");
    expect(csv).toContain("Se reemplazó la fuente");
    expect(csv).toContain("Fuente 500W");
  });
});
