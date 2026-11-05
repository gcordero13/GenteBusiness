import { CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { formatFechaEs } from "@/lib/vacationRequestSummary";
import {
  deriveRequestFlowSteps,
  type FlowStep,
  type FlowStepState,
  type RequestFlowInput,
} from "@/lib/vacationRequestFlow";

const STATE_ICON: Record<FlowStepState, typeof CheckCircle2> = {
  completed: CheckCircle2,
  rejected: XCircle,
  pending: Clock,
  not_reached: MinusCircle,
};

const STATE_STYLE: Record<FlowStepState, { badge: string; icon: string; line: string }> = {
  completed: { badge: "bg-green-100", icon: "text-green-700", line: "bg-green-300" },
  rejected: { badge: "bg-red-100", icon: "text-red-700", line: "bg-red-300" },
  pending: { badge: "bg-amber-100", icon: "text-amber-700", line: "bg-border" },
  not_reached: { badge: "bg-slate-100", icon: "text-slate-400", line: "bg-border" },
};

export function RequestFlowSteps({ request }: { request: RequestFlowInput }) {
  const steps = deriveRequestFlowSteps(request);
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <FlowStepItem key={step.label} step={step} isLast={index === steps.length - 1} />
      ))}
    </ol>
  );
}

function FlowStepItem({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  const Icon = STATE_ICON[step.state];
  const style = STATE_STYLE[step.state];
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
          <Icon className={`size-4 ${style.icon}`} aria-hidden="true" />
        </div>
        {!isLast && <div className={`w-0.5 flex-1 rounded-full ${style.line}`} />}
      </div>
      <div className="pb-5">
        <p className="pt-1 text-sm font-semibold">{step.label}</p>
        {step.decidedAt && (
          <p className="text-xs text-neutral-600">{formatFechaEs(step.decidedAt.slice(0, 10))}</p>
        )}
        {step.comments && (
          <p className="mt-1.5 rounded-lg bg-muted p-2 text-sm text-foreground">{step.comments}</p>
        )}
        {step.extra.map((line) => (
          <p key={line} className="mt-0.5 text-xs text-neutral-600">
            {line}
          </p>
        ))}
      </div>
    </li>
  );
}
