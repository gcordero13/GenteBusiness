import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { provisionContactLogin } from "./provisionContactLogin";

function mockAdmin({
  existingAppUser = null,
  viewerProfile = { id: "viewer-profile-id" },
  inviteResult = { data: { user: { id: "new-user-id" } }, error: null },
  listUsersResult = { data: { users: [] } },
  insertError = null,
}: {
  existingAppUser?: { id: string } | null;
  viewerProfile?: { id: string } | null;
  inviteResult?: { data: { user: { id: string } | null }; error: { message: string } | null };
  listUsersResult?: { data: { users: { id: string; email?: string }[] } };
  insertError?: { message: string } | null;
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const from = vi.fn((table: string) => {
    if (table === "app_users") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: existingAppUser }),
          }),
        }),
        insert,
      };
    }
    if (table === "role_profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: viewerProfile }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    from,
    insert,
    auth: {
      admin: {
        inviteUserByEmail: vi.fn().mockResolvedValue(inviteResult),
        listUsers: vi.fn().mockResolvedValue(listUsersResult),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionContactLogin", () => {
  it("does nothing when the email is empty", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await provisionContactLogin("");

    expect(admin.from).not.toHaveBeenCalled();
  });

  it("does nothing when an app_users row already exists for the email", async () => {
    const admin = mockAdmin({ existingAppUser: { id: "existing-id" } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await provisionContactLogin("ya-existe@empresa.com");

    expect(admin.insert).not.toHaveBeenCalled();
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("invites the email and creates a Viewer app_users row when none exists", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await provisionContactLogin("nuevo@empresa.com");

    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("nuevo@empresa.com");
    expect(admin.insert).toHaveBeenCalledWith({
      id: "new-user-id",
      email: "nuevo@empresa.com",
      role_profile_id: "viewer-profile-id",
    });
  });

  it("falls back to looking up an existing auth user if the invite fails", async () => {
    const admin = mockAdmin({
      inviteResult: { data: { user: null }, error: { message: "User already registered" } },
      listUsersResult: { data: { users: [{ id: "already-there-id", email: "repetido@empresa.com" }] } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await provisionContactLogin("repetido@empresa.com");

    expect(admin.insert).toHaveBeenCalledWith({
      id: "already-there-id",
      email: "repetido@empresa.com",
      role_profile_id: "viewer-profile-id",
    });
  });

  it("gives up quietly if the invite fails and no matching auth user is found", async () => {
    const admin = mockAdmin({
      inviteResult: { data: { user: null }, error: { message: "boom" } },
      listUsersResult: { data: { users: [] } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(provisionContactLogin("nadie@empresa.com")).resolves.toBeUndefined();
    expect(admin.insert).not.toHaveBeenCalled();
  });
});
