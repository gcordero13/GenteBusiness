import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/resolveVacationSupervisor", () => ({ resolveVacationSupervisor: vi.fn() }));
vi.mock("@/lib/sendVacationRequestEmail", () => ({ sendVacationRequestSubmittedEmail: vi.fn() }));
vi.mock("@/lib/siteUrl", () => ({ getSiteUrl: vi.fn().mockResolvedValue("https://example.com") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import { sendVacationRequestSubmittedEmail } from "@/lib/sendVacationRequestEmail";
import { createVacationRequest } from "./actions";

const VALID_INPUT = {
  period: "2026",
  daysRequested: 2,
  dateFrom: "2026-11-13",
  dateTo: "2026-11-14",
  returnDate: "2026-11-17",
  daysPending: 5,
  notes: "",
};

function mockSupabase({ userEmail = "ana@example.com" }: { userEmail?: string | null } = {}) {
  const insertSelectSingle = vi.fn().mockResolvedValue({ error: null });
  const insertMock = vi.fn().mockReturnValue({ select: () => ({ single: insertSelectSingle }) });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userEmail ? { id: "user-1", email: userEmail } : null } }),
    },
    from: vi.fn().mockReturnValue({ insert: insertMock }),
    _mocks: { insertMock, insertSelectSingle },
  };
}

// The action looks up the resolved supervisor's email via the admin client
// after inserting the request (a regular user's session can't read a
// coworker's app_users row under RLS, same reasoning as
// resolveVacationSupervisor's use of the admin client). Support that chained
// call here so tests can exercise the notification path.
function mockAdmin() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { email: "jefe@example.com" } });
  return {
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
});

describe("createVacationRequest", () => {
  it("rejects when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ userEmail: null }) as never);

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBe("No autorizado");
  });

  it("surfaces the resolver's error when the supervisor chain is broken", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({ ok: false, error: "No tienes un jefe directo asignado en tu ficha de contacto. Pide a un administrador que lo asigne antes de enviar una solicitud." });

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBe("No tienes un jefe directo asignado en tu ficha de contacto. Pide a un administrador que lo asigne antes de enviar una solicitud.");
    expect(sendVacationRequestSubmittedEmail).not.toHaveBeenCalled();
  });

  it("creates the request and emails the resolved supervisor", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({
      ok: true,
      data: {
        contactId: "contact-1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      },
    });

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("vacation_requests");
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: "contact-1",
        requester_app_user_id: "user-1",
        first_name: "Ana",
        last_name: "García",
        supervisor_app_user_id: "sup-1",
        status: "pendiente_supervisor",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
      }),
    );
    expect(sendVacationRequestSubmittedEmail).toHaveBeenCalled();
  });
});
