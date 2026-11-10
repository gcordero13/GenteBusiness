import { describe, expect, it } from "vitest";
import { deriveRequestFlowSteps, type RequestFlowInput } from "./vacationRequestFlow";

function request(overrides: Partial<RequestFlowInput>): RequestFlowInput {
  return {
    tipo: "vacaciones",
    status: "pendiente_supervisor",
    created_at: "2026-10-01T12:00:00Z",
    supervisor_decision: null,
    supervisor_decided_at: null,
    supervisor_comments: null,
    supervisor_first_name: null,
    supervisor_last_name: null,
    rrhh_decision: null,
    rrhh_decided_at: null,
    rrhh_comments: null,
    rrhh_period_confirmed: null,
    rrhh_has_current_vacation: null,
    rrhh_is_advance: null,
    ...overrides,
  };
}

describe("deriveRequestFlowSteps", () => {
  it("marks 'Solicitado' as completed and 'Jefe directo'/'RRHH' as pending/not_reached while awaiting the supervisor", () => {
    const steps = deriveRequestFlowSteps(request({ status: "pendiente_supervisor" }));

    expect(steps).toEqual([
      { label: "Solicitado", state: "completed", decidedAt: "2026-10-01T12:00:00Z", comments: null, extra: [] },
      { label: "Jefe directo", state: "pending", decidedAt: null, comments: null, extra: [] },
      { label: "RRHH", state: "not_reached", decidedAt: null, comments: null, extra: [] },
    ]);
  });

  it("marks 'RRHH' as not_reached when the supervisor rejected the request", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "rechazado",
        supervisor_decision: "rechazado",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
        supervisor_comments: "No hay cobertura ese día",
      }),
    );

    expect(steps[1]).toEqual({
      label: "Jefe directo",
      state: "rejected",
      decidedAt: "2026-10-02T09:00:00Z",
      comments: "No hay cobertura ese día",
      extra: [],
    });
    expect(steps[2]).toEqual({ label: "RRHH", state: "not_reached", decidedAt: null, comments: null, extra: [] });
  });

  it("marks 'Jefe directo' as completed and 'RRHH' as pending once the supervisor approved", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "pendiente_rrhh",
        supervisor_decision: "aprobado",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
      }),
    );

    expect(steps[1].state).toBe("completed");
    expect(steps[2]).toEqual({ label: "RRHH", state: "pending", decidedAt: null, comments: null, extra: [] });
  });

  it("includes the vacation classification lines when RRHH approves a tipo vacaciones request", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "aprobado",
        tipo: "vacaciones",
        supervisor_decision: "aprobado",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
        rrhh_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_comments: "Todo en orden",
        rrhh_period_confirmed: "2026",
        rrhh_has_current_vacation: true,
        rrhh_is_advance: true,
      }),
    );

    expect(steps[2]).toEqual({
      label: "RRHH",
      state: "completed",
      decidedAt: "2026-10-03T14:00:00Z",
      comments: "Todo en orden",
      extra: ["Período confirmado: 2026", "Tenía vacaciones vigentes", "Vacaciones por adelantado"],
    });
  });

  it("has no extra lines when the classification fields are null or false", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "aprobado",
        tipo: "vacaciones",
        supervisor_decision: "aprobado",
        rrhh_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_period_confirmed: null,
        rrhh_has_current_vacation: false,
        rrhh_is_advance: false,
      }),
    );

    expect(steps[2].extra).toEqual([]);
  });

  it("never adds classification lines for a tipo other than vacaciones, even if those fields are set", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "aprobado",
        tipo: "medico",
        supervisor_decision: "aprobado",
        rrhh_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_period_confirmed: "2026",
        rrhh_has_current_vacation: true,
        rrhh_is_advance: true,
      }),
    );

    expect(steps[2].extra).toEqual([]);
  });

  it("marks 'RRHH' as rejected with its comments when RRHH rejects", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "rechazado",
        supervisor_decision: "aprobado",
        rrhh_decision: "rechazado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_comments: "Documentación incompleta",
      }),
    );

    expect(steps[2]).toEqual({
      label: "RRHH",
      state: "rejected",
      decidedAt: "2026-10-03T14:00:00Z",
      comments: "Documentación incompleta",
      extra: [],
    });
  });

  it("shows the resolved supervisor's name on 'Jefe directo' even while still pending", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "pendiente_supervisor",
        supervisor_first_name: "Carlos",
        supervisor_last_name: "Jefe",
      }),
    );

    expect(steps[1]).toEqual({
      label: "Jefe directo",
      state: "pending",
      decidedAt: null,
      comments: null,
      extra: ["Aprobador: Carlos Jefe"],
    });
  });

  it("does not leak stale supervisor decision data when 'Jefe directo' is still pending on an inconsistent row", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "pendiente_supervisor",
        supervisor_decided_at: "2026-10-02T09:00:00Z",
        supervisor_comments: "Decisión fantasma",
      }),
    );

    expect(steps[1]).toEqual({
      label: "Jefe directo",
      state: "pending",
      decidedAt: null,
      comments: null,
      extra: [],
    });
  });

  it("does not leak stale RRHH decision data when 'RRHH' is still pending on an inconsistent row", () => {
    const steps = deriveRequestFlowSteps(
      request({
        status: "pendiente_rrhh",
        supervisor_decision: "aprobado",
        rrhh_decided_at: "2026-10-03T14:00:00Z",
        rrhh_comments: "Decisión fantasma",
      }),
    );

    expect(steps[2]).toEqual({
      label: "RRHH",
      state: "pending",
      decidedAt: null,
      comments: null,
      extra: [],
    });
  });
});
