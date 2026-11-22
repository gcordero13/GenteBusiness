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
  /**
   * Optional installments with an amount set by the seller. One that falls in a
   * month of the monthly range replaces that month's installment; one outside
   * the range (even after the disbursement) is added as an extra installment.
   */
  fixedInstallments?: FixedInstallment[];
}

export interface FixedInstallment {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
}

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
  /** All installments, fixed + calculated. */
  installmentCount: number;
  /** Amount of the calculated installments (the last one may differ by rounding). */
  monthlyInstallment: number;
  fixedInstallmentsTotal: number;
  disbursement: number;
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

/** "2027-05-22" -> "2027-05" */
const monthKey = (iso: string) => iso.slice(0, 7);

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

/** Splits totalCents into `count` equal installments; the last absorbs the rounding. */
function evenSplit(totalCents: number, count: number): number[] {
  if (count <= 0) return [];
  const each = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalCents - each * (count - 1) : each));
}

// Tie-break for rows on the same date: separation, bridge, installments, disbursement.
type RowKind = "separation" | "bridge" | "installment" | "disbursement";
const KIND_ORDER: Record<RowKind, number> = { separation: 0, bridge: 1, installment: 2, disbursement: 3 };

export function buildPaymentPlan(input: PaymentPlanInput): PaymentPlanResult {
  const { price, separation, initialPercentage, separationDate, installmentStartDate, installmentEndDate, disbursementDate } =
    input;
  const fixedInstallments = input.fixedInstallments ?? [];

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
  for (const fixed of fixedInstallments) {
    if (!fixed.date) return { ok: false, error: "Cada cuota fija debe tener fecha." };
    if (!Number.isFinite(fixed.amount) || toCents(fixed.amount) <= 0) {
      return { ok: false, error: "Cada cuota fija debe tener un monto mayor a $0." };
    }
    if (fixed.date < separationDate) {
      return { ok: false, error: "Las cuotas fijas no pueden ser antes de la fecha de separación." };
    }
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

  const monthCount = countInstallments(installmentStartDate, installmentEndDate);
  if (monthCount <= 0) {
    return { ok: false, error: "El rango de cuotas es muy corto o inválido." };
  }

  const fixedCents = fixedInstallments.reduce((sum, f) => sum + toCents(f.amount), 0);
  if (fixedCents > remainingCents) {
    return {
      ok: false,
      error: `Las cuotas fijas (${formatUsd(toDollars(fixedCents))}) superan el remanente del 30% para cuotas (${formatUsd(toDollars(remainingCents))}).`,
    };
  }

  // Monthly dates in the range that no fixed installment has taken over.
  const fixedMonths = new Set(fixedInstallments.map((f) => monthKey(f.date)));
  const calculatedDates = Array.from({ length: monthCount }, (_, i) => addMonths(installmentStartDate, i)).filter(
    (date) => !fixedMonths.has(monthKey(date)),
  );
  const toCalculateCents = remainingCents - fixedCents;

  if (calculatedDates.length === 0 && toCalculateCents > 0) {
    return {
      ok: false,
      error: `Todas las cuotas del rango tienen monto fijo y faltan ${formatUsd(toDollars(toCalculateCents))} para completar el 30%. Ajuste los montos o amplíe el rango de cuotas.`,
    };
  }

  const warnings: string[] = [];
  if (bridgeCents > 0 && installmentStartDate < bridgeDueDate) {
    warnings.push(
      `Advertencia: las cuotas inician antes de la fecha límite para completar el ${percentLabel}% (${formatPlanDate(bridgeDueDate)}).`,
    );
  }
  const calculatedCents = toCalculateCents > 0 ? evenSplit(toCalculateCents, calculatedDates.length) : [];
  if (calculatedDates.length > 0 && toCalculateCents === 0) {
    warnings.push("Las cuotas fijas cubren todo el remanente del 30%: no quedan cuotas calculadas.");
  }

  const entries: { date: string; cents: number; kind: RowKind; description?: string }[] = [
    { date: separationDate, cents: separationCents, kind: "separation", description: "SEPARACION INICIAL" },
    ...fixedInstallments.map((f) => ({ date: f.date, cents: toCents(f.amount), kind: "installment" as const })),
    ...calculatedCents.map((cents, i) => ({ date: calculatedDates[i], cents, kind: "installment" as const })),
    { date: disbursementDate, cents: disbursementCents, kind: "disbursement", description: "DESEMBOLSO (70%)" },
  ];
  if (bridgeCents > 0) {
    entries.push({
      date: bridgeDueDate,
      cents: bridgeCents,
      kind: "bridge",
      description: `PAGO PUENTE COMPLETA ${percentLabel}%`,
    });
  }
  entries.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );

  const installmentCount = fixedInstallments.length + calculatedCents.length;
  let installmentNumber = 0;
  const rows: PaymentPlanRow[] = entries.map((e) => ({
    date: e.date,
    amount: toDollars(e.cents),
    description:
      e.kind === "installment" ? `CUOTA ${++installmentNumber} de ${installmentCount}` : (e.description ?? ""),
  }));

  return {
    ok: true,
    rows,
    warnings,
    summary: {
      totalTarget: toDollars(targetCents),
      initialPaid: toDollars(initialPaidCents),
      remainingForInstallments: toDollars(remainingCents),
      installmentCount,
      monthlyInstallment: toDollars(calculatedCents[0] ?? 0),
      fixedInstallmentsTotal: toDollars(fixedCents),
      disbursement: toDollars(disbursementCents),
      bridgeDueDate,
    },
  };
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
