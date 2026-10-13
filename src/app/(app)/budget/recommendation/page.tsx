"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Rec = {
  month: number;
  year: number;
  currency: Currency;
  categories: Array<{
    categoryId: string;
    categoryName: string;
    recommendedAmount: number;
    historicalAverage: number;
    currentAmount: number;
    percentageChange: number;
    rationale: string[];
  }>;
  totalIncome: number;
  totalExpenses: number;
  totalDebtPayment: number;
  totalSavings: number;
  buffer: number;
  rationale: string[];
  confidence: string;
  conflict?: { message: string };
};

export default function SmartBudgetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Rec | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rec = await api<Rec>(
        `/api/budget/recommendation?year=${year}&month=${month}`
      );
      setData(rec);
      const map: Record<string, number> = {};
      for (const c of rec.categories) {
        map[c.categoryId] = c.recommendedAmount;
      }
      setAmounts(map);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [year, month]);

  const adjustedTotal = Object.values(amounts).reduce((a, b) => a + b, 0);
  const savingsImpact = data
    ? data.totalIncome - adjustedTotal - data.totalDebtPayment
    : 0;

  async function accept() {
    if (!data) return;
    try {
      await api("/api/budget/recommendation", {
        method: "POST",
        body: JSON.stringify({
          year: data.year,
          month: data.month,
          currency: data.currency,
          categories: Object.entries(amounts).map(([categoryId, amount]) => ({
            categoryId,
            amount,
          })),
        }),
      });
      toast.success("Smart budget accepted into monthly budgets");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Smart Budget</h1>
          <p className="text-muted-foreground">
            Deterministic recommendation from your history — review before accepting.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Generating..." : "Refresh"}
          </Button>
        </div>
      </div>

      {!data ? (
        <p className="text-muted-foreground">Loading recommendation...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Expected income</CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(data.totalIncome, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Recommended expenses</CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(adjustedTotal, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Debt reserve</CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(data.totalDebtPayment, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Projected savings</CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(savingsImpact, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {data.conflict ? (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive">Budget conflict</CardTitle>
                <CardDescription>{data.conflict.message}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {month}/{year} allocation
                </CardTitle>
                <CardDescription>
                  Confidence: {data.confidence}. Adjust amounts to simulate impact.
                </CardDescription>
              </div>
              <Button onClick={accept}>Accept all</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.categories.map((c) => (
                <div
                  key={c.categoryId}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_0.8fr]"
                >
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <p className="font-medium">{c.categoryName}</p>
                      <Badge variant="secondary">
                        {c.percentageChange > 0 ? "+" : ""}
                        {c.percentageChange}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Avg {formatMoney(c.historicalAverage, data.currency)} · Current{" "}
                      {formatMoney(c.currentAmount, data.currency)}
                    </p>
                    <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                      {c.rationale.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Your amount</p>
                    <CurrencyAmountInput
                      currency={data.currency}
                      value={fromMinorUnits(
                        amounts[c.categoryId] ?? 0,
                        data.currency
                      )}
                      onValueChange={(major) =>
                        setAmounts((prev) => ({
                          ...prev,
                          [c.categoryId]: toMinorUnits(major, data.currency),
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engine rationale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {data.rationale.map((r) => (
                <p key={r}>{r}</p>
              ))}
              <p className="pt-2">
                Buffer remaining: {formatMoney(data.buffer, data.currency)}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
