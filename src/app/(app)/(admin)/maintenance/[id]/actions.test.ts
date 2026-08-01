import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/sendMaintenanceEmail", () => ({ sendMaintenanceLinkEmail: vi.fn() }));
vi.mock("@/lib/siteUrl", () => ({ getSiteUrl: vi.fn().mockResolvedValue("https://example.com") }));

import { createClient } from "@/lib/supabase/server";
import { sendMaintenanceLinkEmail } from "@/lib/sendMaintenanceEmail";
import { sendMaintenanceLinkByEmail } from "./actions";

function mockSupabase({
  canAdd = true,
  record = {
    token: "tok-1",
    email: "ana@example.com",
    first_name: "Ana",
    last_name: "García",
    status: "pendiente",
  },
}: {
  canAdd?: boolean;
  record?: Record<string, unknown> | null;
} = {}) {
  const rpcMock = vi.fn().mockResolvedValue({ data: [{ can_add: canAdd }] });
  const singleMock = vi.fn().mockResolvedValue({ data: record, error: record ? null : { message: "not found" } });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return {
    rpc: rpcMock,
    from: vi.fn().mockReturnValue({ select: selectMock }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendMaintenanceLinkByEmail", () => {
  it("rejects callers without can_add on the maintenance module", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ canAdd: false }) as never);

    const result = await sendMaintenanceLinkByEmail("record-1");

    expect(result.error).toBe("No autorizado");
    expect(sendMaintenanceLinkEmail).not.toHaveBeenCalled();
  });

  it("rejects when the record is not found", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ record: null }) as never);

    const result = await sendMaintenanceLinkByEmail("record-1");

    expect(result.error).toBe("Mantenimiento no encontrado");
  });

  it("rejects when the contact has no email on file", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ record: { token: "tok-1", email: null, first_name: "Ana", last_name: "García", status: "pendiente" } }) as never,
    );

    const result = await sendMaintenanceLinkByEmail("record-1");

    expect(result.error).toBe("El contacto no tiene un correo registrado");
    expect(sendMaintenanceLinkEmail).not.toHaveBeenCalled();
  });

  it("sends the link email to the contact's address", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);

    const result = await sendMaintenanceLinkByEmail("record-1");

    expect(result.error).toBeUndefined();
    expect(sendMaintenanceLinkEmail).toHaveBeenCalledWith({
      userEmail: "ana@example.com",
      userName: "Ana García",
      linkUrl: "https://example.com/mantenimiento/tok-1",
    });
  });

  it("surfaces an error if sending fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);
    vi.mocked(sendMaintenanceLinkEmail).mockRejectedValueOnce(new Error("smtp down"));

    const result = await sendMaintenanceLinkByEmail("record-1");

    expect(result.error).toBe("smtp down");
  });
});
