"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
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

type Forecast = {
  projectedIncome: number;
  projectedExpenses: number;
  projectedFixedCosts: number;
  projectedDebtPayment: number;
  projectedSavings: number;
  startingBalance: number;
  projectedEndingBalance: number;
  assumptions: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  currency: Currency;
  incomeSource: "SALARY" | "HISTORY";
};

function confidenceVariant(c: Forecast["confidence"]) {
  if (c === "HIGH") return "default" as const;
  if (c === "MEDIUM") return "secondary" as const;
  return "outline" as const;
}

function Row({
  label,
  amount,
  currency,
  intlLocale,
  tone,
  emphasize,
}: {
  label: string;
  amount: number;
  currency: Currency;
  intlLocale: string;
  tone?: "positive" | "negative" | "muted";
  emphasize?: boolean;
}) {
  const color =
    tone === "positive"
      ? "text-emerald-800 dark:text-emerald-300"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5",
        emphasize && "border-t pt-3"
      )}
    >
      <span
        className={cn(
          "text-sm",
          emphasize ? "font-medium" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          emphasize ? "text-base font-semibold" : "text-sm",
          color
        )}
      >
        {formatMoney(amount, currency, intlLocale)}
      </span>
    </div>
  );
}

type ForecastPayload = Forecast & {
  period?: { year: number; month: number };
  cycleLabel?: string;
};

export default function ForecastPage() {
  const { t, intlLocale } = useI18n();
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qs =
      year != null && month != null ? `?year=${year}&month=${month}` : "";
    api<ForecastPayload>(`/api/forecast${qs}`)
      .then((forecast) => {
        setData(forecast);
        if (year == null && forecast.period) {
          setYear(forecast.period.year);
          setMonth(forecast.period.month);
        }
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : t("common.failed"))
      )
      .finally(() => setLoading(false));
  }, [year, month, t]);

  const periodLabel =
    data?.cycleLabel ??
    (year != null && month != null
      ? new Date(year, month - 1, 1).toLocaleDateString(intlLocale, {
          month: "long",
          year: "numeric",
        })
      : "…");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("forecast.title")}
          </h1>
          <p className="text-muted-foreground">{t("forecast.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="forecast-month" className="text-xs">
              {t("common.month")}
            </Label>
            <Input
              id="forecast-month"
              type="number"
              className="w-20"
              value={month ?? ""}
              min={1}
              max={12}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="forecast-year" className="text-xs">
              {t("common.year")}
            </Label>
            <Input
              id="forecast-year"
              type="number"
              className="w-28"
              value={year ?? ""}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {!data && loading ? (
        <p className="text-sm text-muted-foreground">{t("forecast.loading")}</p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {t("forecast.projectedSavings", { period: periodLabel })}
                </CardDescription>
                <CardTitle
                  className={cn(
                    "font-mono text-2xl tabular-nums",
                    data.projectedSavings >= 0
                      ? "text-emerald-800 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-400"
                  )}
                >
                  {formatMoney(
                    data.projectedSavings,
                    data.currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("forecast.endingBalance")}</CardDescription>
                <CardTitle className="font-mono text-2xl tabular-nums">
                  {formatMoney(
                    data.projectedEndingBalance,
                    data.currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("forecast.confidence")}</CardDescription>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant={confidenceVariant(data.confidence)}>
                    {data.confidence}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {data.confidence === "HIGH"
                      ? t("forecast.confidenceHigh")
                      : data.confidence === "MEDIUM"
                        ? t("forecast.confidenceMedium")
                        : t("forecast.confidenceLow")}
                  </span>
                </div>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("forecast.breakdown")}</CardTitle>
                <CardDescription>{t("forecast.breakdownDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                <div className="py-2.5">
                  <Row
                    label={t("forecast.projectedIncome")}
                    amount={data.projectedIncome}
                    currency={data.currency}
                    intlLocale={intlLocale}
                    tone="positive"
                  />
                  <p className="text-xs text-muted-foreground">
                    {data.incomeSource === "SALARY"
                      ? t("forecast.incomeFromSalary")
                      : t("forecast.incomeFromHistory")}
                  </p>
                </div>
                <Row
                  label={t("forecast.projectedExpenses")}
                  amount={data.projectedExpenses}
                  currency={data.currency}
                  intlLocale={intlLocale}
                  tone="negative"
                />
                {data.projectedFixedCosts > 0 ? (
                  <Row
                    label={t("forecast.fixedCosts")}
                    amount={data.projectedFixedCosts}
                    currency={data.currency}
                    intlLocale={intlLocale}
                    tone="muted"
                  />
                ) : null}
                <Row
                  label={t("forecast.debtPayments")}
                  amount={data.projectedDebtPayment}
                  currency={data.currency}
                  intlLocale={intlLocale}
                  tone="negative"
                />
                <Row
                  label={t("forecast.projectedSavingsLabel")}
                  amount={data.projectedSavings}
                  currency={data.currency}
                  intlLocale={intlLocale}
                  tone={data.projectedSavings >= 0 ? "positive" : "negative"}
                  emphasize
                />
                <Row
                  label={t("forecast.startingBalance")}
                  amount={data.startingBalance}
                  currency={data.currency}
                  intlLocale={intlLocale}
                  tone="muted"
                />
                <Row
                  label={t("forecast.projectedEndingBalance")}
                  amount={data.projectedEndingBalance}
                  currency={data.currency}
                  intlLocale={intlLocale}
                  emphasize
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("forecast.assumptions")}</CardTitle>
                <CardDescription>
                  {t("forecast.assumptionsDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {data.assumptions.map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Link
                    href="/simulator"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" })
                    )}
                  >
                    {t("forecast.runWhatIf")}
                  </Link>
                  <Link
                    href="/budget/recommendation"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" })
                    )}
                  >
                    {t("forecast.smartBudget")}
                  </Link>
                  <Link
                    href="/reports/monthly"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" })
                    )}
                  >
                    {t("forecast.monthlyReview")}
                  </Link>
                  <Link
                    href="/payday"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" })
                    )}
                  >
                    {t("forecast.openPayday")}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : !loading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("forecast.empty")}
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoading(true);
                  const qs =
                    year != null && month != null
                      ? `?year=${year}&month=${month}`
                      : "";
                  api<ForecastPayload>(`/api/forecast${qs}`)
                    .then(setData)
                    .catch((e) =>
                      toast.error(
                        e instanceof Error ? e.message : t("common.failed")
                      )
                    )
                    .finally(() => setLoading(false));
                }}
              >
                {t("common.retry")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
