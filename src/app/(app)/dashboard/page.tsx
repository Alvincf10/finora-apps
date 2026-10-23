"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits, fromMinorUnits } from "@/lib/money";
import { applyGoalAllocation } from "@/lib/financial/survival-math";
import type { Currency } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

type DashboardData = {
  summary: {
    income: number;
    expense: number;
    netCashFlow: number;
    savings: number;
    savingsRate: number;
    totalDebt: number;
    totalAssets: number;
    netWorth: number;
    currency: Currency;
  };
  breakdown: Array<{ name: string; amount: number }>;
  budgets: Array<{
    categoryName: string;
    utilizationPercentage: number;
    overBudget: boolean;
    budgetAmount: number;
    actualAmount: number;
  }>;
  cashFlow: Array<{ label: string; income: number; expense: number }>;
  recommendations: Array<{
    type: string;
    severity: string;
    title: string;
    message: string;
  }>;
  recentTransactions: Array<{
    _id: string;
    type: string;
    amount: number;
    currency: Currency;
    description?: string;
    date: string;
    categoryId?: { name?: string };
    accountId?: { name?: string };
  }>;
  debts: Array<{ name: string; remainingAmount: number; currency: Currency }>;
  debtsDueThisMonth: {
    totalDue: number;
    totalPaid: number;
    totalRemaining: number;
    currency: Currency;
    items: Array<{
      debtId: string;
      name: string;
      currency: Currency;
      dueAmount: number;
      paidAmount: number;
      remainingDue: number;
      remainingAmount?: number;
      dueDate?: string;
      monthlyPayment: number | null;
      installmentMonths?: number | null;
      isInstallment?: boolean;
    }>;
    byCurrency: Array<{
      currency: Currency;
      totalDue: number;
      totalPaid: number;
      totalRemaining: number;
    }>;
  };
  payCycleBuffer: {
    cycle: { label: string; paydayDay: number };
    currency: Currency;
    monthlySalary: number;
    startingBalance: number;
    otherIncome: number;
    expenses: number;
    debtDue: number;
    debtPaid: number;
    debtRemaining: number;
    debtItems: Array<{
      debtId: string;
      name: string;
      currency: Currency;
      dueAmount: number;
      paidAmount: number;
      remainingDue: number;
      remainingAmount?: number;
      dueDate?: string;
      monthlyPayment?: number | null;
      installmentMonths?: number | null;
      isInstallment?: boolean;
    }>;
    fixedCostTotal: number;
    fixedCostItems: Array<{
      fixedCostId: string;
      name: string;
      amount: number;
      currency: Currency;
      dueDay: number;
      dueDate: string;
    }>;
    buffer: number;
    configured: boolean;
  };
  survival: {
    paydayDay: number;
    nextPayday: string;
    daysLeft: number;
    cashOnHand: number;
    fixedCostsBeforePayday: number;
    spendableCash: number;
    spentToday: number;
    currency: Currency;
    dailyBudget: number;
    safeReserveDays: number;
    maxSafeGoalContribution: number;
    status: "ACTIVE" | "PAYDAY" | "NO_CASH";
  };
  goals: Array<{
    name: string;
    currentAmount: number;
    targetAmount: number;
    currency: Currency;
  }>;
  goalsSaved: number;
  goalsTarget: number;
};

function Kpi({
  label,
  value,
  hint,
  valueClassName,
  hintClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
  hintClassName?: string;
}) {
  return (
    <Card className="border-emerald-900/5 bg-card/80">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={`font-mono text-2xl tracking-tight ${valueClassName ?? ""}`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className={`text-xs ${hintClassName ?? "text-muted-foreground"}`}>
            {hint}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function SurvivalCard({
  survival,
}: {
  survival: DashboardData["survival"];
}) {
  const { t, intlLocale } = useI18n();
  const [goalMajor, setGoalMajor] = useState(0);
  const c = survival.currency;
  const money = (amount: number) => formatMoney(amount, c, intlLocale);
  const goalMinor = toMinorUnits(goalMajor, c);
  const spendable = survival.spendableCash ?? survival.cashOnHand;
  const sim = applyGoalAllocation(
    spendable,
    survival.daysLeft,
    goalMinor,
    survival.maxSafeGoalContribution
  );

  const nextPaydayDate = new Date(survival.nextPayday);
  const paydayLabel = nextPaydayDate.toLocaleDateString(intlLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Actual receipt day (weekend-adjusted), not the nominal paydayDay setting.
  const paydayDayShown = nextPaydayDate.getDate();

  let advice: string;
  if (survival.status === "PAYDAY") {
    advice = t("dashboard.advicePayday");
  } else if (survival.status === "NO_CASH") {
    advice = t("dashboard.adviceNoCash");
  } else if (goalMinor <= 0) {
    advice = t("dashboard.adviceDailyBudget", {
      payday: paydayLabel,
      daily: money(survival.dailyBudget),
      maxGoal: money(survival.maxSafeGoalContribution),
      safeDays: survival.safeReserveDays,
    });
  } else if (!sim.withinSafeLimit) {
    advice = t("dashboard.adviceOverSafe", {
      daily: money(sim.dailyBudget),
    });
  } else if (sim.goalAllocation > 0) {
    advice = t("dashboard.adviceSafeWithGoal", {
      goal: money(sim.goalAllocation),
      living: money(sim.livingCash),
      daily: money(sim.dailyBudget),
    });
  } else {
    advice = t("dashboard.adviceDailyOnly", {
      daily: money(survival.dailyBudget),
    });
  }

  const cashLineParts = [
    t("dashboard.cashOnHandLine", { amount: money(survival.cashOnHand) }),
  ];
  if ((survival.fixedCostsBeforePayday ?? 0) > 0) {
    cashLineParts.push(
      t("dashboard.fixedCostReserve", {
        amount: money(survival.fixedCostsBeforePayday),
      })
    );
  }
  cashLineParts.push(
    t("dashboard.spendableCash", { amount: money(spendable) })
  );
  if (survival.spentToday > 0) {
    cashLineParts.push(
      t("dashboard.spentTodayLine", { amount: money(survival.spentToday) })
    );
  }

  return (
    <Card className="border-amber-800/20 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader>
        <CardDescription>
          {t("dashboard.survivalUntilPayday", {
            day: paydayDayShown,
            label: paydayLabel,
          })}
        </CardDescription>
        <CardTitle className="font-mono text-3xl tracking-tight text-amber-900 dark:text-amber-300">
          {survival.status === "PAYDAY"
            ? t("dashboard.paydayToday")
            : t("dashboard.daysUntilPayday", { days: survival.daysLeft })}
        </CardTitle>
        <CardDescription>{cashLineParts.join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">
              {t("dashboard.dailyBudget")}
            </p>
            <p className="font-mono text-xl text-amber-900 dark:text-amber-300">
              {money(sim.dailyBudget)}
            </p>
            {goalMinor > 0 && sim.dailyBudget !== survival.dailyBudget ? (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.wasPerDay", {
                  amount: money(survival.dailyBudget),
                })}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">
              {t("dashboard.maxSafeToGoals")}
            </p>
            <p className="font-mono text-xl text-sky-800 dark:text-sky-300">
              {money(survival.maxSafeGoalContribution)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.keepRunwayDays", {
                days: survival.safeReserveDays,
              })}
            </p>
          </div>
        </div>

        {survival.status === "ACTIVE" ? (
          <div className="space-y-2">
            <Label className="text-xs">
              {t("dashboard.simulateGoalAllocation")}
            </Label>
            <CurrencyAmountInput
              currency={c}
              value={goalMajor}
              onValueChange={setGoalMajor}
              allowEmpty
              placeholder="0"
            />
            <div className="flex flex-wrap gap-2">
              {survival.maxSafeGoalContribution > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setGoalMajor(
                      fromMinorUnits(survival.maxSafeGoalContribution, c)
                    )
                  }
                >
                  {t("dashboard.useMaxSafe")}
                </Button>
              ) : null}
              {goalMajor > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGoalMajor(0)}
                >
                  {t("dashboard.reset")}
                </Button>
              ) : null}
              <Link
                href="/goals"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("dashboard.openGoals")}
              </Link>
            </div>
          </div>
        ) : null}

        <p
          className={`text-sm ${
            !sim.withinSafeLimit && goalMinor > 0
              ? "text-rose-700 dark:text-rose-400"
              : "text-muted-foreground"
          }`}
        >
          {advice}
        </p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t, intlLocale } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [phase2, setPhase2] = useState<{
    insightsCount: number;
    trends: Array<{ categoryName: string; percentageChange: number; trend: string }>;
    forecastSavings: number | null;
    currency: Currency;
  } | null>(null);

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((error) => toast.error(error.message));

    Promise.all([
      api<{ insights: Array<{ title: string }> }>("/api/insights"),
      api<{
        spending: Array<{
          categoryName: string;
          percentageChange: number;
          trend: string;
        }>;
        profile: { currency: Currency };
      }>("/api/analytics"),
      api<{ projectedSavings: number; currency: Currency }>("/api/forecast"),
    ])
      .then(([insights, analytics, forecast]) => {
        setPhase2({
          insightsCount: insights.insights.length,
          trends: analytics.spending
            .filter((s) => s.trend === "INCREASING" || s.trend === "DECREASING")
            .slice(0, 3),
          forecastSavings: forecast.projectedSavings,
          currency: forecast.currency ?? analytics.profile.currency,
        });
      })
      .catch(() => {
        /* phase 2 widgets are optional on dashboard */
      });
  }, []);

  async function explainWithAI() {
    setLoadingAi(true);
    try {
      const result = await api<{ explanation: string; disclaimer: string }>(
        "/api/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            question: "Explain my current month financial health briefly.",
          }),
        }
      );
      setAiText(`${result.explanation}\n\n${result.disclaimer}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("dashboard.aiUnavailable")
      );
    } finally {
      setLoadingAi(false);
    }
  }

  if (!data) {
    return <p className="text-muted-foreground">{t("dashboard.loading")}</p>;
  }

  const c = data.summary.currency;
  const money = (amount: number, currency: Currency = c) =>
    formatMoney(amount, currency, intlLocale);
  const cycle = data.payCycleBuffer;
  const debtItems = cycle?.debtItems?.length
    ? cycle.debtItems
    : data.debtsDueThisMonth?.items ?? [];
  const debtRemaining = cycle?.debtRemaining ?? data.debtsDueThisMonth?.totalRemaining ?? 0;
  const debtDue = cycle?.debtDue ?? data.debtsDueThisMonth?.totalDue ?? 0;
  const debtPaid = cycle?.debtPaid ?? data.debtsDueThisMonth?.totalPaid ?? 0;
  const debtCurrency = cycle?.currency ?? data.debtsDueThisMonth?.currency ?? c;
  const goalsSaved = data.goalsSaved ?? 0;
  const goalsTarget = data.goalsTarget ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("dashboard.title")}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {t("dashboard.subtitle", {
            label: cycle?.cycle.label ?? t("dashboard.subtitleFallback"),
          })}
        </p>
      </div>

      {data.survival ? <SurvivalCard survival={data.survival} /> : null}

      {cycle ? (
        <Card className="border-emerald-800/15 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardHeader>
            <CardDescription>
              {t("dashboard.salaryCycle", {
                day: cycle.cycle.paydayDay,
                label: cycle.cycle.label,
              })}
            </CardDescription>
            <CardTitle
              className={`font-mono text-3xl tracking-tight ${
                cycle.buffer >= 0
                  ? "text-emerald-800 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {cycle.configured
                ? money(cycle.buffer, cycle.currency)
                : t("dashboard.setSalary")}
            </CardTitle>
            <CardDescription>
              {cycle.configured
                ? t("dashboard.bufferConfigured")
                : t("dashboard.bufferUnconfigured")}
            </CardDescription>
          </CardHeader>
          {cycle.configured ? (
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("dashboard.autoSalary")}
                </span>
                <span className="font-mono text-emerald-800 dark:text-emerald-300">
                  +{money(cycle.monthlySalary, cycle.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("dashboard.startingBalance")}
                </span>
                <span className="font-mono">
                  +{money(cycle.startingBalance, cycle.currency)}
                </span>
              </div>
              {cycle.otherIncome > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("dashboard.otherIncome")}
                  </span>
                  <span className="font-mono text-emerald-800 dark:text-emerald-300">
                    +{money(cycle.otherIncome, cycle.currency)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("dashboard.cycleExpenses")}
                </span>
                <span className="font-mono text-rose-700 dark:text-rose-400">
                  −{money(cycle.expenses, cycle.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("dashboard.debtRemaining")}
                </span>
                <span className="font-mono text-amber-700 dark:text-amber-400">
                  −{money(cycle.debtRemaining, cycle.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("dashboard.fixedCostsCycle")}
                </span>
                <span className="font-mono text-violet-700 dark:text-violet-400">
                  −{money(cycle.fixedCostTotal ?? 0, cycle.currency)}
                </span>
              </div>
              {(cycle.fixedCostItems?.length ?? 0) > 0 ? (
                <div className="space-y-1 rounded-md border border-violet-200/60 bg-background/50 p-2 text-xs dark:border-violet-900/50">
                  {cycle.fixedCostItems.map((f) => (
                    <div key={f.fixedCostId} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        {f.name} · {t("dashboard.dueDay", { day: f.dueDay })}
                      </span>
                      <span className="font-mono">
                        {money(f.amount, f.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>{t("dashboard.remainingBuffer")}</span>
                <span
                  className={`font-mono ${
                    cycle.buffer >= 0
                      ? "text-emerald-800 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {money(cycle.buffer, cycle.currency)}
                </span>
              </div>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label={t("dashboard.cashInAccounts")}
          value={money(data.summary.totalAssets)}
          valueClassName="text-emerald-800 dark:text-emerald-300"
          hint={t("dashboard.cashInAccountsHint")}
        />
        <Kpi
          label={t("dashboard.goalsSavings")}
          value={money(goalsSaved)}
          valueClassName="text-sky-800 dark:text-sky-300"
          hint={
            goalsTarget > 0
              ? t("dashboard.ofTarget", { amount: money(goalsTarget) })
              : t("dashboard.noActiveGoalHint")
          }
        />
        <Kpi
          label={t("dashboard.monthlyIncome")}
          value={money(data.summary.income)}
        />
        <Kpi
          label={t("dashboard.monthlyExpenses")}
          value={money(data.summary.expense)}
        />
        <Kpi
          label={t("dashboard.netCashFlow")}
          value={money(data.summary.netCashFlow)}
          hint={t("dashboard.savingsRate", {
            pct: data.summary.savingsRate,
          })}
        />
        <Kpi
          label={t("dashboard.totalDebt")}
          value={money(data.summary.totalDebt)}
          valueClassName="text-rose-700 dark:text-rose-400"
        />
        <Kpi
          label={t("dashboard.debtDueThisCycle")}
          value={money(debtRemaining, debtCurrency)}
          valueClassName="text-amber-700 dark:text-amber-400"
          hintClassName="text-amber-700/70 dark:text-amber-400/70"
          hint={t("dashboard.debtDueHint", {
            due: money(debtDue, debtCurrency),
            paid: money(debtPaid, debtCurrency),
          })}
        />
        <Kpi
          label={t("dashboard.netWorth")}
          value={money(data.summary.netWorth)}
        />
      </div>

      {debtItems.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{t("dashboard.installmentsThisCycle")}</CardTitle>
              <CardDescription>
                {cycle
                  ? t("dashboard.installmentsCycleDesc", {
                      label: cycle.cycle.label,
                    })
                  : t("dashboard.installmentsFallbackDesc")}
              </CardDescription>
            </div>
            <Link
              href="/debts"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("dashboard.manageTenor")}
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {debtItems.map((d) => {
              const isCicilan = Boolean(d.isInstallment || d.monthlyPayment);
              const months = d.installmentMonths;
              const dueLong = d.dueDate
                ? new Date(d.dueDate).toLocaleDateString(intlLocale)
                : "";
              const dueShort = d.dueDate
                ? new Date(d.dueDate).toLocaleDateString(intlLocale, {
                    day: "numeric",
                    month: "short",
                  })
                : "";
              return (
                <div
                  key={d.debtId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-rose-700 dark:text-rose-400">
                      {d.name}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {isCicilan
                        ? months
                          ? t("dashboard.installmentMonthsLabel", {
                              months,
                            })
                          : t("dashboard.monthlyInstallmentLabel")
                        : d.dueDate
                          ? t("dashboard.dueOnDate", { date: dueLong })
                          : t("dashboard.fullBill")}
                      {d.dueDate && isCicilan
                        ? ` · ${t("dashboard.dueShort", { date: dueShort })}`
                        : null}
                      {d.paidAmount > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {t("dashboard.alreadyPaid", {
                            amount: money(d.paidAmount, d.currency),
                          })}
                        </span>
                      ) : null}
                    </p>
                    {isCicilan && d.remainingAmount != null ? (
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.remainingPrincipal", {
                          amount: money(d.remainingAmount, d.currency),
                        })}
                      </p>
                    ) : !isCicilan ? (
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.noTenorYet")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {isCicilan
                        ? t("dashboard.payThisMonthLabel")
                        : t("dashboard.billLabel")}
                    </p>
                    <p className="font-mono text-rose-700 dark:text-rose-400">
                      {money(d.remainingDue, d.currency)}
                    </p>
                    {d.paidAmount > 0 ? (
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                        {t("dashboard.ofAmount", {
                          amount: money(d.dueAmount, d.currency),
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between border-t pt-3 text-sm font-medium">
              <span>{t("dashboard.totalPayThisMonth")}</span>
              <span className="font-mono text-rose-700 dark:text-rose-400">
                {money(debtRemaining, debtCurrency)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase2 ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>{t("dashboard.financialInsights")}</CardDescription>
              <CardTitle>
                {t("dashboard.recommendations", {
                  count: phase2.insightsCount,
                })}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("dashboard.spendingTrends")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {phase2.trends.length === 0 ? (
                <p className="text-muted-foreground">
                  {t("dashboard.notEnoughHistory")}
                </p>
              ) : (
                phase2.trends.map((trend) => (
                  <p key={trend.categoryName}>
                    {trend.categoryName}{" "}
                    {trend.trend === "INCREASING" ? "↑" : "↓"}{" "}
                    {Math.abs(trend.percentageChange)}%
                  </p>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("dashboard.budgetForecast")}</CardDescription>
              <CardTitle className="font-mono text-xl">
                {phase2.forecastSavings == null
                  ? "—"
                  : money(phase2.forecastSavings, phase2.currency)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/forecast"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "touch-manipulation"
                )}
              >
                {t("dashboard.openForecast")}
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.cashFlow")}</CardTitle>
            <CardDescription>{t("dashboard.cashFlowDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cashFlow}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="income" fill="#059669" radius={4} />
                <Bar dataKey="expense" fill="#64748b" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.expenseBreakdown")}</CardTitle>
            <CardDescription>
              {t("dashboard.expenseBreakdownDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.breakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noExpensesYet")}
              </p>
            ) : (
              data.breakdown.slice(0, 6).map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{row.name}</span>
                  <span className="font-mono">{money(row.amount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.budgetOverview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noBudgetsThisMonth")}
              </p>
            ) : (
              data.budgets.map((b) => (
                <div key={b.categoryName} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{b.categoryName}</span>
                    <span className="font-mono text-muted-foreground">
                      {b.utilizationPercentage}%
                    </span>
                  </div>
                  <Progress value={Math.min(b.utilizationPercentage, 100)} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{t("dashboard.insights")}</CardTitle>
              <CardDescription>{t("dashboard.insightsDesc")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={explainWithAI}
              disabled={loadingAi}
            >
              {loadingAi ? t("dashboard.askingAi") : t("dashboard.askAi")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noWarnings")}
              </p>
            ) : (
              data.recommendations.map((r, idx) => (
                <div key={`${r.type}-${idx}`} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      variant={
                        r.severity === "CRITICAL" ? "destructive" : "secondary"
                      }
                    >
                      {r.severity}
                    </Badge>
                    <p className="text-sm font-medium">{r.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.message}</p>
                </div>
              ))
            )}
            {aiText ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                {aiText}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.recentTransactions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentTransactions.map((tx) => (
              <div
                key={tx._id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {tx.description || tx.categoryId?.name || tx.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.accountId?.name} ·{" "}
                    {new Date(tx.date).toLocaleDateString(intlLocale)}
                  </p>
                </div>
                <span className="font-mono">
                  {tx.type === "EXPENSE" || tx.type === "TRANSFER" ? "-" : "+"}
                  {money(tx.amount, tx.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.debts")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.debts.length === 0 ? (
                <p className="text-muted-foreground">
                  {t("dashboard.noActiveDebts")}
                </p>
              ) : (
                data.debts.map((d) => (
                  <div key={d.name} className="flex justify-between">
                    <span>{d.name}</span>
                    <span className="font-mono">
                      {money(d.remainingAmount, d.currency)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.goals")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.goals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.noActiveGoals")}
                </p>
              ) : (
                data.goals.map((g) => (
                  <div key={g.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{g.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {Math.round((g.currentAmount / g.targetAmount) * 100)}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        (g.currentAmount / g.targetAmount) * 100,
                        100
                      )}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
