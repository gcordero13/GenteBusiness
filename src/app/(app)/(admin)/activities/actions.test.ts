import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { deleteActivity } from "./actions";

function mockSupabaseDelete({ deleteError = null }: { deleteError?: { message: string } | null } = {}) {
  const eqMock = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ delete: deleteMock }), _mocks: { deleteMock, eqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteActivity", () => {
  it("deletes the activity", async () => {
    const supabase = mockSupabaseDelete();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteActivity("activity-1");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("company_events");
    expect(supabase._mocks.eqMock).toHaveBeenCalledWith("id", "activity-1");
  });

  it("surfaces delete errors", async () => {
    const supabase = mockSupabaseDelete({ deleteError: { message: "delete failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteActivity("activity-1");

    expect(result.error).toBe("delete failed");
  });
});
