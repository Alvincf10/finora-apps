import {
  applyFlatPayment,
  applyManualPayment,
  buildGoldRecommendation,
  buildIdealGoldPlan,
  inferMonthlyRatePercent,
  monthlyInterestDue,
  monthsBetween,
  type GoldRecommendation,
} from "@/lib/financial/gold-installment";
import type { Currency } from "@/types";

export { applyManualPayment, applyFlatPayment, monthlyInterestDue };

export type GoldPlanView = {
  id: string;
  name: string;
  currency: Currency;
  status: string;
  principal: number;
  remainingPrincipal: number;
  monthlyRatePercent: number;
  /** Legacy; kept for older UI fields. */
  totalInterest: number;
  remainingInterest: number;
  months: number;
  monthlyPayment: number | null;
  startDate: string;
  paidRecorded: number;
  paymentCount: number;
  principalPaid: number;
  interestPaid: number;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    notes?: string | null;
    principalPortion: number;
    interestPortion: number;
  }>;
  recommendation: GoldRecommendation;
  /** Optional simulated path if paying standar pokok each month. */
  plan: ReturnType<typeof buildIdealGoldPlan>;
  schedulePreview: ReturnType<typeof buildIdealGoldPlan>["schedule"];
  progress: {
    monthsElapsed: number;
    nextMonthInterest: number;
    principalPaid: number;
    interestPaid: number;
    paidRecorded: number;
  };
};

/** Replay: only pokok reduces remaining; bunga is recorded only. */
export function replayPayments(input: {
  principal: number;
  payments: Array<{
    amount: number;
    principalPortion?: number | null;
    interestPortion?: number | null;
  }>;
}): {
  remainingPrincipal: number;
  allocations: Array<{
    principalPortion: number;
    interestPortion: number;
  }>;
  principalPaid: number;
  interestPaid: number;
} {
  let remainingPrincipal = Math.max(0, Math.floor(input.principal));
  const allocations: Array<{
    principalPortion: number;
    interestPortion: number;
  }> = [];
  let interestPaid = 0;

  for (const p of input.payments) {
    const hasManual =
      (p.principalPortion != null && p.principalPortion > 0) ||
      (p.interestPortion != null && p.interestPortion > 0);

    const applied = hasManual
      ? applyManualPayment({
          remainingPrincipal,
          remainingInterest: 0,
          principalPortion: p.principalPortion ?? 0,
          interestPortion: p.interestPortion ?? 0,
        })
      : applyFlatPayment({
          remainingPrincipal,
          remainingInterest: 0,
          paymentAmount: p.amount,
        });

    remainingPrincipal = applied.remainingPrincipal;
    interestPaid += applied.interestPortion;
    allocations.push({
      principalPortion: applied.principalPortion,
      interestPortion: applied.interestPortion,
    });
  }

  return {
    remainingPrincipal,
    allocations,
    principalPaid: Math.max(0, input.principal - remainingPrincipal),
    interestPaid,
  };
}

export function resolveMonthlyRate(doc: {
  principal: number;
  monthlyRatePercent?: number | null;
  payments?: Array<{
    principalPortion?: number | null;
    interestPortion?: number | null;
  }>;
}): number {
  if (doc.monthlyRatePercent != null && doc.monthlyRatePercent > 0) {
    return doc.monthlyRatePercent;
  }
  const first = doc.payments?.[0];
  if (first?.interestPortion && first.interestPortion > 0) {
    const inferred = inferMonthlyRatePercent(
      doc.principal,
      first.interestPortion
    );
    if (inferred != null) return inferred;
  }
  return 3;
}

export function buildGoldPlanView(doc: {
  _id: { toString(): string };
  name: string;
  currency: string;
  status: string;
  principal: number;
  remainingPrincipal: number;
  monthlyRatePercent?: number | null;
  totalInterest?: number | null;
  remainingInterest?: number | null;
  months?: number | null;
  monthlyPayment?: number | null;
  startDate: Date | string;
  payments?: Array<{
    _id?: { toString(): string };
    amount: number;
    date: Date | string;
    notes?: string | null;
    principalPortion?: number | null;
    interestPortion?: number | null;
  }>;
}): GoldPlanView {
  const payments = [...(doc.payments ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const paidRecorded = payments.reduce((sum, p) => sum + p.amount, 0);
  const principalPaid = payments.reduce(
    (sum, p) => sum + (p.principalPortion ?? 0),
    0
  );
  const interestPaid = payments.reduce(
    (sum, p) => sum + (p.interestPortion ?? 0),
    0
  );

  const monthlyRatePercent = resolveMonthlyRate({
    principal: doc.principal,
    monthlyRatePercent: doc.monthlyRatePercent,
    payments,
  });

  const remainingPrincipal = Math.max(0, Math.floor(doc.remainingPrincipal));
  const paymentCount = payments.length;
  const avgPrincipal =
    paymentCount > 0 ? Math.floor(principalPaid / paymentCount) : null;

  const recommendation = buildGoldRecommendation({
    originalPrincipal: doc.principal,
    remainingPrincipal,
    monthlyRatePercent,
    principalPaid,
    interestPaid,
    paidRecorded,
    avgPrincipalPerPayment: avgPrincipal,
  });

  const horizon = Math.max(
    3,
    recommendation.recommendedMonthsLeft ?? 4,
    doc.months ?? 0
  );
  const plan = buildIdealGoldPlan({
    principal: remainingPrincipal,
    months: horizon,
    monthlyRatePercent,
    monthlyPayment: recommendation.scenarios[1]?.principalPay ?? null,
  });

  const schedulePreview =
    plan.schedule.length <= 7
      ? plan.schedule
      : [...plan.schedule.slice(0, 6), plan.schedule[plan.schedule.length - 1]!];

  const start = new Date(doc.startDate);
  const monthsElapsed = monthsBetween(start, new Date());

  return {
    id: doc._id.toString(),
    name: doc.name,
    currency: doc.currency as Currency,
    status: doc.status,
    principal: doc.principal,
    remainingPrincipal,
    monthlyRatePercent,
    totalInterest: interestPaid,
    remainingInterest: 0,
    months: horizon,
    monthlyPayment: doc.monthlyPayment ?? null,
    startDate: start.toISOString(),
    paidRecorded,
    paymentCount,
    principalPaid,
    interestPaid,
    payments: payments
      .map((p) => ({
        id: p._id?.toString() ?? `${p.date}-${p.amount}`,
        amount: p.amount,
        date: new Date(p.date).toISOString(),
        notes: p.notes ?? null,
        principalPortion: p.principalPortion ?? 0,
        interestPortion: p.interestPortion ?? 0,
      }))
      .reverse(),
    recommendation,
    plan,
    schedulePreview,
    progress: {
      monthsElapsed,
      nextMonthInterest: recommendation.interestDueNow,
      principalPaid,
      interestPaid,
      paidRecorded,
    },
  };
}
