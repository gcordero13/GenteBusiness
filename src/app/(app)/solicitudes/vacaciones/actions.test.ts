import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/resolveVacationSupervisor", () => ({ resolveVacationSupervisor: vi.fn() }));
vi.mock("@/lib/sendVacationRequestEmail", () => ({
  sendVacationRequestSubmittedEmail: vi.fn(),
  sendVacationRequestSupervisorDecisionEmail: vi.fn(),
  sendVacationRequestRrhhDecisionEmail: vi.fn(),
}));
vi.mock("@/lib/siteUrl", () => ({ getSiteUrl: vi.fn().mockResolvedValue("https://example.com") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import { sendVacationRequestSubmittedEmail, sendVacationRequestSupervisorDecisionEmail, sendVacationRequestRrhhDecisionEmail } from "@/lib/sendVacationRequestEmail";
import { createVacationRequest, respondAsRrhh, respondAsSupervisor } from "./actions";

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

  it("still succeeds when the notification email fails to send", async () => {
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
    vi.mocked(sendVacationRequestSubmittedEmail).mockRejectedValue(new Error("Configuración SMTP incompleta"));

    const result = await createVacationRequest(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(result).toEqual({});
    expect(supabase._mocks.insertMock).toHaveBeenCalled();
  });
});

function mockSupabaseForRespond({
  userId = "sup-1",
  request,
  updateError = null,
  updatedRows = [{ id: "req-1" }],
  canAuthorize = true,
}: {
  userId?: string;
  request: Record<string, unknown> | null;
  updateError?: { message: string } | null;
  updatedRows?: Record<string, unknown>[] | null;
  canAuthorize?: boolean;
}) {
  const requestSingleMock = vi.fn().mockResolvedValue({ data: request, error: request ? null : { message: "not found" } });
  const requestEqMock = vi.fn().mockReturnValue({ single: requestSingleMock });
  const requestSelectMock = vi.fn().mockReturnValue({ eq: requestEqMock });

  const updateSelectMock = vi.fn().mockResolvedValue({ data: updateError ? null : updatedRows, error: updateError });
  const updateEqMock = vi.fn().mockReturnValue({ select: updateSelectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [{ can_authorize: canAuthorize }], error: null }),
    from: vi.fn().mockReturnValue({ select: requestSelectMock, update: updateMock }),
    _mocks: { requestSelectMock, requestEqMock, requestSingleMock, updateMock, updateEqMock, updateSelectMock },
  };
}

// The real respondAsSupervisor code resolves rrhhEmails through a 3-table
// lookup (modules -> role_profile_permissions where can_authorize -> app_users
// matching those role_profile_ids and status = 'active') instead of a
// nonexistent app_users.role_profile_id-only shortcut. app_users is also
// queried separately (via .eq().maybeSingle()) to look up the notified
// employee's email, so its mock needs to support both chain shapes.
function mockAdminForRespond({ rrhhEmails = [] }: { rrhhEmails?: string[] } = {}) {
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  return {
    storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
    from: vi.fn((table: string) => {
      if (table === "modules") {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: { id: "module-1" }, error: null }) }),
          }),
        };
      }
      if (table === "role_profile_permissions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: rrhhEmails.length > 0 ? [{ role_profile_id: "rrhh-profile-1" }] : [],
                }),
            }),
          }),
        };
      }
      if (table === "app_users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { email: "empleado@example.com" } }),
            }),
            in: () => ({
              eq: () => Promise.resolve({ data: rrhhEmails.map((email) => ({ email })) }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    _mocks: { uploadMock },
  };
}

const BASE_REQUEST = {
  id: "req-1",
  status: "pendiente_supervisor",
  requester_app_user_id: "emp-1",
  supervisor_app_user_id: "sup-1",
  first_name: "Ana",
  last_name: "García",
};

describe("respondAsSupervisor", () => {
  it("rejects when the caller is not the request's resolved supervisor", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRespond({ userId: "someone-else", request: BASE_REQUEST }) as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "");

    expect(result.error).toBe("No autorizado");
  });

  it("rejects when the request is not awaiting the supervisor", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabaseForRespond({ request: { ...BASE_REQUEST, status: "pendiente_rrhh" } }) as never,
    );

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "");

    expect(result.error).toBe("Esta solicitud ya no está pendiente de tu aprobación");
  });

  it("requires a signature to approve", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRespond({ request: BASE_REQUEST }) as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "", "");

    expect(result.error).toBe("Se requiere una firma para aprobar");
  });

  it("approves, uploads the signature, and moves the request to pendiente_rrhh", async () => {
    const supabase = mockSupabaseForRespond({ request: BASE_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond({ rrhhEmails: ["rrhh@example.com"] }) as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "Todo en orden");

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pendiente_rrhh", supervisor_decision: "aprobado", supervisor_comments: "Todo en orden" }),
    );
    expect(sendVacationRequestSupervisorDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });

  it("rejects without requiring a signature", async () => {
    const supabase = mockSupabaseForRespond({ request: BASE_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);

    const result = await respondAsSupervisor("req-1", "rechazado", "", "No cumple el aviso previo");

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rechazado", supervisor_decision: "rechazado" }),
    );
  });

  it("still succeeds when the decision notification email fails to send", async () => {
    const supabase = mockSupabaseForRespond({ request: BASE_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond({ rrhhEmails: ["rrhh@example.com"] }) as never);
    vi.mocked(sendVacationRequestSupervisorDecisionEmail).mockRejectedValue(new Error("Configuración SMTP incompleta"));

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "Todo en orden");

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalled();
  });

  it("rejects when the update is silently blocked by RLS (zero rows affected)", async () => {
    const supabase = mockSupabaseForRespond({ request: BASE_REQUEST, updatedRows: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);

    const result = await respondAsSupervisor("req-1", "aprobado", "data:image/png;base64,AAAA", "Todo en orden");

    expect(result.error).toBe("No autorizado");
    expect(sendVacationRequestSupervisorDecisionEmail).not.toHaveBeenCalled();
  });
});

describe("respondAsRrhh", () => {
  const RRHH_REQUEST = { ...BASE_REQUEST, status: "pendiente_rrhh" };

  it("rejects a caller who lacks can_authorize before even looking up the request", async () => {
    const supabase = mockSupabaseForRespond({ request: RRHH_REQUEST, canAuthorize: false });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);

    const result = await respondAsRrhh("req-1", "aprobado", "data:image/png;base64,AAAA", "", {
      periodConfirmed: "2026",
      hasCurrentVacation: true,
      isAdvance: false,
    });

    expect(result.error).toBe("No autorizado");
    expect(supabase._mocks.updateMock).not.toHaveBeenCalled();
    expect(sendVacationRequestRrhhDecisionEmail).not.toHaveBeenCalled();
  });

  it("rejects when the request is not pending RRHH", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRespond({ request: BASE_REQUEST }) as never);

    const result = await respondAsRrhh("req-1", "aprobado", "data:image/png;base64,AAAA", "", { periodConfirmed: "2026", hasCurrentVacation: true, isAdvance: false });

    expect(result.error).toBe("Esta solicitud no está pendiente de RRHH");
  });

  it("approves with classification and emails the employee", async () => {
    const supabase = mockSupabaseForRespond({ request: RRHH_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);

    const result = await respondAsRrhh("req-1", "aprobado", "data:image/png;base64,AAAA", "", {
      periodConfirmed: "2026",
      hasCurrentVacation: true,
      isAdvance: false,
    });

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "aprobado",
        rrhh_decision: "aprobado",
        rrhh_period_confirmed: "2026",
        rrhh_has_current_vacation: true,
        rrhh_is_advance: false,
      }),
    );
    expect(sendVacationRequestRrhhDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });

  it("still succeeds when the decision notification email fails to send", async () => {
    const supabase = mockSupabaseForRespond({ request: RRHH_REQUEST });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminForRespond() as never);
    vi.mocked(sendVacationRequestRrhhDecisionEmail).mockRejectedValue(new Error("Configuración SMTP incompleta"));

    const result = await respondAsRrhh("req-1", "aprobado", "data:image/png;base64,AAAA", "", {
      periodConfirmed: "2026",
      hasCurrentVacation: true,
      isAdvance: false,
    });

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.updateMock).toHaveBeenCalled();
  });
});
