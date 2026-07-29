import { describe, expect, it } from "vitest";
import { isMaintenanceLinkExpired } from "./maintenanceAccess";

describe("isMaintenanceLinkExpired", () => {
  it("returns false when now is before expiresAt", () => {
    const expiresAt = new Date("2026-08-27T00:00:00Z").toISOString();
    const now = new Date("2026-07-28T00:00:00Z");
    expect(isMaintenanceLinkExpired(expiresAt, now)).toBe(false);
  });

  it("returns true when now is after expiresAt", () => {
    const expiresAt = new Date("2026-07-01T00:00:00Z").toISOString();
    const now = new Date("2026-07-28T00:00:00Z");
    expect(isMaintenanceLinkExpired(expiresAt, now)).toBe(true);
  });
});

import { beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { loadMaintenanceRecordByToken } from "./maintenanceAccess";

function mockAdmin(record: Record<string, unknown> | null, updateError: { message: string } | null = null) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: record, error: record ? null : { message: "not found" } });
  const eqSelectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock });
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock, update: updateMock }), _mocks: { updateMock, updateEqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadMaintenanceRecordByToken", () => {
  it("returns not_found when no record matches the token", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(null) as never);

    const result = await loadMaintenanceRecordByToken("missing-token");

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns expired and flips status when a pendiente record is past expires_at", async () => {
    const admin = mockAdmin({
      id: "record-1",
      status: "pendiente",
      expires_at: new Date(Date.now() - 1000 * 60).toISOString(),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await loadMaintenanceRecordByToken("old-token");

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ status: "expirado" });
  });

  it("returns the record when it is pendiente and not expired", async () => {
    const record = {
      id: "record-1",
      status: "pendiente",
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(record) as never);

    const result = await loadMaintenanceRecordByToken("good-token");

    expect(result).toEqual({ ok: true, record });
  });
});
