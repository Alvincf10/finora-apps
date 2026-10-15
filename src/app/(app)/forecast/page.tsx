"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";
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
  projectedDebtPayment: number;
  projectedSavings: number;
  startingBalance: number;
  projectedEndingBalance: number;
  assumptions: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  currency: Currency;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function confidenceVariant(c: Forecast["confidence"]) {
  if (c === "HIGH") return "default" as const;
  if (c === "MEDIUM") return "secondary" as const;
  return "outline" as const;
}

function Row({
  label,
  amount,
  currency,
  tone,
  emphasize,
}: {
  label: string;
  amount: number;
  currency: Currency;
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
        {formatMoney(amount, currency)}
      </span>
    </div>
  );
}

export default function ForecastPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<Forecast>(`/api/forecast?year=${year}&month=${month}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [year, month]);

  const periodLabel = `${MONTH_NAMES[month - 1] ?? month} ${year}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            Cash-flow Forecast
          </h1>
          <p className="text-muted-foreground">
            Deterministic projection for the month — based on history, not AI.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="forecast-month" className="text-xs">
              Month
            </Label>
            <Input
              id="forecast-month"
              type="number"
              className="w-20"
              value={month}
              min={1}
              max={12}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="forecast-year" className="text-xs">
              Year
            </Label>
            <Input
              id="forecast-year"
              type="number"
              className="w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {!data && loading ? (
        <p className="text-sm text-muted-foreground">Loading forecast…</p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Projected savings · {periodLabel}</CardDescription>
                <CardTitle
                  className={cn(
                    "font-mono text-2xl tabular-nums",
                    data.projectedSavings >= 0
                      ? "text-emerald-800 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-400"
                  )}
                >
                  {formatMoney(data.projectedSavings, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ending balance</CardDescription>
                <CardTitle className="font-mono text-2xl tabular-nums">
                  {formatMoney(data.projectedEndingBalance, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Confidence</CardDescription>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant={confidenceVariant(data.confidence)}>
                    {data.confidence}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {data.confidence === "HIGH"
                      ? "Stable income · 6+ months history"
                      : data.confidence === "MEDIUM"
                        ? "3+ months of history"
                        : "Limited history — treat as rough"}
                  </span>
                </div>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Breakdown</CardTitle>
                <CardDescription>
                  How the month is expected to close
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                <Row
                  label="Projected income"
                  amount={data.projectedIncome}
                  currency={data.currency}
                  tone="positive"
                />
                <Row
                  label="Projected expenses"
                  amount={data.projectedExpenses}
                  currency={data.currency}
                  tone="negative"
                />
                <Row
                  label="Debt payments"
                  amount={data.projectedDebtPayment}
                  currency={data.currency}
                  tone="negative"
                />
                <Row
                  label="Projected savings"
                  amount={data.projectedSavings}
                  currency={data.currency}
                  tone={data.projectedSavings >= 0 ? "positive" : "negative"}
                  emphasize
                />
                <Row
                  label="Starting balance (assets)"
                  amount={data.startingBalance}
                  currency={data.currency}
                  tone="muted"
                />
                <Row
                  label="Projected ending balance"
                  amount={data.projectedEndingBalance}
                  currency={data.currency}
                  emphasize
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assumptions</CardTitle>
                <CardDescription>
                  Rules used for this projection
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
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Run what-if
                  </Link>
                  <Link
                    href="/budget/recommendation"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    Smart budget
                  </Link>
                  <Link
                    href="/reports/monthly"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    Monthly review
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : !loading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No forecast yet. Add a few months of transactions, then refresh.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoading(true);
                  api<Forecast>(`/api/forecast?year=${year}&month=${month}`)
                    .then(setData)
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Failed")
                    )
                    .finally(() => setLoading(false));
                }}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
