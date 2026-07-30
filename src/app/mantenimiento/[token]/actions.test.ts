import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/maintenanceAccess", () => ({ loadMaintenanceRecordByToken: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/completeMaintenanceRecord", () => ({ completeMaintenanceRecord: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { loadMaintenanceRecordByToken } from "@/lib/maintenanceAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeMaintenanceRecord } from "@/lib/completeMaintenanceRecord";
import { saveMaintenanceProgress, saveMaintenanceSignature } from "./actions";

function mockAdmin({ updateError = null, record = null }: { updateError?: { message: string } | null; record?: Record<string, unknown> | null } = {}) {
  const singleMock = vi.fn().mockResolvedValue({ data: record, error: updateError });
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock = vi.fn().mockReturnValue({ error: updateError, select: selectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({ update: updateMock }),
    storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
    _mocks: { updateMock, eqMock, uploadMock },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveMaintenanceProgress", () => {
  it("rejects an invalid token", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({ ok: false, reason: "not_found" });

    const result = await saveMaintenanceProgress("bad-token", { host_name: "PC-1" });

    expect(result.error).toBe("Enlace inválido o expirado");
  });

  it("rejects a completed record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "completado" } as never,
    });

    const result = await saveMaintenanceProgress("token-1", { host_name: "PC-1" });

    expect(result.error).toBe("Este mantenimiento ya fue completado");
  });

  it("updates the record fields for a pendiente record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente" } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveMaintenanceProgress("token-1", { host_name: "PC-1", ram: "16 GB" });

    expect(result.error).toBeUndefined();
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ host_name: "PC-1", ram: "16 GB" });
    expect(admin._mocks.eqMock).toHaveBeenCalledWith("id", "record-1");
  });
});

describe("saveMaintenanceSignature", () => {
  it("uploads the signature and, once both are present, completes the record", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente", technician_signature_path: "record-1/tecnico.png" } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveMaintenanceSignature("token-1", "user", "data:image/png;base64,AAAA");

    expect(result.error).toBeUndefined();
    expect(admin._mocks.uploadMock).toHaveBeenCalledWith(
      "record-1/usuario.png",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(completeMaintenanceRecord).toHaveBeenCalled();
  });

  it("does not attempt completion when only one signature is present", async () => {
    vi.mocked(loadMaintenanceRecordByToken).mockResolvedValue({
      ok: true,
      record: { id: "record-1", status: "pendiente", technician_signature_path: null } as never,
    });
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await saveMaintenanceSignature("token-1", "user", "data:image/png;base64,AAAA");

    expect(completeMaintenanceRecord).not.toHaveBeenCalled();
  });
});
