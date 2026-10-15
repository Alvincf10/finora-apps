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
      dueDate?: string;
      monthlyPayment: number | null;
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
      dueDate?: string;
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
  const [goalMajor, setGoalMajor] = useState(0);
  const c = survival.currency;
  const goalMinor = toMinorUnits(goalMajor, c);
  const spendable = survival.spendableCash ?? survival.cashOnHand;
  const sim = applyGoalAllocation(
    spendable,
    survival.daysLeft,
    goalMinor,
    survival.maxSafeGoalContribution
  );

  const paydayLabel = new Date(survival.nextPayday).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let advice: string;
  if (survival.status === "PAYDAY") {
    advice = "Hari gajian. Mode bertahan selesai — cek buffer cycle di bawah.";
  } else if (survival.status === "NO_CASH") {
    advice = "Saldo rekening kosong. Tahan belanja sampai gaji masuk.";
  } else if (goalMinor <= 0) {
    advice = `Agar cukup sampai ${paydayLabel}, belanja max ${formatMoney(survival.dailyBudget, c)}/hari. Boleh sisihkan ke goals sampai ${formatMoney(survival.maxSafeGoalContribution, c)} tanpa mengorbankan ${survival.safeReserveDays} hari aman.`;
  } else if (!sim.withinSafeLimit) {
    advice = `Alokasi goals di atas batas aman. Budget harian jadi ${formatMoney(sim.dailyBudget, c)} — survival bisa kepotong sebelum gajian.`;
  } else if (sim.goalAllocation > 0) {
    advice = `Aman. Setelah sisihkan ${formatMoney(sim.goalAllocation, c)} ke goals, sisa hidup ${formatMoney(sim.livingCash, c)} ≈ ${formatMoney(sim.dailyBudget, c)}/hari.`;
  } else {
    advice = `Belanja max ${formatMoney(survival.dailyBudget, c)}/hari sampai gaji.`;
  }

  return (
    <Card className="border-amber-800/20 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader>
        <CardDescription>
          Bertahan sampai gaji · tgl {survival.paydayDay} · {paydayLabel}
        </CardDescription>
        <CardTitle className="font-mono text-3xl tracking-tight text-amber-900 dark:text-amber-300">
          {survival.status === "PAYDAY"
            ? "Hari gajian"
            : `${survival.daysLeft} hari lagi`}
        </CardTitle>
        <CardDescription>
          Rekening {formatMoney(survival.cashOnHand, c)}
          {(survival.fixedCostsBeforePayday ?? 0) > 0
            ? ` · cadangan fixed cost ${formatMoney(survival.fixedCostsBeforePayday, c)}`
            : ""}
          {" · "}
          bisa dipakai {formatMoney(spendable, c)}
          {survival.spentToday > 0
            ? ` · belanja hari ini ${formatMoney(survival.spentToday, c)}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Budget harian</p>
            <p className="font-mono text-xl text-amber-900 dark:text-amber-300">
              {formatMoney(sim.dailyBudget, c)}
            </p>
            {goalMinor > 0 && sim.dailyBudget !== survival.dailyBudget ? (
              <p className="text-xs text-muted-foreground">
                semula {formatMoney(survival.dailyBudget, c)}/hari
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">
              Max aman ke goals
            </p>
            <p className="font-mono text-xl text-sky-800 dark:text-sky-300">
              {formatMoney(survival.maxSafeGoalContribution, c)}
            </p>
            <p className="text-xs text-muted-foreground">
              jaga {survival.safeReserveDays} hari runway
            </p>
          </div>
        </div>

        {survival.status === "ACTIVE" ? (
          <div className="space-y-2">
            <Label className="text-xs">
              Simulasi: sisihkan ke goals dulu (opsional)
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
                  Pakai max aman
                </Button>
              ) : null}
              {goalMajor > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGoalMajor(0)}
                >
                  Reset
                </Button>
              ) : null}
              <Link
                href="/goals"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Buka Goals
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
      api<Array<{ title: string }>>("/api/insights"),
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
          insightsCount: insights.length,
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
      toast.error(error instanceof Error ? error.message : "AI unavailable");
    } finally {
      setLoadingAi(false);
    }
  }

  if (!data) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  const c = data.summary.currency;
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
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Cycle gaji {cycle?.cycle.label ?? "berikutnya"}, dihitung otomatis.
        </p>
      </div>

      {data.survival ? <SurvivalCard survival={data.survival} /> : null}

      {cycle ? (
        <Card className="border-emerald-800/15 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardHeader>
            <CardDescription>
              Cycle gaji tgl {cycle.cycle.paydayDay} · {cycle.cycle.label}
            </CardDescription>
            <CardTitle
              className={`font-mono text-3xl tracking-tight ${
                cycle.buffer >= 0
                  ? "text-emerald-800 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {cycle.configured
                ? formatMoney(cycle.buffer, cycle.currency)
                : "Set salary in Settings"}
            </CardTitle>
            <CardDescription>
              {cycle.configured
                ? "Sisa setelah gaji, saldo, pengeluaran, utang, dan fixed cost cycle ini"
                : "Isi gaji bulanan di Settings — dihitung otomatis tiap cycle, tanpa input ulang"}
            </CardDescription>
          </CardHeader>
          {cycle.configured ? (
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gaji (otomatis)</span>
                <span className="font-mono text-emerald-800 dark:text-emerald-300">
                  +{formatMoney(cycle.monthlySalary, cycle.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo awal cycle</span>
                <span className="font-mono">
                  +{formatMoney(cycle.startingBalance, cycle.currency)}
                </span>
              </div>
              {cycle.otherIncome > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pemasukan lain</span>
                  <span className="font-mono text-emerald-800 dark:text-emerald-300">
                    +{formatMoney(cycle.otherIncome, cycle.currency)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pengeluaran cycle</span>
                <span className="font-mono text-rose-700 dark:text-rose-400">
                  −{formatMoney(cycle.expenses, cycle.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sisa utang due</span>
                <span className="font-mono text-amber-700 dark:text-amber-400">
                  −{formatMoney(cycle.debtRemaining, cycle.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fixed costs cycle</span>
                <span className="font-mono text-violet-700 dark:text-violet-400">
                  −{formatMoney(cycle.fixedCostTotal ?? 0, cycle.currency)}
                </span>
              </div>
              {(cycle.fixedCostItems?.length ?? 0) > 0 ? (
                <div className="space-y-1 rounded-md border border-violet-200/60 bg-background/50 p-2 text-xs dark:border-violet-900/50">
                  {cycle.fixedCostItems.map((f) => (
                    <div key={f.fixedCostId} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        {f.name} · tgl {f.dueDay}
                      </span>
                      <span className="font-mono">
                        {formatMoney(f.amount, f.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Sisa buffer</span>
                <span
                  className={`font-mono ${
                    cycle.buffer >= 0
                      ? "text-emerald-800 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {formatMoney(cycle.buffer, cycle.currency)}
                </span>
              </div>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Uang di rekening"
          value={formatMoney(data.summary.totalAssets, c)}
          valueClassName="text-emerald-800 dark:text-emerald-300"
          hint="Saldo akun — yang boleh dipakai / belanja"
        />
        <Kpi
          label="Tabungan goals"
          value={formatMoney(goalsSaved, c)}
          valueClassName="text-sky-800 dark:text-sky-300"
          hint={
            goalsTarget > 0
              ? `Dari target ${formatMoney(goalsTarget, c)}`
              : "Belum ada goal aktif"
          }
        />
        <Kpi
          label="Monthly income"
          value={formatMoney(data.summary.income, c)}
        />
        <Kpi
          label="Monthly expenses"
          value={formatMoney(data.summary.expense, c)}
        />
        <Kpi
          label="Net cash flow"
          value={formatMoney(data.summary.netCashFlow, c)}
          hint={`Savings rate ${data.summary.savingsRate}%`}
        />
        <Kpi
          label="Total debt"
          value={formatMoney(data.summary.totalDebt, c)}
          valueClassName="text-rose-700 dark:text-rose-400"
        />
        <Kpi
          label="Debt due this cycle"
          value={formatMoney(debtRemaining, debtCurrency)}
          valueClassName="text-amber-700 dark:text-amber-400"
          hintClassName="text-amber-700/70 dark:text-amber-400/70"
          hint={`Of ${formatMoney(debtDue, debtCurrency)} due · ${formatMoney(debtPaid, debtCurrency)} paid`}
        />
        <Kpi label="Net worth" value={formatMoney(data.summary.netWorth, c)} />
      </div>

      {debtItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Debt payments this pay cycle</CardTitle>
            <CardDescription>
              {cycle
                ? `${cycle.cycle.label} · installments still left to pay`
                : "Installments and due balances still left to pay."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {debtItems.map((d) => (
              <div
                key={d.debtId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium text-rose-700 dark:text-rose-400">
                    {d.name}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {d.dueDate
                      ? `Due ${new Date(d.dueDate).toLocaleDateString()}`
                      : "Monthly installment"}
                    {d.paidAmount > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {` · paid ${formatMoney(d.paidAmount, d.currency)}`}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-rose-700 dark:text-rose-400">
                    {formatMoney(d.remainingDue, d.currency)}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                    of {formatMoney(d.dueAmount, d.currency)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {phase2 ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Financial insights</CardDescription>
              <CardTitle>{phase2.insightsCount} recommendations</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Spending trends</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {phase2.trends.length === 0 ? (
                <p className="text-muted-foreground">Not enough history yet.</p>
              ) : (
                phase2.trends.map((t) => (
                  <p key={t.categoryName}>
                    {t.categoryName}{" "}
                    {t.trend === "INCREASING" ? "↑" : "↓"} {Math.abs(t.percentageChange)}%
                  </p>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Budget forecast (projected savings)</CardDescription>
              <CardTitle className="font-mono text-xl">
                {phase2.forecastSavings == null
                  ? "—"
                  : formatMoney(phase2.forecastSavings, phase2.currency)}
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
                Open forecast
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
            <CardDescription>Income vs expense (last 6 months)</CardDescription>
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
            <CardTitle>Expense breakdown</CardTitle>
            <CardDescription>Where money went this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.breakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses yet.</p>
            ) : (
              data.breakdown.slice(0, 6).map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{row.name}</span>
                  <span className="font-mono">{formatMoney(row.amount, c)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budget overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No budgets set for this month.
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
              <CardTitle>Insights</CardTitle>
              <CardDescription>Deterministic recommendations</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={explainWithAI} disabled={loadingAi}>
              {loadingAi ? "Explaining..." : "AI explain"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No warnings right now.
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
            <CardTitle>Recent transactions</CardTitle>
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
                    {tx.accountId?.name} · {new Date(tx.date).toLocaleDateString()}
                  </p>
                </div>
                <span className="font-mono">
                  {tx.type === "EXPENSE" || tx.type === "TRANSFER" ? "-" : "+"}
                  {formatMoney(tx.amount, tx.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Debts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.debts.length === 0 ? (
                <p className="text-muted-foreground">No active debts.</p>
              ) : (
                data.debts.map((d) => (
                  <div key={d.name} className="flex justify-between">
                    <span>{d.name}</span>
                    <span className="font-mono">
                      {formatMoney(d.remainingAmount, d.currency)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.goals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active goals.</p>
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
