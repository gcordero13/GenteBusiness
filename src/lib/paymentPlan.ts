// Payment-plan calculator (30% during construction + 70% disbursement),
// ported from the sales team's standalone HTML tool so it can live on a
// public, no-login page (/plan-de-pagos).
//
// Dates are plain "YYYY-MM-DD" strings and all date math happens in UTC, so
// the result never depends on the browser's or server's timezone. Money is
// computed in integer cents and only converted back to dollars at the edge.

export interface PaymentPlanInput {
  price: number;
  separation: number;
  /** Minimum initial percentage the client must complete (0.05 or 0.10). */
  initialPercentage: number;
  separationDate: string;
  installmentStartDate: string;
  installmentEndDate: string;
  disbursementDate: string;
  /** Optional one-off payments on specific dates. */
  extraPayments?: ExtraPayment[];
  /** How extra payments affect the rest of the plan. Defaults to "reduce_installment". */
  extraPaymentMode?: ExtraPaymentMode;
}

export interface ExtraPayment {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
}

/**
 * - reduce_installment: extras count toward the 30%; installments are recalculated over the same dates.
 * - reduce_count: extras count toward the 30%; the base installment stays, so the plan finishes earlier.
 * - reduce_disbursement: installments stay; extras lower the final disbursement instead.
 */
export type ExtraPaymentMode = "reduce_installment" | "reduce_count" | "reduce_disbursement";

export interface PaymentPlanRow {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  description: string;
}

export interface PaymentPlanSummary {
  totalTarget: number;
  initialPaid: number;
  remainingForInstallments: number;
  installmentCount: number;
  monthlyInstallment: number;
  disbursement: number;
  extraPaymentsTotal: number;
  /** Date by which the 5%/10% must be completed (separation + 20 days). */
  bridgeDueDate: string;
}

export type PaymentPlanResult =
  | { ok: true; rows: PaymentPlanRow[]; summary: PaymentPlanSummary; warnings: string[] }
  | { ok: false; error: string };

const TOTAL_TARGET_PERCENTAGE = 0.3;
const BRIDGE_DAYS_AFTER_SEPARATION = 20;
const MIN_SEPARATION = 100;

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  return toIsoDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Adds calendar months, clamping to the last day of shorter months (Jan 31 + 1 = Feb 28). */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return toIsoDate(new Date(Date.UTC(targetYear, targetMonth - 1, targetDay)));
}

/** Number of monthly installments between start and end, both inclusive. */
function countInstallments(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  let months = (end.year - start.year) * 12 + (end.month - start.month);
  if (end.day >= start.day) months += 1;
  return Math.max(0, months);
}

/** "2026-11-22" -> "22/11/2026" */
export function formatPlanDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const toCents = (dollars: number) => Math.round(dollars * 100);
const toDollars = (cents: number) => cents / 100;

export function buildPaymentPlan(input: PaymentPlanInput): PaymentPlanResult {
  const { price, separation, initialPercentage, separationDate, installmentStartDate, installmentEndDate, disbursementDate } =
    input;

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "El monto de la unidad debe ser positivo." };
  }
  if (!Number.isFinite(separation) || separation < MIN_SEPARATION) {
    return { ok: false, error: `El monto de separación debe ser al menos $${MIN_SEPARATION}.` };
  }
  if (!separationDate || !installmentStartDate || !installmentEndDate || !disbursementDate) {
    return { ok: false, error: "Debe seleccionar todas las fechas." };
  }
  // ISO date strings compare correctly as plain strings.
  if (installmentStartDate >= installmentEndDate) {
    return { ok: false, error: "La fecha de fin de cuotas debe ser posterior a la fecha de inicio." };
  }
  if (installmentEndDate >= disbursementDate) {
    return { ok: false, error: "La fecha de desembolso debe ser posterior a la fecha de fin de cuotas." };
  }
  if (separationDate >= installmentStartDate) {
    return { ok: false, error: "La fecha de inicio de cuotas debe ser posterior a la fecha de separación." };
  }

  const priceCents = toCents(price);
  const separationCents = toCents(separation);
  const targetCents = Math.round(priceCents * TOTAL_TARGET_PERCENTAGE);
  const requiredInitialCents = Math.round(priceCents * initialPercentage);
  const bridgeCents = Math.max(0, requiredInitialCents - separationCents);
  const initialPaidCents = separationCents + bridgeCents;
  const remainingCents = targetCents - initialPaidCents;
  // The 70% is whatever the 30% doesn't cover, so the plan always sums to the price.
  const disbursementCents = priceCents - targetCents;
  const bridgeDueDate = addDays(separationDate, BRIDGE_DAYS_AFTER_SEPARATION);
  const percentLabel = Math.round(initialPercentage * 100);

  if (remainingCents < 0) {
    return {
      ok: false,
      error: "La separación y el 5/10% exceden el 30% requerido. Ajuste el monto de separación.",
    };
  }

  const installmentCount = countInstallments(installmentStartDate, installmentEndDate);
  if (installmentCount <= 0) {
    return { ok: false, error: "El rango de cuotas es muy corto o inválido." };
  }

  const extraPayments = input.extraPayments ?? [];
  const extraPaymentMode = input.extraPaymentMode ?? "reduce_installment";
  for (const extra of extraPayments) {
    if (!extra.date) return { ok: false, error: "Cada pago extraordinario debe tener fecha." };
    if (!Number.isFinite(extra.amount) || toCents(extra.amount) <= 0) {
      return { ok: false, error: "Cada pago extraordinario debe tener un monto mayor a $0." };
    }
    if (extra.date <= separationDate || extra.date >= disbursementDate) {
      return {
        ok: false,
        error: "Los pagos extraordinarios deben estar entre la fecha de separación y la de desembolso.",
      };
    }
  }
  const extrasCents = extraPayments.reduce((sum, e) => sum + toCents(e.amount), 0);

  const schedule = scheduleInstallments({
    remainingCents,
    disbursementCents,
    extrasCents,
    mode: extraPaymentMode,
    maxInstallments: installmentCount,
  });
  if (!schedule.ok) return schedule;

  const warnings: string[] = [];
  if (bridgeCents > 0 && installmentStartDate < bridgeDueDate) {
    warnings.push(
      `Advertencia: las cuotas inician antes de la fecha límite para completar el ${percentLabel}% (${formatPlanDate(bridgeDueDate)}).`,
    );
  }
  if (schedule.installmentCents.length === 0) {
    warnings.push("Los pagos extraordinarios cubren todo el remanente del 30%: no quedan cuotas mensuales.");
  }

  const datedRows: PaymentPlanRow[] = [
    { date: separationDate, amount: toDollars(separationCents), description: "SEPARACION INICIAL" },
  ];
  if (bridgeCents > 0) {
    datedRows.push({
      date: bridgeDueDate,
      amount: toDollars(bridgeCents),
      description: `PAGO PUENTE COMPLETA ${percentLabel}%`,
    });
  }
  const count = schedule.installmentCents.length;
  schedule.installmentCents.forEach((cents, i) => {
    datedRows.push({
      date: addMonths(installmentStartDate, i),
      amount: toDollars(cents),
      description: `CUOTA ${i + 1} de ${count}`,
    });
  });
  for (const extra of extraPayments) {
    datedRows.push({ date: extra.date, amount: toDollars(toCents(extra.amount)), description: "PAGO EXTRAORDINARIO" });
  }
  // Array.prototype.sort is stable, so a cuota stays ahead of an extra payment on the same date.
  datedRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const disbursementReduced = schedule.disbursementCents !== disbursementCents;
  const rows: PaymentPlanRow[] = [
    ...datedRows,
    {
      date: disbursementDate,
      amount: toDollars(schedule.disbursementCents),
      description: disbursementReduced ? "DESEMBOLSO" : "DESEMBOLSO (70%)",
    },
  ];

  return {
    ok: true,
    rows,
    warnings,
    summary: {
      totalTarget: toDollars(targetCents),
      initialPaid: toDollars(initialPaidCents),
      remainingForInstallments: toDollars(remainingCents),
      installmentCount: count,
      monthlyInstallment: toDollars(schedule.monthlyCents),
      disbursement: toDollars(schedule.disbursementCents),
      extraPaymentsTotal: toDollars(extrasCents),
      bridgeDueDate,
    },
  };
}

/**
 * Splits what's left of the 30% into monthly installments (in cents), applying
 * the chosen extra-payment rule. The last installment absorbs rounding.
 */
function scheduleInstallments({
  remainingCents,
  disbursementCents,
  extrasCents,
  mode,
  maxInstallments,
}: {
  remainingCents: number;
  disbursementCents: number;
  extrasCents: number;
  mode: ExtraPaymentMode;
  maxInstallments: number;
}):
  | { ok: true; installmentCents: number[]; monthlyCents: number; disbursementCents: number }
  | { ok: false; error: string } {
  const evenSplit = (totalCents: number, count: number) => {
    if (count <= 0 || totalCents <= 0) return [];
    const monthly = Math.floor(totalCents / count);
    return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalCents - monthly * (count - 1) : monthly));
  };

  if (mode === "reduce_disbursement") {
    if (extrasCents > disbursementCents) {
      return {
        ok: false,
        error: `Los pagos extraordinarios (${formatUsd(toDollars(extrasCents))}) superan el desembolso (${formatUsd(toDollars(disbursementCents))}).`,
      };
    }
    const installmentCents = evenSplit(remainingCents, maxInstallments);
    return {
      ok: true,
      installmentCents,
      monthlyCents: installmentCents[0] ?? 0,
      disbursementCents: disbursementCents - extrasCents,
    };
  }

  if (extrasCents > remainingCents) {
    return {
      ok: false,
      error: `Los pagos extraordinarios (${formatUsd(toDollars(extrasCents))}) superan el remanente del 30% para cuotas (${formatUsd(toDollars(remainingCents))}).`,
    };
  }
  const forInstallmentsCents = remainingCents - extrasCents;

  if (mode === "reduce_count") {
    // The same cuota the plan would have without extras.
    const baseMonthly = Math.floor(remainingCents / maxInstallments);
    if (baseMonthly <= 0) {
      const installmentCents = evenSplit(forInstallmentsCents, maxInstallments);
      return { ok: true, installmentCents, monthlyCents: installmentCents[0] ?? 0, disbursementCents };
    }
    // Capped at the date range: R / floor(R / n) can be slightly above n because of the floor.
    const count = Math.min(maxInstallments, Math.ceil(forInstallmentsCents / baseMonthly));
    const installmentCents = Array.from({ length: count }, (_, i) =>
      i === count - 1 ? forInstallmentsCents - baseMonthly * (count - 1) : baseMonthly,
    );
    return { ok: true, installmentCents, monthlyCents: count > 0 ? baseMonthly : 0, disbursementCents };
  }

  const installmentCents = evenSplit(forInstallmentsCents, maxInstallments);
  return { ok: true, installmentCents, monthlyCents: installmentCents[0] ?? 0, disbursementCents };
}

/** One "DD/MM/YYYY<TAB>amount<TAB>description" line per row - pastes into Excel as 3 columns. */
export function formatPlanForClipboard(rows: PaymentPlanRow[]): string {
  return rows.map((r) => `${formatPlanDate(r.date)}\t${r.amount.toFixed(2)}\t${r.description}`).join("\n");
}

export function formatPlanCsv(rows: PaymentPlanRow[]): string {
  const lines = rows.map((r) => `${formatPlanDate(r.date)},${r.amount.toFixed(2)},${r.description}`);
  return ["Fecha,Monto,Observacion", ...lines].join("\n");
}

export function getDefaultPlanDates(todayIso: string) {
  return {
    separationDate: todayIso,
    installmentStartDate: addMonths(todayIso, 1),
    installmentEndDate: addMonths(todayIso, 12),
    disbursementDate: addMonths(todayIso, 24),
  };
}
