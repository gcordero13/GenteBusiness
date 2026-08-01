import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { deleteCompany, saveCompany } from "./actions";

function mockSupabase(error: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const insert = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, update });
  return { from, insert, update, eq };
}

function mockSupabaseDelete({ deleteError = null }: { deleteError?: { code?: string; message: string } | null } = {}) {
  const eqMock = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ delete: deleteMock }), _mocks: { deleteMock, eqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveCompany", () => {
  it("inserts a new company with its logo_url when no id is given", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveCompany(undefined, "Acme", "https://cdn.example.com/acme.png");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("companies");
    expect(supabase.insert).toHaveBeenCalledWith({
      name: "Acme",
      logo_url: "https://cdn.example.com/acme.png",
    });
  });

  it("updates an existing company's logo_url when an id is given", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveCompany("company-1", "Acme", null);

    expect(result.error).toBeUndefined();
    expect(supabase.update).toHaveBeenCalledWith({ name: "Acme", logo_url: null });
    expect(supabase.eq).toHaveBeenCalledWith("id", "company-1");
  });

  it("surfaces the database error", async () => {
    const supabase = mockSupabase({ message: "boom" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveCompany(undefined, "Acme", null);

    expect(result.error).toBe("boom");
  });
});

describe("deleteCompany", () => {
  it("deletes the company", async () => {
    const supabase = mockSupabaseDelete();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteCompany("company-1");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("companies");
    expect(supabase._mocks.eqMock).toHaveBeenCalledWith("id", "company-1");
  });

  it("surfaces a friendly message when contacts still reference the company (FK violation)", async () => {
    const supabase = mockSupabaseDelete({ deleteError: { code: "23503", message: "violates foreign key constraint" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteCompany("company-1");

    expect(result.error).toBe("No se puede eliminar: hay contactos asignados a esta empresa. Reasígnalos o elimínalos primero.");
  });

  it("surfaces other delete errors as-is", async () => {
    const supabase = mockSupabaseDelete({ deleteError: { message: "delete failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteCompany("company-1");

    expect(result.error).toBe("delete failed");
  });
});
