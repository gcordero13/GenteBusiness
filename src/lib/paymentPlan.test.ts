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

describe("buildPaymentPlan with extraordinary payments", () => {
  // BASE: R = $25,000 for 12 installments (base cuota $2,083.33), D = $70,000.
  const EXTRA_JUNE = { date: "2027-06-15", amount: 5000 };
  const installments = (rows: PaymentPlanRow[]) => rows.filter((r) => r.description.startsWith("CUOTA"));

  it.each(["reduce_installment", "reduce_count", "reduce_disbursement"] as const)(
    "leaves the plan unchanged when there are no extra payments (%s)",
    (mode) => {
      expect(buildPaymentPlan({ ...BASE, extraPayments: [], extraPaymentMode: mode })).toEqual(buildPaymentPlan(BASE));
    },
  );

  it("reduce_installment: spreads R - E over the same installments", () => {
    const { rows, summary } = ok({ ...BASE, extraPayments: [EXTRA_JUNE], extraPaymentMode: "reduce_installment" });

    expect(summary).toMatchObject({
      extraPaymentsTotal: 5000,
      installmentCount: 12,
      monthlyInstallment: 1666.66,
      disbursement: 70000,
    });
    expect(installments(rows).at(-1)).toEqual({ date: "2027-11-22", amount: 1666.74, description: "CUOTA 12 de 12" });
    // sorted by date: between CUOTA 6 (2027-05-22) and CUOTA 7 (2027-06-22)
    expect(rows[6].description).toBe("CUOTA 6 de 12");
    expect(rows[7]).toEqual({ date: "2027-06-15", amount: 5000, description: "PAGO EXTRAORDINARIO" });
    expect(rows[8].description).toBe("CUOTA 7 de 12");
    expect(rows.at(-1)?.description).toBe("DESEMBOLSO (70%)");
  });

  it("reduce_count: keeps the base cuota and finishes earlier", () => {
    const { rows, summary } = ok({ ...BASE, extraPayments: [EXTRA_JUNE], extraPaymentMode: "reduce_count" });

    expect(summary).toMatchObject({ installmentCount: 10, monthlyInstallment: 2083.33, disbursement: 70000 });
    const cuotas = installments(rows);
    expect(cuotas).toHaveLength(10);
    expect(cuotas[0]).toEqual({ date: "2026-12-22", amount: 2083.33, description: "CUOTA 1 de 10" });
    // 20,000 - 9 * 2,083.33
    expect(cuotas.at(-1)).toEqual({ date: "2027-09-22", amount: 1250.03, description: "CUOTA 10 de 10" });
  });

  it("reduce_count: an extra payment too small to drop a cuota keeps the base cuota and shrinks only the last one", () => {
    const { rows, summary } = ok({
      ...BASE,
      extraPayments: [{ date: "2027-06-15", amount: 100 }],
      extraPaymentMode: "reduce_count",
    });
    expect(summary).toMatchObject({ installmentCount: 12, monthlyInstallment: 2083.33 });
    const cuotas = installments(rows);
    expect(cuotas[10].amount).toBe(2083.33);
    // 24,900 - 11 * 2,083.33
    expect(cuotas[11].amount).toBe(1983.37);
  });

  it("reduce_disbursement: keeps the cuotas and lowers the final disbursement", () => {
    const { rows, summary } = ok({ ...BASE, extraPayments: [EXTRA_JUNE], extraPaymentMode: "reduce_disbursement" });

    expect(summary).toMatchObject({ installmentCount: 12, monthlyInstallment: 2083.33, disbursement: 65000 });
    expect(rows.at(-1)).toEqual({ date: "2028-11-22", amount: 65000, description: "DESEMBOLSO" });
  });

  it.each(["reduce_installment", "reduce_count", "reduce_disbursement"] as const)(
    "always sums to the unit price (%s)",
    (mode) => {
      const { rows } = ok({
        ...BASE,
        extraPayments: [EXTRA_JUNE, { date: "2027-02-03", amount: 1234.56 }],
        extraPaymentMode: mode,
      });
      const totalCents = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
      expect(totalCents).toBe(100000 * 100);
    },
  );

  it("lists no installments and warns when extra payments cover the whole 30% remainder", () => {
    const { rows, summary, warnings } = ok({
      ...BASE,
      extraPayments: [{ date: "2027-06-15", amount: 25000 }],
      extraPaymentMode: "reduce_installment",
    });
    expect(installments(rows)).toEqual([]);
    expect(summary.installmentCount).toBe(0);
    expect(warnings.join(" ")).toContain("no quedan cuotas");
  });

  it("puts the installment before an extra payment on the same date", () => {
    const { rows } = ok({ ...BASE, extraPayments: [{ date: "2026-12-22", amount: 1000 }] });
    expect(rows[1].description).toBe("CUOTA 1 de 12");
    expect(rows[2].description).toBe("PAGO EXTRAORDINARIO");
  });

  it("defaults to reduce_installment when no mode is given", () => {
    const { summary } = ok({ ...BASE, extraPayments: [EXTRA_JUNE] });
    expect(summary.monthlyInstallment).toBe(1666.66);
  });

  it.each<[string, PaymentPlanInput["extraPayments"], PaymentPlanInput["extraPaymentMode"], string]>([
    ["missing date", [{ date: "", amount: 100 }], "reduce_installment", "Cada pago extraordinario debe tener fecha."],
    [
      "zero amount",
      [{ date: "2027-06-15", amount: 0 }],
      "reduce_installment",
      "Cada pago extraordinario debe tener un monto mayor a $0.",
    ],
    [
      "NaN amount",
      [{ date: "2027-06-15", amount: Number.NaN }],
      "reduce_installment",
      "Cada pago extraordinario debe tener un monto mayor a $0.",
    ],
    [
      "date on the separation date",
      [{ date: "2026-11-22", amount: 100 }],
      "reduce_installment",
      "Los pagos extraordinarios deben estar entre la fecha de separación y la de desembolso.",
    ],
    [
      "date on the disbursement date",
      [{ date: "2028-11-22", amount: 100 }],
      "reduce_installment",
      "Los pagos extraordinarios deben estar entre la fecha de separación y la de desembolso.",
    ],
    [
      "more than the 30% remainder (reduce_installment)",
      [{ date: "2027-06-15", amount: 25000.01 }],
      "reduce_installment",
      "Los pagos extraordinarios ($25,000.01) superan el remanente del 30% para cuotas ($25,000.00).",
    ],
    [
      "more than the 30% remainder (reduce_count)",
      [{ date: "2027-06-15", amount: 20000 }, { date: "2027-07-15", amount: 5000.01 }],
      "reduce_count",
      "Los pagos extraordinarios ($25,000.01) superan el remanente del 30% para cuotas ($25,000.00).",
    ],
    [
      "more than the disbursement (reduce_disbursement)",
      [{ date: "2027-06-15", amount: 70000.01 }],
      "reduce_disbursement",
      "Los pagos extraordinarios ($70,000.01) superan el desembolso ($70,000.00).",
    ],
  ])("rejects %s", (_label, extraPayments, extraPaymentMode, error) => {
    expect(buildPaymentPlan({ ...BASE, extraPayments, extraPaymentMode })).toEqual({ ok: false, error });
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
