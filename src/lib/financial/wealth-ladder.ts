import mongoose from "mongoose";
import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Transaction } from "@/models/Transaction";
import {
  getFinancialProfile,
  getSpendingAnalytics,
} from "@/lib/financial/phase2-service";
import { getFinancialSummary } from "@/lib/financial/summary";
import { formatMoney } from "@/lib/money";
import type { Period } from "@/lib/financial/phase2-types";
import type { Currency, DebtKind } from "@/types";
import {
  LADDER_CASH_TARGET_IDR,
  LADDER_EMERGENCY_MONTHS,
  LADDER_EMERGENCY_STRETCH_MONTHS,
  LADDER_INVEST_RATIO,
  LADDER_RULE_VERSION,
  LADDER_STARTER_GOAL_NAME,
  applySequentialGate,
  calculateEligibleLiquidBalanceIdr,
  calculateEmergencyCoverage,
  calculateInvestmentRate,
  calculateLadderProgress,
  clampPct,
  EDUCATION_PATTERNS,
  EMERGENCY_PATTERNS,
  GIVING_PATTERNS,
  INVEST_PATTERNS,
  inferDebtKind,
  isStarterCashGoal,
  nameMatches,
  resolveEssentialMonthly,
  syncStarterGoalAmount,
  toLegacyStatus,
  WEALTH_PATTERNS,
  type ConditionMet,
  type LadderActionType,
  type LadderProgressUnit,
  type LadderStepId,
  type LadderStepStatus,
  type LegacyLadderStatus,
} from "@/lib/financial/wealth-ladder-math";

export * from "@/lib/financial/wealth-ladder-math";

export interface LadderStep {
  id: LadderStepId;
  title: string;
  description: string;
  /** PRD status */
  status: LadderStepStatus;
  /** Backward-compatible alias for older UI mappings */
  legacyStatus: LegacyLadderStatus;
  conditionMet: ConditionMet;
  gateUnlocked: boolean;
  creditedComplete: boolean;
  reasonCode: string;
  reason: string;
  progress?: number;
  detail?: string;
  actionType: LadderActionType;
  progressMeta?: {
    current: number;
    target: number;
    unit: LadderProgressUnit;
  };
}

export interface WealthLadderResult {
  currentStep: LadderStepId | null;
  completedCount: number;
  totalSteps: 7;
  applicableSteps: number;
  progressPercent: number;
  currency: Currency;
  ruleVersion: string;
  evaluatedAt: string;
  steps: LadderStep[];
}

/**
 * Idempotent upsert for system BASIC_SAVINGS goal.
 * Progress is contribution-only (Goals → Nabung & catat / contribute).
 * Does not import BCA/ATM liquid balances as "sudah nabung".
 */
export async function ensureStarterCashGoal(
  userId: string,
  currency: Currency,
  _liquidCash: number
) {
  if (currency !== "IDR") return null;

  const existing = await SavingsGoal.find({
    userId,
    status: { $in: ["ACTIVE", "COMPLETED"] },
  }).sort({ updatedAt: -1 });

  let goal =
    existing.find(
      (g) =>
        g.name === LADDER_STARTER_GOAL_NAME ||
        (g as { goalType?: string }).goalType === "BASIC_SAVINGS"
    ) ??
    existing.find((g) => isStarterCashGoal(g.name, g.targetAmount)) ??
    null;

  if (!goal) {
    try {
      return await SavingsGoal.create({
        userId,
        name: LADDER_STARTER_GOAL_NAME,
        goalType: "BASIC_SAVINGS",
        isSystem: true,
        targetAmount: LADDER_CASH_TARGET_IDR,
        currentAmount: 0,
        currency: "IDR",
        priority: 100,
        notes: "Auto dari Tangga Ternak Uang · step 1 · isi via kontribusi Goals",
        status: "ACTIVE",
      });
    } catch {
      // Concurrent create — reload
      goal = await SavingsGoal.findOne({
        userId,
        name: LADDER_STARTER_GOAL_NAME,
      });
      if (!goal) return null;
    }
  }

  let dirty = false;
  if ((goal as { goalType?: string }).goalType !== "BASIC_SAVINGS") {
    (goal as { goalType?: string }).goalType = "BASIC_SAVINGS";
    dirty = true;
  }
  if ((goal as { isSystem?: boolean }).isSystem !== true) {
    (goal as { isSystem?: boolean }).isSystem = true;
    dirty = true;
  }
  if (goal.targetAmount !== LADDER_CASH_TARGET_IDR) {
    goal.targetAmount = LADDER_CASH_TARGET_IDR;
    dirty = true;
  }

  // Correct legacy auto-synced liquid amounts: only real goal contributions count.
  const contributionRows = await Transaction.aggregate<{ total: number }>([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        goalId: goal._id,
        type: "EXPENSE",
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const corrected = syncStarterGoalAmount(contributionRows[0]?.total ?? 0);
  if ((goal.currentAmount ?? 0) !== corrected) {
    goal.currentAmount = corrected;
    dirty = true;
  }

  if (corrected >= LADDER_CASH_TARGET_IDR) {
    if (goal.status !== "COMPLETED") {
      goal.status = "COMPLETED";
      dirty = true;
    }
  } else if (goal.status !== "ACTIVE") {
    goal.status = "ACTIVE";
    dirty = true;
  }
  if (dirty) await goal.save();
  return goal;
}

function goalTypeOf(g: { goalType?: string; name: string }) {
  return g.goalType ?? null;
}

export async function evaluateWealthLadder(
  userId: string,
  period: Period,
  prefs?: { educationGoalApplicability?: "APPLICABLE" | "NOT_APPLICABLE" | "UNSET" }
): Promise<WealthLadderResult> {
  const [accounts, debts, goals, summary, profile, analytics] =
    await Promise.all([
      Account.find({ userId, isActive: true }).lean(),
      Debt.find({ userId }).lean(),
      SavingsGoal.find({ userId, status: { $ne: "CANCELLED" } }).lean(),
      getFinancialSummary(userId, period),
      getFinancialProfile(userId, period),
      getSpendingAnalytics(userId, period),
    ]);

  const activeGoals = goals.filter(
    (g) => g.status === "ACTIVE" || g.status === "COMPLETED"
  );

  const currency: Currency = accounts.some((a) => a.currency === "IDR")
    ? "IDR"
    : summary.currency;
  const money = (n: number) => formatMoney(n, currency);

  const liquidCash = calculateEligibleLiquidBalanceIdr(
    accounts.map((a) => ({
      currency: a.currency,
      type: a.type,
      isActive: a.isActive,
      currentBalance: a.currentBalance,
    }))
  );

  const starterGoal = await ensureStarterCashGoal(userId, currency, liquidCash);
  const starterAmount = starterGoal?.currentAmount ?? 0;
  const starterTarget = starterGoal?.targetAmount ?? LADDER_CASH_TARGET_IDR;

  // —— Step conditions ——
  const step1Met: ConditionMet =
    currency !== "IDR"
      ? false
      : starterAmount >= starterTarget || starterGoal?.status === "COMPLETED";

  const activeDebts = debts.filter(
    (d) => d.status === "ACTIVE" && d.remainingAmount > 0
  );
  const classified = activeDebts.map((d) => ({
    ...d,
    resolvedKind: inferDebtKind(d.name, (d as { kind?: DebtKind }).kind),
    inferred:
      !(d as { kind?: DebtKind }).kind &&
      inferDebtKind(d.name, null) === "MORTGAGE",
  }));
  const smallDebts = classified.filter((d) => d.resolvedKind !== "MORTGAGE");
  const mortgages = classified.filter((d) => d.resolvedKind === "MORTGAGE");
  const step2Met: ConditionMet = smallDebts.length === 0;
  const smallDebtTotal = smallDebts.reduce((s, d) => s + d.remainingAmount, 0);
  const smallDebtOriginal = smallDebts.reduce(
    (s, d) => s + d.originalAmount,
    0
  );

  const emergencyGoal = activeGoals.find(
    (g) =>
      goalTypeOf(g as { goalType?: string; name: string }) ===
        "EMERGENCY_FUND" || nameMatches(g.name, EMERGENCY_PATTERNS)
  );
  const essentialFromCategories = analytics
    .filter((row) => row.classification === "ESSENTIAL")
    .reduce((sum, row) => sum + (row.average3m || row.currentAmount || 0), 0);
  const essentialResolved = resolveEssentialMonthly({
    essentialFromCategories,
    averageFixedExpense: profile.averageFixedExpense ?? 0,
    averageMonthlyExpense: profile.averageMonthlyExpense ?? 0,
    emergencyGoalTarget: emergencyGoal?.targetAmount ?? null,
  });
  const essentialMonthly = essentialResolved.essentialMonthly;
  const emergencyFund = emergencyGoal
    ? emergencyGoal.currentAmount ?? 0
    : Math.max(0, liquidCash - starterAmount);
  const emergency = calculateEmergencyCoverage(emergencyFund, essentialMonthly);
  const step3Met = emergency.conditionMet;

  const incomeBase =
    summary.income > 0 ? summary.income : profile.averageMonthlyIncome;
  const investAmount = analytics
    .filter((row) => nameMatches(row.categoryName, INVEST_PATTERNS))
    .reduce((s, row) => s + row.currentAmount, 0);
  const invest = calculateInvestmentRate(investAmount, incomeBase);
  const step4Met = invest.conditionMet;

  const educationNA =
    prefs?.educationGoalApplicability === "NOT_APPLICABLE";
  const educationGoal = activeGoals.find(
    (g) =>
      goalTypeOf(g as { goalType?: string; name: string }) === "EDUCATION" ||
      nameMatches(g.name, EDUCATION_PATTERNS)
  );
  // Having a valid education goal = planned (enough to clear gate).
  const step5Met: ConditionMet = educationNA ? false : Boolean(educationGoal);

  const paidMortgages = debts.filter(
    (d) =>
      inferDebtKind(d.name, (d as { kind?: DebtKind }).kind) === "MORTGAGE" &&
      (d.status === "PAID" || d.remainingAmount <= 0)
  );
  const step6Met: ConditionMet = mortgages.length === 0;
  const mortgageTotal = mortgages.reduce((s, d) => s + d.remainingAmount, 0);
  const mortgageOriginal = mortgages.reduce((s, d) => s + d.originalAmount, 0);

  const wealthOrGivingGoal = activeGoals.find((g) => {
    const t = goalTypeOf(g as { goalType?: string; name: string });
    return (
      t === "CHARITY" ||
      t === "WEALTH" ||
      nameMatches(g.name, GIVING_PATTERNS) ||
      nameMatches(g.name, WEALTH_PATTERNS)
    );
  });
  const givingSpend = analytics
    .filter((row) => nameMatches(row.categoryName, GIVING_PATTERNS))
    .reduce((s, row) => s + row.currentAmount, 0);
  // ACHIEVED only if goal target reached / COMPLETED — not a single donation.
  const step7Met: ConditionMet = Boolean(
    wealthOrGivingGoal &&
      (wealthOrGivingGoal.status === "COMPLETED" ||
        (wealthOrGivingGoal.targetAmount > 0 &&
          (wealthOrGivingGoal.currentAmount ?? 0) >=
            wealthOrGivingGoal.targetAmount))
  );

  const gates = applySequentialGate([
    { step: 1, conditionMet: step1Met },
    { step: 2, conditionMet: step2Met },
    { step: 3, conditionMet: step3Met },
    { step: 4, conditionMet: step4Met },
    {
      step: 5,
      conditionMet: step5Met,
      notApplicable: educationNA,
    },
    { step: 6, conditionMet: step6Met },
    { step: 7, conditionMet: step7Met },
  ]);
  const gateByStep = new Map(gates.map((g) => [g.step, g]));
  const progress = calculateLadderProgress(gates);

  function pack(
    id: LadderStepId,
    title: string,
    description: string,
    reasonCode: string,
    reason: string,
    detail: string,
    actionType: LadderActionType,
    rawProgress: number,
    progressMeta?: LadderStep["progressMeta"]
  ): LadderStep {
    const g = gateByStep.get(id)!;
    const lockedDetail =
      g.status === "LOCKED" && g.conditionMet === true
        ? `${detail} · terkunci sampai step sebelumnya selesai`
        : detail;
    return {
      id,
      title,
      description,
      status: g.status,
      legacyStatus: toLegacyStatus(g.status),
      conditionMet: g.conditionMet,
      gateUnlocked: g.gateUnlocked,
      creditedComplete: g.creditedComplete,
      reasonCode,
      reason,
      progress:
        g.status === "LOCKED"
          ? 0
          : g.creditedComplete
            ? 100
            : rawProgress,
      detail: lockedDetail,
      actionType,
      progressMeta,
    };
  }

  const step1Reason =
    currency !== "IDR"
      ? {
          code: "STEP1_NON_IDR",
          text: "Target Rp10jt hanya untuk rekening IDR pada MVP.",
        }
      : step1Met
        ? {
            code: "STEP1_MET",
            text: "Tabungan dasar mencapai target Rp10jt.",
          }
        : {
            code: "STEP1_BELOW_TARGET",
            text: "Tabungan dasar masih di bawah Rp10jt.",
          };

  const step3Reason =
    step3Met === "UNKNOWN"
      ? {
          code: "STEP3_UNKNOWN_ESSENTIALS",
          text: emergencyGoal
            ? `Goal “${emergencyGoal.name}” terdeteksi, tapi belum bisa hitung coverage — set target goal atau catat belanja esensial.`
            : "Pengeluaran esensial belum cukup data — coverage UNKNOWN.",
        }
      : step3Met
        ? {
            code: "STEP3_MET",
            text: `Coverage dana darurat ≥ ${LADDER_EMERGENCY_MONTHS} bulan.`,
          }
        : {
            code: "STEP3_BELOW",
            text:
              essentialResolved.source === "goal_target"
                ? `Coverage masih di bawah ${LADDER_EMERGENCY_MONTHS} bulan (essentials diestimasi dari target goal ÷ ${LADDER_EMERGENCY_MONTHS}).`
                : `Coverage masih di bawah ${LADDER_EMERGENCY_MONTHS} bulan.`,
          };

  const step4Reason =
    step4Met === "UNKNOWN"
      ? {
          code: "STEP4_UNKNOWN_INCOME",
          text: "Pendapatan belum valid/nol — rasio investasi UNKNOWN.",
        }
      : step4Met
        ? {
            code: "STEP4_MET",
            text: `Kontribusi investasi ≥ ${LADDER_INVEST_RATIO * 100}% income.`,
          }
        : {
            code: "STEP4_BELOW",
            text: `Kontribusi investasi di bawah ${LADDER_INVEST_RATIO * 100}% income.`,
          };

  const step6Reason = step6Met
    ? paidMortgages.length > 0
      ? {
          code: "STEP6_PAID_OFF",
          text: "KPR sudah dilunasi / tidak ada sisa aktif.",
        }
      : {
          code: "STEP6_NO_MORTGAGE",
          text: "Tidak ada KPR aktif (bukan berarti baru saja dilunasi).",
        }
    : {
        code: "STEP6_ACTIVE",
        text: "Masih ada KPR aktif — tinjau kewajiban, jangan otomatis percepat pelunasan.",
      };

  const step7Reason = step7Met
    ? {
        code: "STEP7_ACHIEVED",
        text: "Target goal berbagi/kekayaan tercapai.",
      }
    : wealthOrGivingGoal
      ? {
          code: "STEP7_PLANNED",
          text: `Goal ada (${wealthOrGivingGoal.name}) tetapi target belum tercapai.`,
        }
      : givingSpend > 0
        ? {
            code: "STEP7_ACTIVITY_ONLY",
            text: "Ada transaksi berbagi, tetapi belum ada target goal yang tercapai.",
          }
        : {
            code: "STEP7_MISSING",
            text: "Belum ada goal berbagi/kekayaan dengan target terukur.",
          };

  const steps: LadderStep[] = [
    pack(
      1,
      "Nabung cash 10 juta",
      "Goal Tabungan dasar 10jt — hanya dari kontribusi Goals (Nabung & catat). Kas di rekening tidak dihitung otomatis.",
      step1Reason.code,
      step1Reason.text,
      currency === "IDR"
        ? `${starterGoal?.name ?? LADDER_STARTER_GOAL_NAME}: ${money(starterAmount)} / ${money(starterTarget)} · kas rekening sekarang ${money(liquidCash)} (tidak dihitung otomatis)`
        : `Saldo non-IDR tidak dihitung ke target Rp10jt pada MVP`,
      "VIEW_GOALS",
      currency === "IDR"
        ? clampPct((starterAmount / Math.max(1, starterTarget)) * 100)
        : 0,
      {
        current: starterAmount,
        target: starterTarget,
        unit: "IDR",
      }
    ),
    pack(
      2,
      "Lunasin semua hutang kecil (kecuali KPR)",
      "Bersihkan cicilan konsumtif sebelum bangun aset besar.",
      step2Met ? "STEP2_CLEAR" : "STEP2_OUTSTANDING",
      step2Met
        ? "Tidak ada hutang non-KPR aktif dengan sisa > 0."
        : `${smallDebts.length} hutang non-KPR masih aktif.`,
      step2Met
        ? "Tidak ada hutang non-KPR aktif"
        : `${smallDebts.length} hutang · sisa ${money(smallDebtTotal)}`,
      "VIEW_DEBT",
      step2Met
        ? 100
        : clampPct(
            ((smallDebtOriginal - smallDebtTotal) /
              Math.max(1, smallDebtOriginal)) *
              100
          ),
      {
        current: Math.max(0, smallDebtOriginal - smallDebtTotal),
        target: Math.max(1, smallDebtOriginal),
        unit: "IDR",
      }
    ),
    pack(
      3,
      "Simpan 3–6 bulan dana darurat",
      `Minimum ${LADDER_EMERGENCY_MONTHS} bulan essentials; target lanjut ${LADDER_EMERGENCY_STRETCH_MONTHS} bulan.`,
      step3Reason.code,
      step3Reason.text,
      emergency.coverageMonths != null
        ? `${
            emergencyGoal
              ? `${emergencyGoal.name}: ${money(emergencyFund)} / ${money(emergencyGoal.targetAmount)} · `
              : ""
          }Coverage ~${Math.round(emergency.coverageMonths * 10) / 10} bln · min ${LADDER_EMERGENCY_MONTHS}${
            essentialResolved.source === "goal_target"
              ? ` · essentials ≈ target÷${LADDER_EMERGENCY_MONTHS}`
              : ""
          }`
        : emergencyGoal
          ? `${emergencyGoal.name}: ${money(emergencyFund)} / ${money(emergencyGoal.targetAmount)} — set target goal agar coverage bisa dihitung`
          : "Buat goal Dana Darurat (dengan target) + catat belanja esensial",
      "VIEW_GOALS",
      emergency.coverageMonths != null
        ? clampPct(
            (emergency.coverageMonths / LADDER_EMERGENCY_MONTHS) * 100
          )
        : emergencyGoal
          ? clampPct(
              ((emergencyFund) / Math.max(1, emergencyGoal.targetAmount)) * 100
            )
          : 0,
      emergency.coverageMonths != null
        ? {
            current: emergency.coverageMonths,
            target: LADDER_EMERGENCY_MONTHS,
            unit: "MONTHS",
          }
        : undefined
    ),
    pack(
      4,
      "Investasi minimal 20% dari income",
      "Rasio kontribusi investasi vs pendapatan eligible (bukan return investasi).",
      step4Reason.code,
      step4Reason.text,
      invest.rate != null
        ? `${Math.round(invest.rate * 100)}% dari income (${money(investAmount)} / ${money(incomeBase)}) · bulan berjalan`
        : "Catat income & kategori investasi agar rasio bisa dihitung",
      investAmount > 0 ? "VIEW_SPENDING" : "VIEW_BUDGET_REC",
      invest.rate != null
        ? clampPct((invest.rate / LADDER_INVEST_RATIO) * 100)
        : 0,
      invest.rate != null
        ? {
            current: Math.round(invest.rate * 10000) / 100,
            target: LADDER_INVEST_RATIO * 100,
            unit: "PERCENT",
          }
        : undefined
    ),
    pack(
      5,
      "Bikin dana pendidikan anak",
      educationNA
        ? "Ditandai tidak relevan — tidak menghalangi step berikutnya."
        : "Selalu ditampilkan. Keberadaan goal = direncanakan (bukan dana sudah penuh).",
      educationNA
        ? "STEP5_NOT_APPLICABLE"
        : educationGoal
          ? "STEP5_PLANNED"
          : "STEP5_MISSING",
      educationNA
        ? "Pengguna menandai pendidikan anak tidak relevan."
        : educationGoal
          ? `Goal pendidikan ada: ${educationGoal.name}.`
          : "Belum ada goal pendidikan / sekolah / anak.",
      educationNA
        ? "Tidak relevan"
        : educationGoal
          ? `${educationGoal.name}: ${money(educationGoal.currentAmount)} / ${money(educationGoal.targetAmount)}`
          : "Belum ada goal pendidikan / sekolah / anak",
      "VIEW_GOALS",
      educationGoal
        ? educationGoal.status === "COMPLETED"
          ? 100
          : clampPct(
              ((educationGoal.currentAmount ?? 0) /
                Math.max(1, educationGoal.targetAmount)) *
                100
            )
        : 0
    ),
    pack(
      6,
      "Kelola / lunasi KPR",
      "Tinjau kewajiban KPR setelah fondasi aman — percepat pelunasan tidak selalu optimal.",
      step6Reason.code,
      step6Reason.text,
      step6Met
        ? paidMortgages.length > 0
          ? "KPR sudah lunas / tidak ada sisa"
          : "Tidak ada KPR aktif"
        : `${mortgages.length} KPR · sisa ${money(mortgageTotal)}${
            classified.some((d) => d.inferred)
              ? " · jenis diinfer dari nama — konfirmasi di Debts"
              : ""
          }`,
      "VIEW_DEBT",
      step6Met
        ? 100
        : clampPct(
            ((mortgageOriginal - mortgageTotal) /
              Math.max(1, mortgageOriginal)) *
              100
          )
    ),
    pack(
      7,
      "Kekayaan abadi & berbagi",
      "Target akhir: goal berbagi/kekayaan tercapai — satu donasi tidak cukup.",
      step7Reason.code,
      step7Reason.text,
      step7Met
        ? wealthOrGivingGoal
          ? `Goal tercapai: ${wealthOrGivingGoal.name}`
          : "Target tercapai"
        : wealthOrGivingGoal
          ? `${wealthOrGivingGoal.name}: ${money(wealthOrGivingGoal.currentAmount)} / ${money(wealthOrGivingGoal.targetAmount)}`
          : givingSpend > 0
            ? `Aktivitas berbagi ${money(givingSpend)} bulan ini — buat goal target`
            : "Buat goal berbagi/kekayaan dengan target terukur",
      "VIEW_GOALS",
      step7Met
        ? 100
        : wealthOrGivingGoal
          ? clampPct(
              ((wealthOrGivingGoal.currentAmount ?? 0) /
                Math.max(1, wealthOrGivingGoal.targetAmount)) *
                100
            )
          : 0
    ),
  ];

  return {
    currentStep: progress.activeStep,
    completedCount: progress.completedRequiredSteps,
    totalSteps: 7,
    applicableSteps: progress.applicableRequiredSteps,
    progressPercent: progress.progressPercent,
    currency,
    ruleVersion: LADDER_RULE_VERSION,
    evaluatedAt: new Date().toISOString(),
    steps,
  };
}
