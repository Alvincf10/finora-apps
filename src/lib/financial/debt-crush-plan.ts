import { startOfDay } from "date-fns";
import { monthlyDebtObligation } from "@/lib/financial/debts-due";
import {
  getPayCycleBounds,
  type PayCycleBounds,
} from "@/lib/financial/pay-cycle-bounds";

/** Active installment / payoff debt used for crush projections. */
export type CrushDebtInput = {
  debtId: string;
  name: string;
  remainingAmount: number;
  plannedPayment?: number | null;
  minimumPayment?: number | null;
  installmentMonths?: number | null;
  dueDate?: Date | null;
  /** Excluded from consumer crush when true (e.g. KPR). */
  excludeFromCrush?: boolean;
};

export type CrushCycleInput = {
  start: Date;
  end: Date;
  label: string;
};

export type CrushDebtLine = {
  debtId: string;
  name: string;
  dueAmount: number;
  remainingAfter: number;
};

export type CrushCycleProjection = {
  label: string;
  start: string;
  end: string;
  debtDueTotal: number;
  items: CrushDebtLine[];
  fixedCosts: number;
  /** Optional separate liability payment allocated this cycle (e.g. CC). */
  separateLiabilityPay: number;
  livingCap: number;
  floorWithoutLiving: number;
  totalNeed: number;
  income: number;
  cashAtStart: number;
  /** income + cash − totalNeed (negative = gap). */
  surplus: number;
  livingMaxAtIncome: number;
};

export type CrushPlanResult = {
  cycles: CrushCycleProjection[];
  debtRemainingStart: number;
  debtRemainingEnd: number;
  separateLiabilityStart: number;
  separateLiabilityEnd: number;
  /** Max income needed across cycles to fund debt+fixed+living+liability. */
  incomeRequiredForLiving: number;
  /** Bottleneck living max given stated income (min across cycles). */
  livingMaxGivenIncome: number;
  bottleneckCycleLabel: string | null;
  feasible: boolean;
};

export type PaydayCompletenessEnvelope = {
  key: string;
  label: string;
  amount: number;
  kind: string;
};

export type PaydayCompletenessResult = {
  ok: boolean;
  score: number;
  salary: number;
  expectedObligated: number;
  savedObligated: number;
  allocatedTotal: number;
  utilizationPct: number;
  missingKeys: string[];
  missingLabels: string[];
  issues: string[];
};

const OBLIGATION_KINDS = new Set([
  "DEBT",
  "FIXED",
  "CC_STATEMENT",
]);

/**
 * Build the next `count` pay cycles starting from the cycle that contains `now`
 * (or the upcoming one when `fromTarget` is `next`).
 */
export function buildUpcomingCycles(
  paydayDay: number,
  count: number,
  now: Date = new Date(),
  fromTarget: "current" | "next" = "next"
): CrushCycleInput[] {
  const current = getPayCycleBounds(paydayDay, now);
  let cursor: PayCycleBounds = current;
  if (fromTarget === "next") {
    const probe = startOfDay(new Date(current.end));
    probe.setDate(probe.getDate() + 1);
    cursor = getPayCycleBounds(paydayDay, probe);
  }

  const cycles: CrushCycleInput[] = [];
  for (let i = 0; i < count; i++) {
    cycles.push({
      start: cursor.start,
      end: cursor.end,
      label: cursor.label,
    });
    const probe = startOfDay(new Date(cursor.end));
    probe.setDate(probe.getDate() + 1);
    cursor = getPayCycleBounds(paydayDay, probe);
  }
  return cycles;
}

function cloneDebts(debts: CrushDebtInput[]) {
  return debts
    .filter((d) => !d.excludeFromCrush && d.remainingAmount > 0)
    .map((d) => ({
      ...d,
      remainingAmount: d.remainingAmount,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
    }));
}

/**
 * Project scheduled debt dues across pay cycles, assuming each due is paid
 * in full when it appears (same obligation rules as debts-due).
 */
export function projectDebtSchedule(
  debts: CrushDebtInput[],
  cycles: CrushCycleInput[]
): Array<{
  label: string;
  start: Date;
  end: Date;
  debtDueTotal: number;
  items: CrushDebtLine[];
  remainingAfterCycle: number;
}> {
  const state = cloneDebts(debts);
  const out: Array<{
    label: string;
    start: Date;
    end: Date;
    debtDueTotal: number;
    items: CrushDebtLine[];
    remainingAfterCycle: number;
  }> = [];

  for (const cycle of cycles) {
    // Use pay-cycle end (not month-end extension) so dues on the next payday
    // stay in the next cycle — matches payday allocation windows.
    const windowEnd = cycle.end;
    const items: CrushDebtLine[] = [];
    let debtDueTotal = 0;

    for (const debt of state) {
      if (debt.remainingAmount <= 0) continue;
      const { dueAmount } = monthlyDebtObligation(
        debt,
        cycle.start,
        windowEnd
      );
      if (dueAmount <= 0) continue;
      const pay = Math.min(dueAmount, debt.remainingAmount);
      debt.remainingAmount -= pay;
      debtDueTotal += pay;
      items.push({
        debtId: debt.debtId,
        name: debt.name,
        dueAmount: pay,
        remainingAfter: debt.remainingAmount,
      });
      // dueDate stays — same as debts-due: unpaid/overdue installments
      // reappear each cycle via isOverdueUntil remaining clears.
    }

    items.sort((a, b) => b.dueAmount - a.dueAmount);
    out.push({
      label: cycle.label,
      start: cycle.start,
      end: cycle.end,
      debtDueTotal,
      items,
      remainingAfterCycle: state.reduce((s, d) => s + d.remainingAmount, 0),
    });
  }

  return out;
}

/**
 * Split a separate liability (e.g. CC balance) across cycles using leftover
 * after debt + fixed + living, capped so earlier cycles pay first.
 */
export function allocateSeparateLiability(
  balance: number,
  cycleFloors: number[],
  income: number,
  cashByCycle: number[]
): number[] {
  let left = Math.max(0, Math.floor(balance));
  return cycleFloors.map((floor, i) => {
    if (left <= 0) return 0;
    const available = Math.max(
      0,
      income + (cashByCycle[i] ?? 0) - floor
    );
    const pay = Math.min(left, available);
    left -= pay;
    return pay;
  });
}

/**
 * Full crush plan: calendar, cash gap, living max, income required.
 */
export function computeCrushPlan(input: {
  debts: CrushDebtInput[];
  cycles: CrushCycleInput[];
  income: number;
  fixedCostsPerCycle: number;
  livingCap: number;
  /** Cash available only for the first cycle (later cycles = 0 unless provided). */
  startingCash?: number;
  cashByCycle?: number[];
  separateLiability?: number;
  /** If true, dump all surplus after living into the separate liability. */
  paySeparateLiabilityFromSurplus?: boolean;
}): CrushPlanResult {
  const income = Math.max(0, Math.floor(input.income));
  const fixed = Math.max(0, Math.floor(input.fixedCostsPerCycle));
  const livingCap = Math.max(0, Math.floor(input.livingCap));
  const separateStart = Math.max(0, Math.floor(input.separateLiability ?? 0));
  const schedule = projectDebtSchedule(input.debts, input.cycles);

  const cashByCycle =
    input.cashByCycle ??
    input.cycles.map((_, i) =>
      i === 0 ? Math.max(0, Math.floor(input.startingCash ?? 0)) : 0
    );

  const floors = schedule.map((c) => c.debtDueTotal + fixed + livingCap);
  const liabilityPays = input.paySeparateLiabilityFromSurplus
    ? allocateSeparateLiability(separateStart, floors, income, cashByCycle)
    : schedule.map(() => 0);

  let separateLeft = separateStart;
  const cycles: CrushCycleProjection[] = schedule.map((c, i) => {
    const separateLiabilityPay = Math.min(
      separateLeft,
      liabilityPays[i] ?? 0
    );
    separateLeft -= separateLiabilityPay;
    const floorWithoutLiving = c.debtDueTotal + fixed + separateLiabilityPay;
    const totalNeed = floorWithoutLiving + livingCap;
    const cashAtStart = cashByCycle[i] ?? 0;
    const surplus = income + cashAtStart - totalNeed;
    const livingMaxAtIncome = income + cashAtStart - floorWithoutLiving;

    return {
      label: c.label,
      start: c.start.toISOString(),
      end: c.end.toISOString(),
      debtDueTotal: c.debtDueTotal,
      items: c.items,
      fixedCosts: fixed,
      separateLiabilityPay,
      livingCap,
      floorWithoutLiving,
      totalNeed,
      income,
      cashAtStart,
      surplus,
      livingMaxAtIncome,
    };
  });

  const livingMaxes = cycles.map((c) => c.livingMaxAtIncome);
  const livingMaxGivenIncome =
    livingMaxes.length > 0 ? Math.min(...livingMaxes) : 0;
  const bottleneckIdx = livingMaxes.indexOf(livingMaxGivenIncome);

  const incomeRequiredForLiving =
    cycles.length === 0
      ? livingCap + fixed
      : Math.max(
          ...cycles.map(
            (c) =>
              c.debtDueTotal +
              c.fixedCosts +
              livingCap +
              c.separateLiabilityPay -
              c.cashAtStart
          )
        );

  const debtRemainingStart = input.debts
    .filter((d) => !d.excludeFromCrush)
    .reduce((s, d) => s + Math.max(0, d.remainingAmount), 0);

  return {
    cycles,
    debtRemainingStart,
    debtRemainingEnd: schedule.at(-1)?.remainingAfterCycle ?? debtRemainingStart,
    separateLiabilityStart: separateStart,
    separateLiabilityEnd: separateLeft,
    incomeRequiredForLiving: Math.max(0, incomeRequiredForLiving),
    livingMaxGivenIncome,
    bottleneckCycleLabel:
      bottleneckIdx >= 0 ? (cycles[bottleneckIdx]?.label ?? null) : null,
    feasible: livingMaxGivenIncome >= 0 && cycles.every((c) => c.surplus >= 0),
  };
}

/**
 * Income needed so that livingCap still leaves surplus ≥ 0 every cycle,
 * while clearing `separateLiability` from surplus when possible.
 */
export function incomeRequiredToClear(input: {
  debts: CrushDebtInput[];
  cycles: CrushCycleInput[];
  fixedCostsPerCycle: number;
  livingCap: number;
  startingCash?: number;
  separateLiability?: number;
}): number {
  // Binary-ish search via walking up from the hard floor.
  const schedule = projectDebtSchedule(input.debts, input.cycles);
  const fixed = Math.max(0, Math.floor(input.fixedCostsPerCycle));
  const living = Math.max(0, Math.floor(input.livingCap));
  const cash0 = Math.max(0, Math.floor(input.startingCash ?? 0));
  const separate = Math.max(0, Math.floor(input.separateLiability ?? 0));

  let lo = 0;
  for (let i = 0; i < schedule.length; i++) {
    const cash = i === 0 ? cash0 : 0;
    lo = Math.max(lo, schedule[i].debtDueTotal + fixed + living - cash);
  }
  // Also need enough aggregate surplus to clear separate liability.
  lo = Math.max(lo, Math.ceil(separate / Math.max(1, schedule.length)));

  let hi = lo + separate + 1;
  // Expand hi until plan is feasible.
  for (let guard = 0; guard < 20; guard++) {
    const plan = computeCrushPlan({
      debts: input.debts,
      cycles: input.cycles,
      income: hi,
      fixedCostsPerCycle: fixed,
      livingCap: living,
      startingCash: cash0,
      separateLiability: separate,
      paySeparateLiabilityFromSurplus: true,
    });
    if (plan.feasible && plan.separateLiabilityEnd === 0) break;
    hi += Math.max(500_000, Math.ceil(separate / 2));
  }

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const plan = computeCrushPlan({
      debts: input.debts,
      cycles: input.cycles,
      income: mid,
      fixedCostsPerCycle: fixed,
      livingCap: living,
      startingCash: cash0,
      separateLiability: separate,
      paySeparateLiabilityFromSurplus: true,
    });
    if (plan.feasible && plan.separateLiabilityEnd === 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function isObligation(kind: string) {
  return OBLIGATION_KINDS.has(kind);
}

/**
 * Compare saved payday envelopes vs auto-suggested obligations.
 * Flags under-allocation (e.g. salary 8.15jt but only ChatGPT 75rb saved).
 */
export function assessPaydayCompleteness(input: {
  salary: number;
  startingCash?: number;
  expected: PaydayCompletenessEnvelope[];
  saved: PaydayCompletenessEnvelope[] | null | undefined;
}): PaydayCompletenessResult {
  const salary = Math.max(0, input.salary);
  const startingCash = Math.max(0, input.startingCash ?? 0);
  const totalIn = salary + startingCash;
  const expectedObligations = input.expected.filter((e) => isObligation(e.kind));
  const expectedObligated = expectedObligations.reduce(
    (s, e) => s + Math.max(0, e.amount),
    0
  );
  const expectedKeys = new Set(expectedObligations.map((e) => e.key));

  const saved = input.saved ?? [];
  const savedObligations = saved.filter((e) => isObligation(e.kind));
  const savedObligated = savedObligations.reduce(
    (s, e) => s + Math.max(0, e.amount),
    0
  );
  const allocatedTotal = saved.reduce((s, e) => s + Math.max(0, e.amount), 0);
  const savedKeys = new Set(saved.map((e) => e.key));

  const missing = expectedObligations.filter((e) => !savedKeys.has(e.key));
  const issues: string[] = [];

  if (!input.saved || input.saved.length === 0) {
    issues.push("Belum ada payday allocation tersimpan untuk siklus ini.");
  } else if (missing.length > 0) {
    issues.push(
      `${missing.length} kewajiban otomatis belum masuk envelope tersimpan.`
    );
  }

  if (
    expectedObligated > 0 &&
    savedObligated < Math.floor(expectedObligated * 0.5)
  ) {
    issues.push(
      `Envelope kewajiban tersimpan jauh di bawah saran (${savedObligated} vs ${expectedObligated}).`
    );
  }

  if (totalIn > 0 && allocatedTotal < Math.floor(totalIn * 0.25) && totalIn >= 1_000_000) {
    issues.push(
      `Alokasi total (${allocatedTotal}) terlalu kecil dibanding gaji+kas (${totalIn}).`
    );
  }

  const coverage =
    expectedObligated <= 0
      ? saved.length > 0
        ? 1
        : 0
      : Math.min(1, savedObligated / expectedObligated);
  const utilizationPct =
    totalIn > 0 ? Math.round((allocatedTotal / totalIn) * 1000) / 10 : 0;
  const score = Math.round(
    (coverage * 0.7 + Math.min(1, utilizationPct / 80) * 0.3) * 100
  );
  const ok = issues.length === 0 && score >= 70;

  // Keys that are expected but absent — also count expected keys never listed
  // when saved is a tiny subset.
  const missingKeys = missing.map((m) => m.key);
  for (const key of expectedKeys) {
    if (!savedKeys.has(key) && !missingKeys.includes(key)) missingKeys.push(key);
  }

  return {
    ok,
    score,
    salary,
    expectedObligated,
    savedObligated,
    allocatedTotal,
    utilizationPct,
    missingKeys,
    missingLabels: missing.map((m) => m.label),
    issues,
  };
}
