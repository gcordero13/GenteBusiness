"use client";

import { ListChecks, CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const STATE_COLOR: Record<FlowStepState, string> = {
  completed: "text-green-600",
  rejected: "text-red-600",
  pending: "text-amber-600",
  not_reached: "text-muted-foreground",
};

export function RequestFlowDialog({ request }: { request: RequestFlowInput }) {
  const steps = deriveRequestFlowSteps(request);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Ver flujo" aria-label="Ver flujo de la solicitud">
            <ListChecks className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flujo de la solicitud</DialogTitle>
        </DialogHeader>
        <ol className="space-y-0">
          {steps.map((step, index) => (
            <FlowStepItem key={step.label} step={step} isLast={index === steps.length - 1} />
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function FlowStepItem({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  const Icon = STATE_ICON[step.state];
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <Icon className={`size-5 ${STATE_COLOR[step.state]}`} aria-hidden="true" />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium">{step.label}</p>
        {step.decidedAt && (
          <p className="text-xs text-muted-foreground">{formatFechaEs(step.decidedAt.slice(0, 10))}</p>
        )}
        {step.comments && <p className="mt-1 text-sm">{step.comments}</p>}
        {step.extra.map((line) => (
          <p key={line} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </li>
  );
}
