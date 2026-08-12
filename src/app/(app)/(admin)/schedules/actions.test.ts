import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteScheduleTemplate, saveScheduleTemplate } from "./actions";

function mockAuthorizedCaller() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [{ can_manage: true }] }),
  } as never);
}

function mockUnauthorizedCaller() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [{ can_manage: false }] }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveScheduleTemplate", () => {
  it("rejects a caller without schedules can_manage", async () => {
    mockUnauthorizedCaller();

    const result = await saveScheduleTemplate({
      name: "Ventas",
      tolerance_minutes: 0,
      is_default: false,
      days: [],
    });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("unsets the previous default before saving a new default, and replaces the day rows", async () => {
    mockAuthorizedCaller();
    const unsetDefaultEq = vi.fn().mockResolvedValue({ error: null });
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });
    const deleteDaysEq = vi.fn().mockResolvedValue({ error: null });
    const insertDays = vi.fn().mockResolvedValue({ error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "schedule_templates") {
          return {
            update: vi.fn().mockReturnValue({ eq: unsetDefaultEq }),
            insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: deleteDaysEq }),
          insert: insertDays,
        };
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveScheduleTemplate({
      name: "Ventas",
      tolerance_minutes: 0,
      is_default: true,
      days: [{ day_of_week: 1, start_time: "09:00", end_time: "18:00" }],
    });

    expect(result.error).toBeUndefined();
    expect(unsetDefaultEq).toHaveBeenCalledWith("is_default", true);
    expect(deleteDaysEq).toHaveBeenCalledWith("schedule_template_id", "new-id");
    expect(insertDays).toHaveBeenCalledWith([
      { schedule_template_id: "new-id", day_of_week: 1, start_time: "09:00", end_time: "18:00" },
    ]);
  });

  it("rejects unchecking the default on the schedule that's currently the only default", async () => {
    mockAuthorizedCaller();
    const countMock = vi.fn().mockResolvedValue({ count: 0 });
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: countMock }) }),
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveScheduleTemplate({
      id: "current-default-id",
      name: "General",
      tolerance_minutes: 0,
      is_default: false,
      days: [],
    });

    expect(result.error).toBe("No se puede quitar el horario predeterminado sin marcar otro primero.");
  });

  it("allows saving as non-default when another schedule is still the default", async () => {
    mockAuthorizedCaller();
    const countMock = vi.fn().mockResolvedValue({ count: 1 });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const deleteDaysEq = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "schedule_templates") {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: countMock }) }),
            update: vi.fn().mockReturnValue({ eq: updateEq }),
          };
        }
        return { delete: vi.fn().mockReturnValue({ eq: deleteDaysEq }), insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveScheduleTemplate({
      id: "some-other-id",
      name: "Ventas",
      tolerance_minutes: 0,
      is_default: false,
      days: [],
    });

    expect(result.error).toBeUndefined();
  });

  it("saves a brand-new, non-default schedule without excluding any id from the default-count check", async () => {
    mockAuthorizedCaller();
    const countMock = vi.fn().mockResolvedValue({ count: 1 });
    // The `.eq()` step must itself resolve to `{ count, error }` when awaited
    // directly (the no-id branch never calls `.neq()`), while still exposing
    // `.neq` for the with-id branch exercised by the other tests above.
    const eqResult = Object.assign(Promise.resolve({ count: 1, error: null }), { neq: countMock });
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });
    const deleteDaysEq = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "schedule_templates") {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqResult) }),
            insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) }),
          };
        }
        return { delete: vi.fn().mockReturnValue({ eq: deleteDaysEq }), insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await saveScheduleTemplate({
      name: "Ventas",
      tolerance_minutes: 0,
      is_default: false,
      days: [],
    });

    expect(result.error).toBeUndefined();
    expect(countMock).not.toHaveBeenCalled();
  });
});

describe("deleteScheduleTemplate", () => {
  it("blocks deleting the schedule currently marked as default", async () => {
    mockAuthorizedCaller();
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { is_default: true } }) }),
        }),
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await deleteScheduleTemplate("some-id");

    expect(result.error).toBe(
      "No se puede eliminar el horario marcado como predeterminado. Marca otro horario como predeterminado primero.",
    );
  });

  it("deletes a non-default schedule", async () => {
    mockAuthorizedCaller();
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "schedule_templates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { is_default: false } }) }),
            }),
            delete: vi.fn().mockReturnValue({ eq: deleteEq }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await deleteScheduleTemplate("some-id");

    expect(result.error).toBeUndefined();
    expect(deleteEq).toHaveBeenCalledWith("id", "some-id");
  });
});
