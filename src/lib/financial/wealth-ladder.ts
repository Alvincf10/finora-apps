import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import { isLiabilityAccount } from "@/lib/financial/balances";
import {
  getFinancialProfile,
  getSpendingAnalytics,
} from "@/lib/financial/phase2-service";
import { getFinancialSummary } from "@/lib/financial/summary";
import { formatMoney } from "@/lib/money";
import type { Period } from "@/lib/financial/phase2-types";
import type { AccountType, Currency, DebtKind } from "@/types";

/** Fixed starter cash target (IDR — minor factor is 1). */
export const LADDER_CASH_TARGET_IDR = 10_000_000;
export const LADDER_EMERGENCY_MONTHS = 3;
export const LADDER_INVEST_RATIO = 0.2;

export type LadderStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type LadderStepStatus = "DONE" | "CURRENT" | "UPCOMING";

export type LadderActionType =
  | "VIEW_ACCOUNTS"
  | "VIEW_DEBT"
  | "VIEW_GOALS"
  | "VIEW_BUDGET_REC"
  | "VIEW_SPENDING"
  | "NONE";

export interface LadderStep {
  id: LadderStepId;
  title: string;
  description: string;
  status: LadderStepStatus;
  progress?: number;
  detail?: string;
  actionType: LadderActionType;
}

export interface WealthLadderResult {
  currentStep: LadderStepId;
  completedCount: number;
  totalSteps: 7;
  currency: Currency;
  steps: LadderStep[];
}

const LIQUID_TYPES: AccountType[] = ["CASH", "BANK", "E_WALLET"];

function nameMatches(name: string, patterns: RegExp[]) {
  const n = name.toLowerCase();
  return patterns.some((p) => p.test(n));
}

export function inferDebtKind(
  name: string,
  kind?: DebtKind | null
): DebtKind {
  if (kind === "MORTGAGE" || kind === "CONSUMER" || kind === "OTHER") {
    return kind;
  }
  if (
    nameMatches(name, [
      /\bkpr\b/,
      /mortgage/,
      /rumah/,
      /properti/,
      /home\s*loan/,
      /kredit\s*pemilikan/,
    ])
  ) {
    return "MORTGAGE";
  }
  return "CONSUMER";
}

const EMERGENCY_PATTERNS = [/emergency/, /darurat/, /efund/, /e-fund/];
const EDUCATION_PATTERNS = [
  /pendidikan/,
  /education/,
  /sekolah/,
  /kuliah/,
  /anak/,
  /campus/,
  /tuition/,
];
const INVEST_PATTERNS = [
  /invest/,
  /investasi/,
  /reksa/,
  /saham/,
  /obligasi/,
  /crypto/,
  /kripto/,
  /etf/,
  /deposito/,
];
const GIVING_PATTERNS = [
  /berbagi/,
  /sedekah/,
  /zakat/,
  /infaq/,
  /wakaf/,
  /amal/,
  /donasi/,
  /charity/,
  /tithe/,
];

function clampPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function evaluateWealthLadder(
  userId: string,
  period: Period
): Promise<WealthLadderResult> {
  const [accounts, debts, goals, summary, profile, analytics] =
    await Promise.all([
      Account.find({ userId, isActive: true }).lean(),
      Debt.find({ userId }).lean(),
      SavingsGoal.find({ userId }).lean(),
      getFinancialSummary(userId, period),
      getFinancialProfile(userId, period),
      getSpendingAnalytics(userId, period),
    ]);

  const hasIdr = accounts.some((a) => a.currency === "IDR");
  const currency: Currency = hasIdr ? "IDR" : summary.currency;
  const money = (n: number) => formatMoney(n, currency);

  const liquidCash = accounts
    .filter(
      (a) =>
        a.currency === currency &&
        LIQUID_TYPES.includes(a.type as AccountType) &&
        !isLiabilityAccount(a.type as AccountType)
    )
    .reduce((sum, a) => sum + Math.max(0, a.currentBalance ?? 0), 0);

  const step1Done =
    currency === "IDR"
      ? liquidCash >= LADDER_CASH_TARGET_IDR
      : false;
  const step1Progress =
    currency === "IDR"
      ? clampPct((liquidCash / LADDER_CASH_TARGET_IDR) * 100)
      : 0;

  const activeDebts = debts.filter(
    (d) => d.status === "ACTIVE" && d.remainingAmount > 0
  );
  const classified = activeDebts.map((d) => ({
    ...d,
    resolvedKind: inferDebtKind(d.name, (d as { kind?: DebtKind }).kind),
  }));
  const smallDebts = classified.filter((d) => d.resolvedKind !== "MORTGAGE");
  const mortgages = classified.filter((d) => d.resolvedKind === "MORTGAGE");
  const step2Done = smallDebts.length === 0;
  const smallDebtTotal = smallDebts.reduce((s, d) => s + d.remainingAmount, 0);
  const smallDebtOriginal = smallDebts.reduce(
    (s, d) => s + d.originalAmount,
    0
  );

  const essentialMonthly =
    profile.averageFixedExpense || profile.averageMonthlyExpense || 0;
  const emergencyTarget = essentialMonthly * LADDER_EMERGENCY_MONTHS;
  const emergencyGoal = goals.find((g) =>
    nameMatches(g.name, EMERGENCY_PATTERNS)
  );
  const reservedStarter =
    currency === "IDR" ? LADDER_CASH_TARGET_IDR : 0;
  const emergencyFund = emergencyGoal
    ? emergencyGoal.currentAmount ?? 0
    : Math.max(0, liquidCash - reservedStarter);
  const emergencyCoverageMonths =
    essentialMonthly > 0 ? emergencyFund / essentialMonthly : 0;
  const step3Done =
    essentialMonthly > 0
      ? emergencyCoverageMonths >= LADDER_EMERGENCY_MONTHS
      : Boolean(emergencyGoal && (emergencyGoal.currentAmount ?? 0) > 0);
  const step3Progress =
    essentialMonthly > 0
      ? clampPct((emergencyCoverageMonths / LADDER_EMERGENCY_MONTHS) * 100)
      : emergencyGoal
        ? clampPct(
            ((emergencyGoal.currentAmount ?? 0) /
              Math.max(1, emergencyGoal.targetAmount)) *
              100
          )
        : 0;

  const incomeBase =
    summary.income > 0 ? summary.income : profile.averageMonthlyIncome;
  const investAmount = analytics
    .filter((row) => nameMatches(row.categoryName, INVEST_PATTERNS))
    .reduce((s, row) => s + row.currentAmount, 0);
  const investRatio = incomeBase > 0 ? investAmount / incomeBase : 0;
  const step4Done = incomeBase > 0 && investRatio >= LADDER_INVEST_RATIO;
  const step4Progress = clampPct((investRatio / LADDER_INVEST_RATIO) * 100);

  const educationGoal = goals.find(
    (g) =>
      (g.status === "ACTIVE" || g.status === "COMPLETED") &&
      nameMatches(g.name, EDUCATION_PATTERNS)
  );
  const step5Done = Boolean(educationGoal);
  const step5Progress = educationGoal
    ? educationGoal.status === "COMPLETED"
      ? 100
      : clampPct(
          ((educationGoal.currentAmount ?? 0) /
            Math.max(1, educationGoal.targetAmount)) *
            100
        )
    : 0;

  const step6Done = mortgages.length === 0;
  const mortgageTotal = mortgages.reduce((s, d) => s + d.remainingAmount, 0);
  const mortgageOriginal = mortgages.reduce((s, d) => s + d.originalAmount, 0);

  const givingGoal = goals.find((g) => nameMatches(g.name, GIVING_PATTERNS));
  const givingSpend = analytics
    .filter((row) => nameMatches(row.categoryName, GIVING_PATTERNS))
    .reduce((s, row) => s + row.currentAmount, 0);
  const step7Done = Boolean(givingGoal) || givingSpend > 0;

  const doneFlags = [
    step1Done,
    step2Done,
    step3Done,
    step4Done,
    step5Done,
    step6Done,
    step7Done,
  ];

  const allDone = doneFlags.every(Boolean);
  let currentStep: LadderStepId = 7;
  for (let i = 0; i < doneFlags.length; i++) {
    if (!doneFlags[i]) {
      currentStep = (i + 1) as LadderStepId;
      break;
    }
  }

  function statusFor(id: LadderStepId): LadderStepStatus {
    if (doneFlags[id - 1]) return "DONE";
    if (id === currentStep) return "CURRENT";
    return "UPCOMING";
  }

  const steps: LadderStep[] = [
    {
      id: 1,
      title: "Nabung cash 10 juta",
      description: "Dana starter likuid di rekening cash/bank/e-wallet.",
      status: statusFor(1),
      progress: step1Progress,
      detail:
        currency === "IDR"
          ? `${money(liquidCash)} / ${money(LADDER_CASH_TARGET_IDR)}`
          : `Saldo likuid ${money(liquidCash)} — target tetap Rp10jt (pakai rekening IDR)`,
      actionType: "VIEW_ACCOUNTS",
    },
    {
      id: 2,
      title: "Lunasin semua hutang kecil (kecuali KPR)",
      description: "Bersihkan cicilan konsumtif sebelum bangun aset besar.",
      status: statusFor(2),
      progress: step2Done
        ? 100
        : clampPct(
            ((smallDebtOriginal - smallDebtTotal) /
              Math.max(1, smallDebtOriginal)) *
              100
          ),
      detail: step2Done
        ? "Tidak ada hutang non-KPR aktif"
        : `${smallDebts.length} hutang · sisa ${money(smallDebtTotal)}`,
      actionType: "VIEW_DEBT",
    },
    {
      id: 3,
      title: "Simpan 3–6 bulan dana darurat",
      description: `Target minimal ${LADDER_EMERGENCY_MONTHS} bulan essentials.`,
      status: statusFor(3),
      progress: step3Progress,
      detail:
        essentialMonthly > 0
          ? `Coverage ~${Math.round(emergencyCoverageMonths * 10) / 10} bln · target ${LADDER_EMERGENCY_MONTHS}+ bln (${money(emergencyTarget)})`
          : emergencyGoal
            ? `${money(emergencyGoal.currentAmount)} / ${money(emergencyGoal.targetAmount)}`
            : "Buat goal Dana Darurat dulu",
      actionType: "VIEW_GOALS",
    },
    {
      id: 4,
      title: "Investasi minimal 20% dari income",
      description: "Alokasikan rutin ke instrumen investasi.",
      status: statusFor(4),
      progress: step4Progress,
      detail:
        incomeBase > 0
          ? `${Math.round(investRatio * 100)}% dari income (${money(investAmount)} / ${money(incomeBase)})`
          : "Belum terdeteksi kategori/transaksi investasi",
      actionType: investAmount > 0 ? "VIEW_SPENDING" : "VIEW_BUDGET_REC",
    },
    {
      id: 5,
      title: "Bikin dana pendidikan anak",
      description:
        "Selalu ditampilkan — buat goal pendidikan meski masih kecil.",
      status: statusFor(5),
      progress: step5Progress,
      detail: educationGoal
        ? `${educationGoal.name}: ${money(educationGoal.currentAmount)} / ${money(educationGoal.targetAmount)}`
        : "Belum ada goal pendidikan / sekolah / anak",
      actionType: "VIEW_GOALS",
    },
    {
      id: 6,
      title: "Lunasin KPR secepat mungkin",
      description: "Percepat pelunasan hutang rumah setelah fondasi aman.",
      status: statusFor(6),
      progress: step6Done
        ? 100
        : clampPct(
            ((mortgageOriginal - mortgageTotal) /
              Math.max(1, mortgageOriginal)) *
              100
          ),
      detail: step6Done
        ? "Tidak ada KPR aktif"
        : `${mortgages.length} KPR · sisa ${money(mortgageTotal)}`,
      actionType: "VIEW_DEBT",
    },
    {
      id: 7,
      title: "Kekayaan abadi & berbagi",
      description: "Jaga aset tumbuh dan sisihkan untuk berbagi.",
      status: allDone ? "DONE" : statusFor(7),
      progress: step7Done
        ? 100
        : doneFlags.slice(0, 6).every(Boolean)
          ? 40
          : 0,
      detail: step7Done
        ? givingGoal
          ? `Goal: ${givingGoal.name}`
          : `Terdeteksi alokasi berbagi ${money(givingSpend)} bulan ini`
        : "Tambah goal/kategori sedekah, zakat, atau donasi",
      actionType: "VIEW_GOALS",
    },
  ];

  return {
    currentStep,
    completedCount: doneFlags.filter(Boolean).length,
    totalSteps: 7,
    currency,
    steps,
  };
}
