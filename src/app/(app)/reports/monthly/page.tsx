"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  PiggyBank,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Review = {
  label: string;
  cycleLabel?: string;
  period?: { year: number; month: number };
  income: number;
  expenses: number;
  savings: number;
  debtPayment: number;
  netCashFlow: number;
  currency: Currency;
  topCategories: Array<{ categoryName: string; currentAmount: number }>;
  biggestChanges: Array<{
    categoryName: string;
    percentageChange: number;
    trend: string;
  }>;
  budgetPerformance: { within: number; over: number };
  comparison: {
    incomeChange: number;
    expenseChange: number;
    savingsChange: number;
    debtChange: number;
  };
  goals: Array<{
    name: string;
    currentAmount: number;
    targetAmount: number;
    currency: Currency;
  }>;
};

const metricMeta = [
  {
    key: "income" as const,
    labelKey: "reports.monthlyIncome",
    changeKey: "incomeChange" as const,
    icon: ArrowDownLeft,
    tone: "income",
  },
  {
    key: "expenses" as const,
    labelKey: "reports.monthlyExpenses",
    changeKey: "expenseChange" as const,
    icon: ArrowUpRight,
    tone: "expense",
  },
  {
    key: "savings" as const,
    labelKey: "reports.monthlySavings",
    changeKey: "savingsChange" as const,
    icon: PiggyBank,
    tone: "savings",
  },
  {
    key: "debtPayment" as const,
    labelKey: "reports.monthlyDebt",
    changeKey: "debtChange" as const,
    icon: Landmark,
    tone: "debt",
  },
  {
    key: "netCashFlow" as const,
    labelKey: "reports.monthlyNet",
    changeKey: null,
    icon: Scale,
    tone: "net",
  },
] as const;

function toneClasses(tone: (typeof metricMeta)[number]["tone"], value: number) {
  if (tone === "income") {
    return {
      card: "ring-emerald-500/25 dark:ring-emerald-400/30",
      icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      value: "text-emerald-800 dark:text-emerald-300",
    };
  }
  if (tone === "expense") {
    return {
      card: "ring-rose-500/20 dark:ring-rose-400/25",
      icon: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      value: "text-rose-800 dark:text-rose-300",
    };
  }
  if (tone === "savings") {
    const negative = value < 0;
    return {
      card: negative
        ? "ring-amber-500/25 dark:ring-amber-400/30"
        : "ring-emerald-500/20 dark:ring-emerald-400/25",
      icon: negative
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      value: negative
        ? "text-amber-800 dark:text-amber-300"
        : "text-emerald-800 dark:text-emerald-300",
    };
  }
  if (tone === "debt") {
    return {
      card: "ring-sky-500/20 dark:ring-sky-400/25",
      icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      value: "text-sky-900 dark:text-sky-300",
    };
  }
  const negative = value < 0;
  return {
    card: negative
      ? "ring-rose-500/20 dark:ring-rose-400/25"
      : "ring-border/80",
    icon: negative
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : "bg-muted text-foreground",
    value: negative
      ? "text-rose-800 dark:text-rose-300"
      : "text-foreground",
  };
}

export default function MonthlyReviewPage() {
  const { t, intlLocale } = useI18n();
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<Review | null>(null);

  useEffect(() => {
    const qs =
      year != null && month != null ? `?year=${year}&month=${month}` : "";
    api<Review>(`/api/reports/monthly${qs}`)
      .then((review) => {
        setData(review);
        if (year == null && review.period) {
          setYear(review.period.year);
          setMonth(review.period.month);
        }
      })
      .catch((e) => toast.error(e.message));
  }, [year, month]);

  const cycleLabel = data?.cycleLabel ?? data?.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {t("reports.monthlyTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {t("reports.monthlySubtitle")}
          </p>
          {cycleLabel ? (
            <p className="mt-1 text-sm font-medium text-foreground">
              {t("reports.cycleLabel", { label: cycleLabel })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-xs text-muted-foreground">
            {t("reports.paydayMonthHint")}
          </p>
          <div className="flex items-center gap-2 rounded-2xl bg-card/80 p-1.5 ring-1 ring-border/70">
            <label className="sr-only" htmlFor="monthly-month">
              {t("common.month")}
            </label>
            <Input
              id="monthly-month"
              type="number"
              className="h-11 w-[4.5rem] border-0 bg-transparent text-center font-mono text-base shadow-none focus-visible:ring-1"
              value={month ?? ""}
              min={1}
              max={12}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
            <span className="text-muted-foreground">/</span>
            <label className="sr-only" htmlFor="monthly-year">
              {t("common.year")}
            </label>
            <Input
              id="monthly-year"
              type="number"
              className="h-11 w-[5.5rem] border-0 bg-transparent text-center font-mono text-base shadow-none focus-visible:ring-1"
              value={year ?? ""}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {!data ? (
        <p className="text-muted-foreground">{t("reports.monthlyLoading")}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {metricMeta.map((metric) => {
              const value = data[metric.key];
              const change =
                metric.changeKey != null
                  ? data.comparison[metric.changeKey]
                  : null;
              const Icon = metric.icon;
              const tones = toneClasses(metric.tone, value);
              return (
                <Card
                  key={metric.key}
                  className={cn(
                    "bg-card/90 shadow-none ring-1",
                    tones.card
                  )}
                >
                  <CardHeader className="gap-3 pb-1">
                    <div className="flex items-start justify-between gap-3">
                      <CardDescription className="text-xs font-medium uppercase tracking-wide">
                        {t(metric.labelKey)}
                      </CardDescription>
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-xl",
                          tones.icon
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                    </div>
                    <CardTitle
                      className={cn(
                        "font-mono text-xl font-semibold tracking-tight sm:text-lg",
                        tones.value
                      )}
                    >
                      {formatMoney(value, data.currency, intlLocale)}
                    </CardTitle>
                    {typeof change === "number" ? (
                      <p
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          change > 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : change < 0
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-muted-foreground"
                        )}
                      >
                        {change > 0 ? (
                          <TrendingUp className="size-3.5" />
                        ) : change < 0 ? (
                          <TrendingDown className="size-3.5" />
                        ) : null}
                        {t("reports.vsPrevious", {
                          change: `${change > 0 ? "+" : ""}${change}`,
                        })}
                      </p>
                    ) : null}
                  </CardHeader>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-card/90 ring-1 ring-border/70">
              <CardHeader>
                <CardTitle>{t("reports.topCategories")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {data.topCategories.map((c) => (
                  <div
                    key={c.categoryName}
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
                  >
                    <span className="min-w-0 truncate">{c.categoryName}</span>
                    <span className="shrink-0 font-mono text-rose-800 dark:text-rose-300">
                      {formatMoney(c.currentAmount, data.currency, intlLocale)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-card/90 ring-1 ring-border/70">
              <CardHeader>
                <CardTitle>{t("reports.biggestChanges")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {data.biggestChanges.map((c) => (
                  <div
                    key={c.categoryName}
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{c.categoryName}</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        c.percentageChange > 0 &&
                          "bg-rose-500/15 text-rose-800 dark:text-rose-300",
                        c.percentageChange < 0 &&
                          "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                      )}
                    >
                      {c.percentageChange > 0 ? "+" : ""}
                      {c.percentageChange}%
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card/90 ring-1 ring-border/70">
            <CardHeader>
              <CardTitle>{t("reports.budgetPerformance")}</CardTitle>
              <CardDescription>
                {t("reports.budgetPerformanceDesc", {
                  within: data.budgetPerformance.within,
                  over: data.budgetPerformance.over,
                })}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card/90 ring-1 ring-border/70">
            <CardHeader>
              <CardTitle>{t("reports.goals")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {data.goals.map((g) => {
                const pct =
                  g.targetAmount > 0
                    ? Math.min(
                        100,
                        Math.round((g.currentAmount / g.targetAmount) * 100)
                      )
                    : 0;
                return (
                  <div
                    key={g.name}
                    className="space-y-2 rounded-xl bg-muted/40 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">
                        {g.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground sm:text-sm">
                        {formatMoney(g.currentAmount, g.currency, intlLocale)} /{" "}
                        {formatMoney(g.targetAmount, g.currency, intlLocale)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-background/80">
                      <div
                        className="h-full rounded-full bg-emerald-500/80 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
