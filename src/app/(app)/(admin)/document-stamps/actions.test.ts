import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { deleteSeal, deleteSignature, saveSignature, uploadSeal } from "./actions";

function mockSupabase({
  uploadError = null,
  insertError = null,
  removeError = null,
  deleteError = null,
  userId = "user-1",
}: {
  uploadError?: { message: string } | null;
  insertError?: { message: string } | null;
  removeError?: { message: string } | null;
  deleteError?: { message: string } | null;
  userId?: string;
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        remove: vi.fn().mockResolvedValue({ error: removeError }),
      }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: deleteError }),
      }),
    }),
  };
}

function formDataFor(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadSeal", () => {
  it("rejects when required fields are missing", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);

    const result = await uploadSeal(formDataFor({ companyId: "", name: "", file: "" }));

    expect(result.error).toBe("Completa todos los campos");
  });

  it("uploads the file and inserts the row when everything succeeds", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const file = new File(["png-bytes"], "sello.png", { type: "image/png" });

    const result = await uploadSeal(formDataFor({ companyId: "company-1", name: "Sello oficial", file }));

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("company-seals");
    expect(supabase.from).toHaveBeenCalledWith("company_seals");
  });

  it("surfaces the storage error and does not insert a row if upload fails", async () => {
    const supabase = mockSupabase({ uploadError: { message: "upload failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const file = new File(["png-bytes"], "sello.png", { type: "image/png" });

    const result = await uploadSeal(formDataFor({ companyId: "company-1", name: "Sello oficial", file }));

    expect(result.error).toBe("upload failed");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("deleteSeal", () => {
  it("removes the storage object and deletes the row", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteSeal("seal-1", "company-1/123_sello.png");

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("company-seals");
  });
});

describe("saveSignature", () => {
  it("rejects when there is no authenticated user", async () => {
    const supabase = mockSupabase();
    supabase.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveSignature("data:image/png;base64,AAAA");

    expect(result.error).toBe("No autorizado");
  });

  it("uploads the decoded PNG under the user's own folder and inserts the row", async () => {
    const supabase = mockSupabase({ userId: "user-42" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await saveSignature("data:image/png;base64,AAAA");

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("user-signatures");
    expect(supabase.from).toHaveBeenCalledWith("user_signatures");
  });
});

describe("deleteSignature", () => {
  it("removes the storage object and deletes the row", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteSignature("sig-1", "user-42/firma_123.png");

    expect(result.error).toBeUndefined();
    expect(supabase.storage.from).toHaveBeenCalledWith("user-signatures");
  });
});
