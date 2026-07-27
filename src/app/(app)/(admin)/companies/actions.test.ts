import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "./actions";

function mockSupabase(error: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const insert = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, update });
  return { from, insert, update, eq };
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
