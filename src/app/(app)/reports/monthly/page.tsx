"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Review = {
  label: string;
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

export default function MonthlyReviewPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Review | null>(null);

  useEffect(() => {
    api<Review>(`/api/reports/monthly?year=${year}&month=${month}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [year, month]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Monthly Review</h1>
          <p className="text-muted-foreground">
            What happened this month — without labeling it good or bad.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            className="w-20"
            value={month}
            min={1}
            max={12}
            onChange={(e) => setMonth(Number(e.target.value))}
          />
          <Input
            type="number"
            className="w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
      </div>

      {!data ? (
        <p className="text-muted-foreground">Loading review...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Income", data.income, data.comparison.incomeChange],
              ["Expenses", data.expenses, data.comparison.expenseChange],
              ["Savings", data.savings, data.comparison.savingsChange],
              ["Debt payment", data.debtPayment, data.comparison.debtChange],
              ["Net cash flow", data.netCashFlow, null],
            ].map(([label, value, change]) => (
              <Card key={String(label)}>
                <CardHeader className="pb-2">
                  <CardDescription>{label as string}</CardDescription>
                  <CardTitle className="font-mono text-lg">
                    {formatMoney(value as number, data.currency)}
                  </CardTitle>
                  {typeof change === "number" ? (
                    <p className="text-xs text-muted-foreground">
                      vs previous: {change > 0 ? "+" : ""}
                      {change}%
                    </p>
                  ) : null}
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data.topCategories.map((c) => (
                  <div key={c.categoryName} className="flex justify-between">
                    <span>{c.categoryName}</span>
                    <span className="font-mono">
                      {formatMoney(c.currentAmount, data.currency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Biggest changes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.biggestChanges.map((c) => (
                  <div
                    key={c.categoryName}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{c.categoryName}</span>
                    <Badge variant="secondary">
                      {c.percentageChange > 0 ? "+" : ""}
                      {c.percentageChange}%
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Budget performance</CardTitle>
              <CardDescription>
                {data.budgetPerformance.within} within budget ·{" "}
                {data.budgetPerformance.over} over budget
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.goals.map((g) => (
                <div key={g.name} className="flex justify-between">
                  <span>{g.name}</span>
                  <span className="font-mono">
                    {formatMoney(g.currentAmount, g.currency)} /{" "}
                    {formatMoney(g.targetAmount, g.currency)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
