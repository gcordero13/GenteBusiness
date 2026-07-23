import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteUser, setUserPassword, updateUserRoleProfile } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockServerClient(flags: { can_manage: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "caller-id" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [flags], error: null }),
  };
}

function mockAdminClient({
  createUser,
  inviteUserByEmail,
  updateUserById,
  insertError,
  updateEqError,
}: {
  createUser?: ReturnType<typeof vi.fn>;
  inviteUserByEmail?: ReturnType<typeof vi.fn>;
  updateUserById?: ReturnType<typeof vi.fn>;
  insertError?: { message: string } | null;
  updateEqError?: { message: string } | null;
} = {}) {
  const eqMock = vi.fn().mockResolvedValue({ error: updateEqError ?? null });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  return {
    auth: {
      admin: {
        createUser: createUser ?? vi.fn(),
        inviteUserByEmail: inviteUserByEmail ?? vi.fn(),
        updateUserById: updateUserById ?? vi.fn(),
      },
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError ?? null }),
      update: updateMock,
    }),
    _mocks: { updateMock, eqMock },
  };
}

describe("inviteUser", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await inviteUser({ email: "new@example.com", roleProfileId: "profile-1" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("sends an email invite when no password is given", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const inviteUserByEmail = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const admin = mockAdminClient({ inviteUserByEmail });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await inviteUser({ email: "new@example.com", roleProfileId: "profile-1" });

    expect(result.error).toBeUndefined();
    expect(inviteUserByEmail).toHaveBeenCalledWith("new@example.com");
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates the user directly with a password when one is given, without sending an email", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-2" } }, error: null });
    const admin = mockAdminClient({ createUser });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await inviteUser({
      email: "new@example.com",
      roleProfileId: "profile-1",
      password: "secret123",
    });

    expect(result.error).toBeUndefined();
    expect(createUser).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "secret123",
      email_confirm: true,
    });
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe("setUserPassword", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await setUserPassword({ userId: "user-1", password: "secret123" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("updates the user's password when the caller can manage users", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const admin = mockAdminClient({ updateUserById });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await setUserPassword({ userId: "user-1", password: "secret123" });

    expect(result.error).toBeUndefined();
    expect(updateUserById).toHaveBeenCalledWith("user-1", { password: "secret123" });
  });
});

describe("updateUserRoleProfile", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await updateUserRoleProfile({ userId: "user-1", roleProfileId: "profile-2" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("updates the user's role profile when the caller can manage users", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const admin = mockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await updateUserRoleProfile({ userId: "user-1", roleProfileId: "profile-2" });

    expect(result.error).toBeUndefined();
    expect(admin.from).toHaveBeenCalledWith("app_users");
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ role_profile_id: "profile-2" });
    expect(admin._mocks.eqMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("surfaces the error when the update fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const admin = mockAdminClient({ updateEqError: { message: "update failed" } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await updateUserRoleProfile({ userId: "user-1", roleProfileId: "profile-2" });

    expect(result.error).toBe("update failed");
  });
});
