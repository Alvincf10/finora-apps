"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Profile = {
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  averageMonthlySavings: number;
  averageSavingsRate: number;
  averageDebtPayment: number;
  incomeStability: string;
  expenseStability: string;
  currency: Currency;
};

type SpendingRow = {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  average3m: number;
  average6m: number;
  percentageChange: number;
  trend: string;
  projectedMonthly: number;
  anomaly: { threshold: number; reason: string } | null;
  classification: string;
  nature: string;
  currency: Currency;
};

type CashFlowRow = {
  label: string;
  income: number;
  expense: number;
  net: number;
};

type AnalyticsData = {
  profile: Profile;
  spending: SpendingRow[];
  cashFlow: CashFlowRow[];
  period: { year: number; month: number };
  months: number;
};

function moneyTick(value: number, currency: Currency) {
  const major = fromMinorUnits(value, currency);
  if (currency === "IDR") {
    if (Math.abs(major) >= 1_000_000) {
      return `${(major / 1_000_000).toFixed(1)}jt`;
    }
    if (Math.abs(major) >= 1_000) {
      return `${Math.round(major / 1_000)}rb`;
    }
  }
  return String(Math.round(major));
}

export default function ReportsPage() {
  const { t, intlLocale } = useI18n();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  function trendBadge(trend: string) {
    if (trend === "INCREASING")
      return { label: t("reports.trendUp"), variant: "destructive" as const };
    if (trend === "DECREASING")
      return { label: t("reports.trendDown"), variant: "secondary" as const };
    if (trend === "STABLE")
      return { label: t("reports.trendStable"), variant: "outline" as const };
    return { label: t("reports.trendNone"), variant: "outline" as const };
  }

  useEffect(() => {
    setLoading(true);
    api<AnalyticsData>(
      `/api/analytics?year=${year}&month=${month}&months=${months}`
    )
      .then(setData)
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : t("common.failed"))
      )
      .finally(() => setLoading(false));
  }, [year, month, months, t]);

  const currency = data?.profile.currency ?? "IDR";

  const categoryChart = useMemo(() => {
    if (!data) return [];
    return [...data.spending]
      .sort((a, b) => b.currentAmount - a.currentAmount)
      .slice(0, 8)
      .map((row) => ({
        name:
          row.categoryName.length > 10
            ? `${row.categoryName.slice(0, 9)}…`
            : row.categoryName,
        fullName: row.categoryName,
        current: row.currentAmount,
        average: months >= 6 ? row.average6m : row.average3m,
      }));
  }, [data, months]);

  const rankedSpending = useMemo(() => {
    if (!data) return [];
    return [...data.spending].sort(
      (a, b) => b.currentAmount - a.currentAmount
    );
  }, [data]);

  const cashFlowChart = useMemo(() => {
    if (!data) return [];
    return data.cashFlow.map((row) => ({
      ...row,
      short: row.label.slice(5),
    }));
  }, [data]);

  const periodLabel = data
    ? new Date(data.period.year, data.period.month - 1, 1).toLocaleDateString(
        intlLocale,
        { month: "short", year: "numeric" }
      )
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("reports.title")}
          </h1>
          <p className="text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("common.month")}</Label>
            <Input
              type="number"
              className="w-20"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("common.year")}</Label>
            <Input
              type="number"
              className="w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("common.range")}</Label>
            <div className="flex rounded-md border p-0.5">
              {([3, 6, 12] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={months === m ? "secondary" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => setMonths(m)}
                >
                  {m}m
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">{t("reports.loading")}</p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {t("reports.avgIncome", { months })}
                </CardDescription>
                <CardTitle className="font-mono text-xl tabular-nums">
                  {formatMoney(
                    data.profile.averageMonthlyIncome,
                    currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">{data.profile.incomeStability}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("reports.avgExpense")}</CardDescription>
                <CardTitle className="font-mono text-xl tabular-nums">
                  {formatMoney(
                    data.profile.averageMonthlyExpense,
                    currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">{data.profile.expenseStability}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("reports.avgSavings")}</CardDescription>
                <CardTitle className="font-mono text-xl tabular-nums">
                  {formatMoney(
                    data.profile.averageMonthlySavings,
                    currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t("reports.savingsRate", {
                  rate: data.profile.averageSavingsRate,
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("reports.debtObligation")}</CardDescription>
                <CardTitle className="font-mono text-xl tabular-nums">
                  {formatMoney(
                    data.profile.averageDebtPayment,
                    currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {periodLabel}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("reports.cashFlow")}</CardTitle>
              <CardDescription>
                {t("reports.cashFlowDesc", { months })}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="short" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => moneyTick(Number(v), currency)}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value) =>
                      formatMoney(Number(value ?? 0), currency, intlLocale)
                    }
                    labelFormatter={(label, payload) =>
                      String(payload?.[0]?.payload?.label ?? label)
                    }
                  />
                  <Legend />
                  <Bar
                    dataKey="income"
                    name={t("reports.income")}
                    fill="#059669"
                    radius={4}
                  />
                  <Bar
                    dataKey="expense"
                    name={t("reports.expense")}
                    fill="#64748b"
                    radius={4}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("reports.topCategories")}</CardTitle>
                <CardDescription>
                  {t("reports.topCategoriesDesc", {
                    avg: months >= 6 ? t("reports.avg6m") : t("reports.avg3m"),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                {categoryChart.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("reports.noCategoryData")}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => moneyTick(Number(v), currency)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={72}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) =>
                          formatMoney(Number(value ?? 0), currency, intlLocale)
                        }
                        labelFormatter={(_, payload) =>
                          String(payload?.[0]?.payload?.fullName ?? "")
                        }
                      />
                      <Legend />
                      <Bar
                        dataKey="current"
                        name={t("reports.current")}
                        fill="#059669"
                        radius={4}
                      />
                      <Bar
                        dataKey="average"
                        name={t("reports.average")}
                        fill="#94a3b8"
                        radius={4}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle>{t("reports.categoryDetail")}</CardTitle>
                  <CardDescription>
                    {t("reports.categoryDetailDesc")}
                  </CardDescription>
                </div>
                <Link
                  href="/insights"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" })
                  )}
                >
                  {t("reports.openInsights")}
                </Link>
              </CardHeader>
              <CardContent className="max-h-80 space-y-3 overflow-y-auto">
                {rankedSpending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("reports.noSpending")}
                  </p>
                ) : (
                  rankedSpending.map((row) => {
                    const trend = trendBadge(row.trend);
                    return (
                      <div
                        key={row.categoryId}
                        className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">
                              {row.categoryName}
                            </span>
                            <Badge variant={trend.variant}>{trend.label}</Badge>
                            {row.anomaly ? (
                              <Badge variant="destructive">
                                {t("reports.anomaly")}
                              </Badge>
                            ) : null}
                          </div>
                          <span className="font-mono text-sm tabular-nums">
                            {formatMoney(
                              row.currentAmount,
                              row.currency,
                              intlLocale
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {t("reports.avg3mLabel")}{" "}
                            <span className="font-mono text-foreground">
                              {formatMoney(
                                row.average3m,
                                row.currency,
                                intlLocale
                              )}
                            </span>
                          </span>
                          <span>
                            Δ{" "}
                            <span className="font-mono text-foreground">
                              {row.percentageChange}%
                            </span>
                          </span>
                          <span>
                            {t("reports.projected")}{" "}
                            <span className="font-mono text-foreground">
                              {formatMoney(
                                row.projectedMonthly,
                                row.currency,
                                intlLocale
                              )}
                            </span>
                          </span>
                          <span>
                            {row.classification} · {row.nature}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reports/monthly"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("reports.monthlyReview")}
            </Link>
            <Link
              href="/forecast"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {t("reports.forecast")}
            </Link>
          </div>
        </>
      ) : !loading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("reports.loadFailed")}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
