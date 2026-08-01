import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { deleteDepartment } from "./actions";

function mockSupabaseDelete({ deleteError = null }: { deleteError?: { code?: string; message: string } | null } = {}) {
  const eqMock = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ delete: deleteMock }), _mocks: { deleteMock, eqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteDepartment", () => {
  it("deletes the department", async () => {
    const supabase = mockSupabaseDelete();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteDepartment("dept-1");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("departments");
    expect(supabase._mocks.eqMock).toHaveBeenCalledWith("id", "dept-1");
  });

  it("surfaces a friendly message when contacts still reference the department (FK violation)", async () => {
    const supabase = mockSupabaseDelete({ deleteError: { code: "23503", message: "violates foreign key constraint" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteDepartment("dept-1");

    expect(result.error).toBe(
      "No se puede eliminar: hay contactos asignados a este departamento. Reasígnalos o elimínalos primero.",
    );
  });

  it("surfaces other delete errors as-is", async () => {
    const supabase = mockSupabaseDelete({ deleteError: { message: "delete failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteDepartment("dept-1");

    expect(result.error).toBe("delete failed");
  });
});
