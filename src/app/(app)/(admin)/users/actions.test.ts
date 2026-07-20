import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteUser } from "./actions";

function mockServerClient(flags: { can_manage: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "caller-id" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [flags], error: null }),
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
});
