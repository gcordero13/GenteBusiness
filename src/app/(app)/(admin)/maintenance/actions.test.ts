import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/maintenanceToken", () => ({
  generateMaintenanceToken: vi.fn().mockReturnValue("fixed-test-token"),
}));

import { createClient } from "@/lib/supabase/server";
import { createMaintenanceRecord, deleteMaintenanceRecord } from "./actions";

function mockSupabase({
  userId = "tech-1",
  contact = {
    first_name: "Ana",
    last_name: "García",
    position: "Analista",
    email: "ana@example.com",
    companies: { name: "Sanchez Business Corp" },
    departments: { name: "TI" },
  },
  contactError = null,
  insertError = null,
}: {
  userId?: string | null;
  contact?: unknown;
  contactError?: { message: string } | null;
  insertError?: { message: string } | null;
} = {}) {
  const singleMock = vi.fn().mockResolvedValue({ data: contact, error: contactError });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const insertMock = vi.fn().mockResolvedValue({ error: insertError });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
    from: vi.fn().mockReturnValue({ select: selectMock, insert: insertMock }),
    _mocks: { singleMock, eqMock, selectMock, insertMock },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMaintenanceRecord", () => {
  it("rejects when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ userId: null }) as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBe("No autorizado");
  });

  it("rejects when the contact is not found", async () => {
    const supabase = mockSupabase({ contact: null, contactError: { message: "not found" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBe("Contacto no encontrado");
  });

  it("creates a snapshot record and returns the generated token", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBeUndefined();
    expect(result.token).toBe("fixed-test-token");
    expect(supabase.from).toHaveBeenCalledWith("maintenance_records");
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "fixed-test-token",
        contact_id: "contact-1",
        created_by: "tech-1",
        first_name: "Ana",
        last_name: "García",
        position: "Analista",
        email: "ana@example.com",
        company_name: "Sanchez Business Corp",
        department_name: "TI",
      }),
    );
  });

  it("surfaces the insert error", async () => {
    const supabase = mockSupabase({ insertError: { message: "insert failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createMaintenanceRecord("contact-1");

    expect(result.error).toBe("insert failed");
  });
});

function mockSupabaseDelete({
  deleteError = null,
}: {
  deleteError?: { message: string } | null;
} = {}) {
  const secondEqMock = vi.fn().mockResolvedValue({ error: deleteError });
  const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
  const deleteMock = vi.fn().mockReturnValue({ eq: firstEqMock });

  return {
    from: vi.fn().mockReturnValue({ delete: deleteMock }),
    _mocks: { deleteMock, firstEqMock, secondEqMock },
  };
}

describe("deleteMaintenanceRecord", () => {
  it("scopes the delete query to the record id and pendiente status", async () => {
    const supabase = mockSupabaseDelete();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteMaintenanceRecord("record-1");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("maintenance_records");
    expect(supabase._mocks.deleteMock).toHaveBeenCalled();
    expect(supabase._mocks.firstEqMock).toHaveBeenCalledWith("id", "record-1");
    expect(supabase._mocks.secondEqMock).toHaveBeenCalledWith("status", "pendiente");
  });

  it("surfaces the delete error", async () => {
    const supabase = mockSupabaseDelete({ deleteError: { message: "delete failed" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await deleteMaintenanceRecord("record-1");

    expect(result.error).toBe("delete failed");
  });
});
