export type FlowStepState = "completed" | "rejected" | "pending" | "not_reached";

export interface FlowStep {
  label: string;
  state: FlowStepState;
  decidedAt: string | null;
  comments: string | null;
  extra: string[];
}

export interface RequestFlowInput {
  tipo: string;
  status: string;
  created_at: string;
  supervisor_decision: string | null;
  supervisor_decided_at: string | null;
  supervisor_comments: string | null;
  rrhh_decision: string | null;
  rrhh_decided_at: string | null;
  rrhh_comments: string | null;
  rrhh_period_confirmed: string | null;
  rrhh_has_current_vacation: boolean | null;
  rrhh_is_advance: boolean | null;
}

export function deriveRequestFlowSteps(request: RequestFlowInput): FlowStep[] {
  const solicitado: FlowStep = {
    label: "Solicitado",
    state: "completed",
    decidedAt: request.created_at,
    comments: null,
    extra: [],
  };

  const jefeState: FlowStepState =
    request.status === "pendiente_supervisor"
      ? "pending"
      : request.supervisor_decision === "rechazado"
        ? "rejected"
        : "completed";

  const jefeReached = jefeState === "completed" || jefeState === "rejected";

  const jefe: FlowStep = {
    label: "Jefe directo",
    state: jefeState,
    decidedAt: jefeReached ? request.supervisor_decided_at : null,
    comments: jefeReached ? request.supervisor_comments : null,
    extra: [],
  };

  const rrhhState: FlowStepState =
    request.status === "pendiente_supervisor" || request.supervisor_decision === "rechazado"
      ? "not_reached"
      : request.status === "pendiente_rrhh"
        ? "pending"
        : request.rrhh_decision === "rechazado"
          ? "rejected"
          : "completed";

  const rrhhReached = rrhhState === "completed" || rrhhState === "rejected";
  const extra: string[] = [];
  if (request.tipo === "vacaciones" && rrhhReached) {
    if (request.rrhh_period_confirmed) extra.push(`Período confirmado: ${request.rrhh_period_confirmed}`);
    if (request.rrhh_has_current_vacation === true) extra.push("Tenía vacaciones vigentes");
    if (request.rrhh_is_advance === true) extra.push("Vacaciones por adelantado");
  }

  const rrhh: FlowStep = {
    label: "RRHH",
    state: rrhhState,
    decidedAt: rrhhReached ? request.rrhh_decided_at : null,
    comments: rrhhReached ? request.rrhh_comments : null,
    extra,
  };

  return [solicitado, jefe, rrhh];
}
