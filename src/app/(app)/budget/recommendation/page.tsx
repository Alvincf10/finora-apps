"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
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
  const { t, intlLocale } = useI18n();
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
      toast.error(error instanceof Error ? error.message : t("common.failed"));
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
      toast.success(t("smartBudget.accepted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("smartBudget.title")}
          </h1>
          <p className="text-muted-foreground">{t("smartBudget.subtitle")}</p>
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
            {loading ? t("smartBudget.generating") : t("common.refresh")}
          </Button>
        </div>
      </div>

      {!data ? (
        <p className="text-muted-foreground">{t("smartBudget.loading")}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {t("smartBudget.expectedIncome")}
                </CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(data.totalIncome, data.currency, intlLocale)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {t("smartBudget.recommendedExpenses")}
                </CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(adjustedTotal, data.currency, intlLocale)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("smartBudget.debtReserve")}</CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(
                    data.totalDebtPayment,
                    data.currency,
                    intlLocale
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {t("smartBudget.projectedSavings")}
                </CardDescription>
                <CardTitle className="font-mono text-xl">
                  {formatMoney(savingsImpact, data.currency, intlLocale)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {data.conflict ? (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive">
                  {t("smartBudget.conflict")}
                </CardTitle>
                <CardDescription>{data.conflict.message}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {t("smartBudget.allocation", { month, year })}
                </CardTitle>
                <CardDescription>
                  {t("smartBudget.confidence", { level: data.confidence })}
                </CardDescription>
              </div>
              <Button onClick={accept}>{t("smartBudget.acceptAll")}</Button>
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
                      {t("smartBudget.avgCurrent", {
                        avg: formatMoney(
                          c.historicalAverage,
                          data.currency,
                          intlLocale
                        ),
                        current: formatMoney(
                          c.currentAmount,
                          data.currency,
                          intlLocale
                        ),
                      })}
                    </p>
                    <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                      {c.rationale.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t("smartBudget.yourAmount")}
                    </p>
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
              <CardTitle>{t("smartBudget.engineRationale")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {data.rationale.map((r) => (
                <p key={r}>{r}</p>
              ))}
              <p className="pt-2">
                {t("smartBudget.bufferRemaining", {
                  amount: formatMoney(data.buffer, data.currency, intlLocale),
                })}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
