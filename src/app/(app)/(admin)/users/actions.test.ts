import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteUser,
  inviteUser,
  setUserPassword,
  setUserStatus,
  updateUserFullName,
  updateUserRoleProfile,
} from "./actions";

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
  deleteUser: deleteUserMock,
  insertError,
  updateEqError,
}: {
  createUser?: ReturnType<typeof vi.fn>;
  inviteUserByEmail?: ReturnType<typeof vi.fn>;
  updateUserById?: ReturnType<typeof vi.fn>;
  deleteUser?: ReturnType<typeof vi.fn>;
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
        updateUserById: updateUserById ?? vi.fn().mockResolvedValue({ error: null }),
        deleteUser: deleteUserMock ?? vi.fn().mockResolvedValue({ error: null }),
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

describe("updateUserFullName", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await updateUserFullName({ userId: "user-1", fullName: "Ana Pérez" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("updates the user's full name when the caller can manage users", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const admin = mockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await updateUserFullName({ userId: "user-1", fullName: "Ana Pérez" });

    expect(result.error).toBeUndefined();
    expect(admin.from).toHaveBeenCalledWith("app_users");
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ full_name: "Ana Pérez" });
    expect(admin._mocks.eqMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("stores an empty name as null", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const admin = mockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await updateUserFullName({ userId: "user-1", fullName: "" });

    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ full_name: null });
  });

  it("surfaces the error when the update fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const admin = mockAdminClient({ updateEqError: { message: "update failed" } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await updateUserFullName({ userId: "user-1", fullName: "Ana Pérez" });

    expect(result.error).toBe("update failed");
  });
});

describe("setUserStatus", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await setUserStatus({ userId: "user-1", status: "deactivated" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("bans the user and marks them deactivated", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const admin = mockAdminClient({ updateUserById });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await setUserStatus({ userId: "user-1", status: "deactivated" });

    expect(result.error).toBeUndefined();
    expect(updateUserById).toHaveBeenCalledWith("user-1", { ban_duration: expect.any(String) });
    expect(updateUserById.mock.calls[0][1].ban_duration).not.toBe("none");
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ status: "deactivated" });
    expect(admin._mocks.eqMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("lifts the ban and marks the user active again", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const admin = mockAdminClient({ updateUserById });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await setUserStatus({ userId: "user-1", status: "active" });

    expect(result.error).toBeUndefined();
    expect(updateUserById).toHaveBeenCalledWith("user-1", { ban_duration: "none" });
    expect(admin._mocks.updateMock).toHaveBeenCalledWith({ status: "active" });
  });

  it("surfaces the error when banning the user fails, without touching the status column", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const updateUserById = vi.fn().mockResolvedValue({ error: { message: "ban failed" } });
    const admin = mockAdminClient({ updateUserById });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await setUserStatus({ userId: "user-1", status: "deactivated" });

    expect(result.error).toBe("ban failed");
    expect(admin._mocks.updateMock).not.toHaveBeenCalled();
  });

  it("surfaces the error when the status column update fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const admin = mockAdminClient({ updateEqError: { message: "update failed" } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await setUserStatus({ userId: "user-1", status: "deactivated" });

    expect(result.error).toBe("update failed");
  });
});

describe("deleteUser", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await deleteUser("user-1");

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("deletes the auth user when the caller can manage users", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null });
    const admin = mockAdminClient({ deleteUser: deleteUserMock });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await deleteUser("user-1");

    expect(result.error).toBeUndefined();
    expect(deleteUserMock).toHaveBeenCalledWith("user-1");
  });

  it("surfaces the error when deletion fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    const deleteUserMock = vi.fn().mockResolvedValue({ error: { message: "delete failed" } });
    const admin = mockAdminClient({ deleteUser: deleteUserMock });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await deleteUser("user-1");

    expect(result.error).toBe("delete failed");
  });
});
