import { describe, expect, it } from "vitest";
import {
  buildPaymentPlan,
  formatPlanForClipboard,
  formatPlanCsv,
  getDefaultPlanDates,
  type PaymentPlanInput,
  type PaymentPlanRow,
} from "./paymentPlan";

const BASE: PaymentPlanInput = {
  price: 100000,
  separation: 5000,
  initialPercentage: 0.05,
  separationDate: "2026-11-22",
  installmentStartDate: "2026-12-22",
  installmentEndDate: "2027-11-22",
  disbursementDate: "2028-11-22",
};

function ok(input: PaymentPlanInput) {
  const result = buildPaymentPlan(input);
  if (!result.ok) throw new Error(`expected a plan, got error: ${result.error}`);
  return result;
}

describe("buildPaymentPlan", () => {
  it("splits the 30% into separation + monthly installments and the 70% disbursement", () => {
    const { rows, summary, warnings } = ok(BASE);

    expect(warnings).toEqual([]);
    expect(summary).toMatchObject({
      totalTarget: 30000,
      initialPaid: 5000,
      remainingForInstallments: 25000,
      installmentCount: 12,
      monthlyInstallment: 2083.33,
      disbursement: 70000,
    });

    // separation + 12 installments + disbursement (no bridge: separation already covers 5%)
    expect(rows).toHaveLength(14);
    expect(rows[0]).toEqual({ date: "2026-11-22", amount: 5000, description: "SEPARACION INICIAL" });
    expect(rows[1]).toEqual({ date: "2026-12-22", amount: 2083.33, description: "CUOTA 1 de 12" });
    // last installment absorbs the rounding remainder
    expect(rows[12]).toEqual({ date: "2027-11-22", amount: 2083.37, description: "CUOTA 12 de 12" });
    expect(rows[13]).toEqual({ date: "2028-11-22", amount: 70000, description: "DESEMBOLSO (70%)" });

    const total = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
    expect(total).toBe(100000);
  });

  it("adds a bridge payment 20 days after separation to complete the 10%", () => {
    const { rows, summary } = ok({ ...BASE, initialPercentage: 0.1 });

    expect(rows[1]).toEqual({ date: "2026-12-12", amount: 5000, description: "PAGO PUENTE COMPLETA 10%" });
    expect(summary.initialPaid).toBe(10000);
    expect(summary.remainingForInstallments).toBe(20000);
    expect(summary.monthlyInstallment).toBe(1666.66);
    expect(rows.at(-2)).toEqual({ date: "2027-11-22", amount: 1666.74, description: "CUOTA 12 de 12" });
    expect(summary.bridgeDueDate).toBe("2026-12-12");
  });

  it("does not count an extra installment when the end day is before the start day", () => {
    const { summary } = ok({ ...BASE, installmentEndDate: "2027-11-21" });
    expect(summary.installmentCount).toBe(11);
  });

  it("clamps installment dates to the last day of shorter months", () => {
    const { rows } = ok({
      ...BASE,
      separationDate: "2026-12-15",
      installmentStartDate: "2027-01-31",
      installmentEndDate: "2027-04-30",
    });
    const installmentDates = rows.filter((r) => r.description.startsWith("CUOTA")).map((r) => r.date);
    expect(installmentDates).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("warns (but still builds the plan) when installments start before the bridge payment is due", () => {
    const result = ok({ ...BASE, initialPercentage: 0.1, installmentStartDate: "2026-12-01" });
    expect(result.warnings.join(" ")).toContain("12/12/2026");
  });

  it.each<[string, Partial<PaymentPlanInput>, string]>([
    ["non-positive price", { price: 0 }, "El monto de la unidad debe ser positivo."],
    ["NaN price", { price: Number.NaN }, "El monto de la unidad debe ser positivo."],
    ["separation under $100", { separation: 99 }, "El monto de separación debe ser al menos $100."],
    ["missing date", { disbursementDate: "" }, "Debe seleccionar todas las fechas."],
    [
      "end before start",
      { installmentEndDate: "2026-12-22" },
      "La fecha de fin de cuotas debe ser posterior a la fecha de inicio.",
    ],
    [
      "disbursement before end",
      { disbursementDate: "2027-11-22" },
      "La fecha de desembolso debe ser posterior a la fecha de fin de cuotas.",
    ],
    [
      "start not after separation",
      { separationDate: "2026-12-22" },
      "La fecha de inicio de cuotas debe ser posterior a la fecha de separación.",
    ],
    [
      "separation exceeding the 30%",
      { separation: 40000 },
      "La separación y el 5/10% exceden el 30% requerido. Ajuste el monto de separación.",
    ],
  ])("rejects %s", (_label, override, error) => {
    expect(buildPaymentPlan({ ...BASE, ...override })).toEqual({ ok: false, error });
  });
});

describe("buildPaymentPlan with fixed installments", () => {
  // BASE: R = $25,000 over 12 monthly installments (22/12/2026 .. 22/11/2027), disbursement $70,000 on 22/11/2028.
  const installments = (rows: PaymentPlanRow[]) => rows.filter((r) => r.description.startsWith("CUOTA"));

  it("leaves the plan unchanged when there are no fixed installments", () => {
    expect(buildPaymentPlan({ ...BASE, fixedInstallments: [] })).toEqual(buildPaymentPlan(BASE));
  });

  it("reproduces the sales team's real example (fixed 1,455 cuotas, disbursement before the last cuota)", () => {
    const { rows, summary, warnings } = ok({
      price: 88413.9,
      separation: 11968.4,
      initialPercentage: 0.05,
      separationDate: "2026-11-18",
      installmentStartDate: "2027-02-18",
      installmentEndDate: "2027-05-18",
      disbursementDate: "2027-06-18",
      fixedInstallments: [
        { date: "2026-11-18", amount: 1455 },
        { date: "2027-01-18", amount: 1455 },
        { date: "2027-12-18", amount: 1455 },
      ],
    });

    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      { date: "2026-11-18", amount: 11968.4, description: "SEPARACION INICIAL" },
      { date: "2026-11-18", amount: 1455, description: "CUOTA 1 de 7" },
      { date: "2027-01-18", amount: 1455, description: "CUOTA 2 de 7" },
      { date: "2027-02-18", amount: 2547.69, description: "CUOTA 3 de 7" },
      { date: "2027-03-18", amount: 2547.69, description: "CUOTA 4 de 7" },
      { date: "2027-04-18", amount: 2547.69, description: "CUOTA 5 de 7" },
      { date: "2027-05-18", amount: 2547.7, description: "CUOTA 6 de 7" },
      { date: "2027-06-18", amount: 61889.73, description: "DESEMBOLSO (70%)" },
      { date: "2027-12-18", amount: 1455, description: "CUOTA 7 de 7" },
    ]);
    expect(summary).toMatchObject({ installmentCount: 7, monthlyInstallment: 2547.69, fixedInstallmentsTotal: 4365 });
  });

  it("a fixed installment inside the range replaces that month's calculated cuota", () => {
    const { rows, summary } = ok({ ...BASE, fixedInstallments: [{ date: "2027-05-22", amount: 5000 }] });
    const cuotas = installments(rows);

    expect(cuotas).toHaveLength(12);
    expect(cuotas[5]).toEqual({ date: "2027-05-22", amount: 5000, description: "CUOTA 6 de 12" });
    // the other 11 share 25,000 - 5,000
    expect(cuotas[0].amount).toBe(1818.18);
    expect(cuotas[11]).toEqual({ date: "2027-11-22", amount: 1818.2, description: "CUOTA 12 de 12" });
    expect(summary.monthlyInstallment).toBe(1818.18);
  });

  it("matches the month, not the exact day, when replacing a calculated cuota", () => {
    const { rows } = ok({ ...BASE, fixedInstallments: [{ date: "2027-05-10", amount: 5000 }] });
    const cuotas = installments(rows);

    expect(cuotas).toHaveLength(12);
    expect(cuotas.some((c) => c.date === "2027-05-22")).toBe(false);
    expect(cuotas[5]).toEqual({ date: "2027-05-10", amount: 5000, description: "CUOTA 6 de 12" });
  });

  it("adds a fixed installment outside the range, even after the disbursement", () => {
    const { rows, summary } = ok({ ...BASE, fixedInstallments: [{ date: "2029-01-15", amount: 1000 }] });

    expect(summary.installmentCount).toBe(13);
    expect(summary.monthlyInstallment).toBe(2000);
    expect(rows.at(-2)?.description).toBe("DESEMBOLSO (70%)");
    expect(rows.at(-1)).toEqual({ date: "2029-01-15", amount: 1000, description: "CUOTA 13 de 13" });
  });

  it("always sums to the unit price", () => {
    const { rows } = ok({
      ...BASE,
      fixedInstallments: [
        { date: "2027-02-03", amount: 1234.56 },
        { date: "2027-08-22", amount: 3000 },
        { date: "2029-01-15", amount: 999.99 },
      ],
    });
    const totalCents = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
    expect(totalCents).toBe(100000 * 100);
  });

  it("puts an installment before the disbursement when both fall on the same date", () => {
    const { rows } = ok({ ...BASE, fixedInstallments: [{ date: "2028-11-22", amount: 1000 }] });
    expect(rows.at(-2)?.description).toBe("CUOTA 13 de 13");
    expect(rows.at(-1)?.description).toBe("DESEMBOLSO (70%)");
  });

  it("allows a fixed installment on the separation date, listed after the separation", () => {
    const { rows } = ok({ ...BASE, fixedInstallments: [{ date: "2026-11-22", amount: 1000 }] });
    expect(rows[0].description).toBe("SEPARACION INICIAL");
    expect(rows[1]).toEqual({ date: "2026-11-22", amount: 1000, description: "CUOTA 1 de 13" });
  });

  it("warns and lists no calculated cuotas when the fixed ones cover the whole 30% remainder", () => {
    const { rows, summary, warnings } = ok({ ...BASE, fixedInstallments: [{ date: "2029-01-15", amount: 25000 }] });
    expect(installments(rows)).toEqual([{ date: "2029-01-15", amount: 25000, description: "CUOTA 1 de 1" }]);
    expect(summary.monthlyInstallment).toBe(0);
    expect(warnings.join(" ")).toContain("no quedan cuotas calculadas");
  });

  it.each<[string, PaymentPlanInput, string]>([
    ["missing date", { ...BASE, fixedInstallments: [{ date: "", amount: 100 }] }, "Cada cuota fija debe tener fecha."],
    [
      "zero amount",
      { ...BASE, fixedInstallments: [{ date: "2027-06-15", amount: 0 }] },
      "Cada cuota fija debe tener un monto mayor a $0.",
    ],
    [
      "NaN amount",
      { ...BASE, fixedInstallments: [{ date: "2027-06-15", amount: Number.NaN }] },
      "Cada cuota fija debe tener un monto mayor a $0.",
    ],
    [
      "date before the separation",
      { ...BASE, fixedInstallments: [{ date: "2026-11-21", amount: 100 }] },
      "Las cuotas fijas no pueden ser antes de la fecha de separación.",
    ],
    [
      "more than the 30% remainder",
      {
        ...BASE,
        fixedInstallments: [
          { date: "2027-06-15", amount: 20000 },
          { date: "2027-07-15", amount: 5000.01 },
        ],
      },
      "Las cuotas fijas ($25,000.01) superan el remanente del 30% para cuotas ($25,000.00).",
    ],
    [
      "every month fixed but the 30% not covered",
      {
        ...BASE,
        installmentStartDate: "2026-12-22",
        installmentEndDate: "2027-01-22",
        fixedInstallments: [
          { date: "2026-12-22", amount: 1000 },
          { date: "2027-01-22", amount: 1000 },
        ],
      },
      "Todas las cuotas del rango tienen monto fijo y faltan $23,000.00 para completar el 30%. Ajuste los montos o amplíe el rango de cuotas.",
    ],
  ])("rejects %s", (_label, input, error) => {
    expect(buildPaymentPlan(input)).toEqual({ ok: false, error });
  });
});

describe("formatPlanForClipboard", () => {
  it("produces tab-separated date/amount/description lines ready to paste into Excel", () => {
    const { rows } = ok({ ...BASE, initialPercentage: 0.1 });
    const lines = formatPlanForClipboard(rows).split("\n");

    expect(lines[0]).toBe("22/11/2026\t5000.00\tSEPARACION INICIAL");
    expect(lines[1]).toBe("12/12/2026\t5000.00\tPAGO PUENTE COMPLETA 10%");
    expect(lines[2]).toBe("22/12/2026\t1666.66\tCUOTA 1 de 12");
    expect(lines.at(-1)).toBe("22/11/2028\t70000.00\tDESEMBOLSO (70%)");
    expect(lines).toHaveLength(rows.length);
  });
});

describe("formatPlanCsv", () => {
  it("adds a header and comma-separates each row", () => {
    const { rows } = ok(BASE);
    const lines = formatPlanCsv(rows).split("\n");
    expect(lines[0]).toBe("Fecha,Monto,Observacion");
    expect(lines[1]).toBe("22/11/2026,5000.00,SEPARACION INICIAL");
  });
});

describe("getDefaultPlanDates", () => {
  it("defaults to today, +1 month, +1 year and +2 years", () => {
    expect(getDefaultPlanDates("2026-11-22")).toEqual({
      separationDate: "2026-11-22",
      installmentStartDate: "2026-12-22",
      installmentEndDate: "2027-11-22",
      disbursementDate: "2028-11-22",
    });
  });

  it("clamps month-end defaults instead of overflowing into the next month", () => {
    expect(getDefaultPlanDates("2027-01-31").installmentStartDate).toBe("2027-02-28");
  });
});
