/**
 * Gold cicilan — bunga bulanan = sisa pokok × monthlyRatePercent.
 * Inferred from payments: 44.4jt → bunga 1.332jt = 3%/bulan.
 * All money values are integer minor units (IDR = rupiah).
 */

export type GoldPayScenario = {
  id: "HEMAT" | "STANDAR" | "LONGGAR";
  labelId: string;
  principalPay: number;
  interestDue: number;
  totalPay: number;
  remainingAfter: number;
  nextInterestAfter: number;
  estimatedMonthsLeft: number;
};

export type GoldProjectionMonth = {
  /** 0 = bulan ini (sebelum bayar), 1 = setelah bayar bulan ini, … */
  offset: number;
  labelKey: string;
  remainingPrincipal: number;
  interestDue: number;
  principalPay: number;
  totalPay: number;
};

export type GoldRecommendation = {
  monthlyRatePercent: number;
  remainingPrincipal: number;
  /** Bunga jatuh tempo bulan ini / depan (dari sisa pokok sekarang). */
  interestDueNow: number;
  principalPaid: number;
  interestPaid: number;
  paidRecorded: number;
  originalPrincipal: number;
  /** Perkiraan sisa bulan jika bayar rata seperti rata-rata pokok historis. */
  recommendedMonthsLeft: number | null;
  scenarios: GoldPayScenario[];
};

export type GoldPaymentApplyResult = {
  remainingPrincipal: number;
  remainingInterest: number;
  principalPortion: number;
  interestPortion: number;
};

/** Monthly interest on remaining principal (rounded). */
export function monthlyInterestDue(
  remainingPrincipal: number,
  monthlyRatePercent: number
): number {
  const bal = Math.max(0, Math.floor(remainingPrincipal));
  const rate = Math.max(0, monthlyRatePercent);
  if (bal <= 0 || rate <= 0) return 0;
  return Math.round((bal * rate) / 100);
}

/**
 * Infer monthly % from observed payment: bunga / pokok_saat_itu.
 * Example: 1_332_000 / 44_400_000 = 3.
 */
export function inferMonthlyRatePercent(
  principalBefore: number,
  interestCharged: number
): number | null {
  const p = Math.max(0, Math.floor(principalBefore));
  const i = Math.max(0, Math.floor(interestCharged));
  if (p <= 0 || i <= 0) return null;
  const raw = (i / p) * 100;
  // Snap to 2 decimals; common shop rates are whole percents.
  const rounded = Math.round(raw * 100) / 100;
  return rounded > 0 && rounded <= 100 ? rounded : null;
}

export function applyManualPayment(input: {
  remainingPrincipal: number;
  remainingInterest: number;
  principalPortion: number;
  interestPortion: number;
}): GoldPaymentApplyResult {
  const remP = Math.max(0, Math.floor(input.remainingPrincipal));
  // Interest pool unused in reducing-balance mode; kept for API compat.
  const remI = Math.max(0, Math.floor(input.remainingInterest));
  const principalPortion = Math.min(
    remP,
    Math.max(0, Math.floor(input.principalPortion))
  );
  const interestPortion = Math.max(0, Math.floor(input.interestPortion));

  return {
    remainingPrincipal: Math.max(0, remP - principalPortion),
    remainingInterest: remI,
    principalPortion,
    interestPortion,
  };
}

/** @deprecated Prefer applyManualPayment; proportional split no longer primary. */
export function applyFlatPayment(input: {
  remainingPrincipal: number;
  remainingInterest: number;
  paymentAmount: number;
}): GoldPaymentApplyResult {
  const remP = Math.max(0, Math.floor(input.remainingPrincipal));
  const remI = Math.max(0, Math.floor(input.remainingInterest));
  let pay = Math.max(0, Math.floor(input.paymentAmount));
  if (pay <= 0) {
    return {
      remainingPrincipal: remP,
      remainingInterest: remI,
      principalPortion: 0,
      interestPortion: 0,
    };
  }
  // Pay interest due first (up to remI if set), else treat all as pokok.
  const interestPortion = Math.min(remI, pay);
  const principalPortion = Math.min(remP, pay - interestPortion);
  return {
    remainingPrincipal: Math.max(0, remP - principalPortion),
    remainingInterest: Math.max(0, remI - interestPortion),
    principalPortion,
    interestPortion,
  };
}

function monthsToClear(remaining: number, monthlyPrincipal: number): number {
  if (remaining <= 0) return 0;
  if (monthlyPrincipal <= 0) return 99;
  return Math.max(1, Math.ceil(remaining / monthlyPrincipal));
}

/**
 * Project remaining pokok + bunga if the user keeps paying the same
 * principal amount each month (plus interest due).
 * Stops when lunas or when monthsAhead / untilPaidOff limit is hit.
 */
export function projectGoldMonths(input: {
  remainingPrincipal: number;
  monthlyRatePercent: number;
  /** Pokok yang direncanakan tiap bulan. */
  principalPayPerMonth: number;
  /** Extra months after this month (ignored if untilPaidOff). */
  monthsAhead?: number;
  /** Keep projecting until remaining pokok = 0 (cap 36). */
  untilPaidOff?: boolean;
}): GoldProjectionMonth[] {
  const rate = Math.max(0, input.monthlyRatePercent);
  let rem = Math.max(0, Math.floor(input.remainingPrincipal));
  const pokok = Math.max(0, Math.floor(input.principalPayPerMonth));
  const untilPaidOff = Boolean(input.untilPaidOff);
  const maxOffset = untilPaidOff
    ? 36
    : Math.min(12, Math.max(1, Math.floor(input.monthsAhead ?? 2)));
  const rows: GoldProjectionMonth[] = [];

  if (rem <= 0 || pokok <= 0) {
    return [
      {
        offset: 0,
        labelKey: "reports.goldProjThisMonth",
        remainingPrincipal: rem,
        interestDue: monthlyInterestDue(rem, rate),
        principalPay: 0,
        totalPay: monthlyInterestDue(rem, rate),
      },
    ];
  }

  for (let offset = 0; offset <= maxOffset && rem > 0; offset++) {
    const interest = monthlyInterestDue(rem, rate);
    const pay = Math.min(rem, pokok);
    rows.push({
      offset,
      labelKey:
        offset === 0
          ? "reports.goldProjThisMonth"
          : offset === 1
            ? "reports.goldProjNextMonth"
            : "reports.goldProjMonthN",
      remainingPrincipal: rem,
      interestDue: interest,
      principalPay: pay,
      totalPay: pay + interest,
    });
    rem = Math.max(0, rem - pay);
    if (untilPaidOff && rem <= 0) break;
    if (!untilPaidOff && offset >= maxOffset) break;
  }

  return rows;
}

export type GoldPayoffSummary = {
  monthsToClear: number;
  /** Cash still to pay from now until lunas (pokok sisa + bunga proyeksi). */
  remainingCash: number;
  remainingPrincipal: number;
  remainingInterestProjected: number;
  /** Already paid cash (pokok + bunga). */
  paidRecorded: number;
  principalPaid: number;
  interestPaid: number;
  /** Grand total cash if projection holds: paid + remaining cash. */
  grandTotal: number;
  /** Total bunga seumur hidup (sudah + proyeksi). */
  totalInterestLifetime: number;
  originalPrincipal: number;
};

export function summarizeGoldPayoff(input: {
  originalPrincipal: number;
  remainingPrincipal: number;
  monthlyRatePercent: number;
  principalPayPerMonth: number;
  paidRecorded: number;
  principalPaid: number;
  interestPaid: number;
}): GoldPayoffSummary {
  const rows = projectGoldMonths({
    remainingPrincipal: input.remainingPrincipal,
    monthlyRatePercent: input.monthlyRatePercent,
    principalPayPerMonth: input.principalPayPerMonth,
    untilPaidOff: true,
  });
  const remainingInterestProjected = rows.reduce(
    (sum, r) => sum + r.interestDue,
    0
  );
  const remainingPrincipal = Math.max(0, Math.floor(input.remainingPrincipal));
  const remainingCash = remainingPrincipal + remainingInterestProjected;
  const paidRecorded = Math.max(0, Math.floor(input.paidRecorded));
  const interestPaid = Math.max(0, Math.floor(input.interestPaid));
  const originalPrincipal = Math.max(0, Math.floor(input.originalPrincipal));

  return {
    monthsToClear: rows.length,
    remainingCash,
    remainingPrincipal,
    remainingInterestProjected,
    paidRecorded,
    principalPaid: Math.max(0, Math.floor(input.principalPaid)),
    interestPaid,
    grandTotal: paidRecorded + remainingCash,
    totalInterestLifetime: interestPaid + remainingInterestProjected,
    originalPrincipal,
  };
}

/**
 * Build pay recommendations so user doesn't pick tenor.
 * Interest due is always rate × current remaining principal.
 */
export function buildGoldRecommendation(input: {
  originalPrincipal: number;
  remainingPrincipal: number;
  monthlyRatePercent: number;
  principalPaid: number;
  interestPaid: number;
  paidRecorded: number;
  /** Average principal paid per installment so far (optional). */
  avgPrincipalPerPayment?: number | null;
}): GoldRecommendation {
  const remainingPrincipal = Math.max(0, Math.floor(input.remainingPrincipal));
  const rate = Math.max(0, input.monthlyRatePercent);
  const interestDueNow = monthlyInterestDue(remainingPrincipal, rate);

  const avg =
    input.avgPrincipalPerPayment != null && input.avgPrincipalPerPayment > 0
      ? Math.floor(input.avgPrincipalPerPayment)
      : Math.ceil(remainingPrincipal / 4);

  // Three principal targets: faster / mid / slower payoff.
  const hematPokok = Math.min(
    remainingPrincipal,
    Math.max(avg, Math.ceil(remainingPrincipal / 3))
  );
  const standarPokok = Math.min(
    remainingPrincipal,
    Math.max(Math.ceil(avg * 0.85), Math.ceil(remainingPrincipal / 4))
  );
  const longgarPokok = Math.min(
    remainingPrincipal,
    Math.max(1_000_000, Math.ceil(remainingPrincipal / 6))
  );

  function scenario(
    id: GoldPayScenario["id"],
    labelId: string,
    principalPay: number
  ): GoldPayScenario {
    const pay = Math.min(remainingPrincipal, Math.max(0, principalPay));
    const remainingAfter = Math.max(0, remainingPrincipal - pay);
    return {
      id,
      labelId,
      principalPay: pay,
      interestDue: interestDueNow,
      totalPay: pay + interestDueNow,
      remainingAfter,
      nextInterestAfter: monthlyInterestDue(remainingAfter, rate),
      estimatedMonthsLeft: monthsToClear(remainingAfter, pay || avg),
    };
  }

  const scenarios = [
    scenario("HEMAT", "reports.goldScenarioHemat", hematPokok),
    scenario("STANDAR", "reports.goldScenarioStandar", standarPokok),
    scenario("LONGGAR", "reports.goldScenarioLonggar", longgarPokok),
  ];

  const recommendedMonthsLeft =
    remainingPrincipal <= 0
      ? 0
      : monthsToClear(remainingPrincipal, standarPokok);

  return {
    monthlyRatePercent: rate,
    remainingPrincipal,
    interestDueNow,
    principalPaid: Math.max(0, Math.floor(input.principalPaid)),
    interestPaid: Math.max(0, Math.floor(input.interestPaid)),
    paidRecorded: Math.max(0, Math.floor(input.paidRecorded)),
    originalPrincipal: Math.max(0, Math.floor(input.originalPrincipal)),
    recommendedMonthsLeft,
    scenarios,
  };
}

/** Calendar months between two dates (floor). */
export function monthsBetween(start: Date, end: Date): number {
  const y = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  let total = y * 12 + m;
  if (end.getDate() < start.getDate()) total -= 1;
  return Math.max(0, total);
}

// --- Legacy exports kept so older tests/imports don't hard-crash ---

export type GoldScheduleRow = {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  remainingPrincipal: number;
  remainingInterest: number;
};

export type GoldIdealPlan = {
  principal: number;
  totalInterest: number;
  months: number;
  monthlyPayment: number;
  totalPayment: number;
  schedule: GoldScheduleRow[];
};

export type GoldProgress = {
  principal: number;
  totalInterest: number;
  remainingPrincipal: number;
  remainingInterest: number;
  paidRecorded: number;
  principalPaid: number;
  interestPaid: number;
  idealPrincipalPaidByNow: number;
  idealInterestPaidByNow: number;
  idealTotalPaidByNow: number;
  monthsElapsed: number;
  monthsRemainingIdeal: number | null;
  onTrack: boolean | null;
  aheadBehindTotal: number | null;
  nextMonthInterest: number | null;
  nextMonthPrincipal: number | null;
  nextMonthPayment: number | null;
};

export function splitEven(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts) || 1);
  const t = Math.max(0, Math.floor(total));
  if (t === 0) return Array.from({ length: n }, () => 0);
  const base = Math.floor(t / n);
  const rem = t - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export function splitDeclining(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts) || 1);
  const t = Math.max(0, Math.floor(total));
  if (t === 0) return Array.from({ length: n }, () => 0);
  const weightSum = (n * (n + 1)) / 2;
  const raw = Array.from({ length: n }, (_, i) =>
    Math.floor((t * (n - i)) / weightSum)
  );
  let gap = t - raw.reduce((a, b) => a + b, 0);
  for (let i = 0; gap > 0 && i < n; i++) {
    raw[i]! += 1;
    gap -= 1;
  }
  return raw;
}

export function splitAscending(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts) || 1);
  const t = Math.max(0, Math.floor(total));
  if (t === 0) return Array.from({ length: n }, () => 0);
  const weightSum = (n * (n + 1)) / 2;
  const raw = Array.from({ length: n }, (_, i) =>
    Math.floor((t * (i + 1)) / weightSum)
  );
  let gap = t - raw.reduce((a, b) => a + b, 0);
  for (let i = n - 1; gap > 0 && i >= 0; i--) {
    raw[i]! += 1;
    gap -= 1;
  }
  return raw;
}

/** Simulate reducing-balance path if paying fixed principal each month. */
export function buildIdealGoldPlan(input: {
  principal: number;
  totalInterest?: number;
  months: number;
  monthlyPayment?: number | null;
  monthlyRatePercent?: number;
}): GoldIdealPlan {
  const principal = Math.max(0, Math.floor(input.principal));
  const months = Math.min(600, Math.max(1, Math.floor(input.months) || 1));
  const rate = input.monthlyRatePercent ?? 3;
  const principalPay =
    input.monthlyPayment != null && input.monthlyPayment > 0
      ? Math.floor(input.monthlyPayment)
      : Math.ceil(principal / months);

  const schedule: GoldScheduleRow[] = [];
  let remP = principal;
  let sumPay = 0;
  let sumInterest = 0;

  for (let month = 1; month <= months && remP > 0; month++) {
    const interest = monthlyInterestDue(remP, rate);
    const pPart = Math.min(remP, principalPay);
    const payment = pPart + interest;
    remP -= pPart;
    sumPay += payment;
    sumInterest += interest;
    schedule.push({
      month,
      payment,
      principal: pPart,
      interest,
      remainingPrincipal: remP,
      remainingInterest: 0,
    });
  }

  return {
    principal,
    totalInterest: sumInterest,
    months: schedule.length || months,
    monthlyPayment: principalPay + monthlyInterestDue(principal, rate),
    totalPayment: sumPay,
    schedule,
  };
}

export function evaluateGoldProgress(input: {
  plan: GoldIdealPlan;
  remainingPrincipal: number;
  remainingInterest: number;
  paidRecorded: number;
  monthsElapsed: number;
  monthlyRatePercent?: number;
}): GoldProgress {
  const { plan } = input;
  const remainingPrincipal = Math.max(0, Math.floor(input.remainingPrincipal));
  const principalPaid = Math.max(0, plan.principal - remainingPrincipal);
  const rate = input.monthlyRatePercent ?? 3;
  const nextInterest = monthlyInterestDue(remainingPrincipal, rate);
  const monthsElapsed = Math.max(0, Math.floor(input.monthsElapsed) || 0);

  return {
    principal: plan.principal,
    totalInterest: plan.totalInterest,
    remainingPrincipal,
    remainingInterest: 0,
    paidRecorded: Math.max(0, Math.floor(input.paidRecorded)),
    principalPaid,
    interestPaid: 0,
    idealPrincipalPaidByNow: 0,
    idealInterestPaidByNow: 0,
    idealTotalPaidByNow: 0,
    monthsElapsed,
    monthsRemainingIdeal:
      remainingPrincipal <= 0
        ? 0
        : Math.max(1, Math.ceil(remainingPrincipal / Math.max(1, plan.monthlyPayment))),
    onTrack: null,
    aheadBehindTotal: null,
    nextMonthInterest: nextInterest,
    nextMonthPrincipal: null,
    nextMonthPayment: nextInterest,
  };
}
