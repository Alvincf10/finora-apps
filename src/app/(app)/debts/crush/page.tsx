"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CrushCycle = {
  label: string;
  start: string;
  end: string;
  debtDueTotal: number;
  items: Array<{
    debtId: string;
    name: string;
    dueAmount: number;
    remainingAfter: number;
  }>;
  fixedCosts: number;
  separateLiabilityPay: number;
  livingCap: number;
  floorWithoutLiving: number;
  totalNeed: number;
  income: number;
  cashAtStart: number;
  surplus: number;
  livingMaxAtIncome: number;
};

type CrushResponse = {
  currency: Currency;
  paydayDay: number;
  defaults: {
    income: number;
    livingCap: number;
    fixedCostsPerCycle: number;
    startingCash: number;
    separateLiability: number;
    cycleCount: number;
  };
  plan: {
    cycles: CrushCycle[];
    debtRemainingStart: number;
    debtRemainingEnd: number;
    separateLiabilityStart: number;
    separateLiabilityEnd: number;
    incomeRequiredForLiving: number;
    livingMaxGivenIncome: number;
    bottleneckCycleLabel: string | null;
    feasible: boolean;
  };
  incomeRequiredToClear: number;
  completeness: {
    ok: boolean;
    score: number;
    salary: number;
    expectedObligated: number;
    savedObligated: number;
    allocatedTotal: number;
    utilizationPct: number;
    missingLabels: string[];
    issues: string[];
  };
  payday: {
    target: string;
    cycleLabel: string;
    existingStatus: string | null;
  };
};

export default function DebtCrushPage() {
  const { t, intlLocale } = useI18n();
  const [data, setData] = useState<CrushResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [incomeMajor, setIncomeMajor] = useState(0);
  const [livingMajor, setLivingMajor] = useState(0);
  const [cycleCount, setCycleCount] = useState(3);
  const [includeCc, setIncludeCc] = useState(true);
  const [currency, setCurrency] = useState<Currency>("IDR");

  const money = useCallback(
    (amount: number, cur: Currency = currency) =>
      formatMoney(amount, cur, intlLocale),
    [currency, intlLocale]
  );

  const load = useCallback(
    async (overrides?: {
      income?: number;
      livingCap?: number;
      cycleCount?: number;
      includeCc?: boolean;
    }) => {
      setLoading(true);
      try {
        const income = overrides?.income ?? toMinorUnits(incomeMajor, currency);
        const livingCap =
          overrides?.livingCap ?? toMinorUnits(livingMajor, currency);
        const cycles = overrides?.cycleCount ?? cycleCount;
        const cc = overrides?.includeCc ?? includeCc;
        const params = new URLSearchParams({
          income: String(income),
          livingCap: String(livingCap),
          cycleCount: String(cycles),
          includeCc: cc ? "1" : "0",
          fromTarget: "next",
        });
        const result = await api<CrushResponse>(
          `/api/debts/crush-plan?${params}`
        );
        setData(result);
        setCurrency(result.currency);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("common.failed")
        );
      } finally {
        setLoading(false);
      }
    },
    [currency, cycleCount, includeCc, incomeMajor, livingMajor, t]
  );

  useEffect(() => {
    (async () => {
      try {
        const result = await api<CrushResponse>(
          "/api/debts/crush-plan?fromTarget=next&includeCc=1&cycleCount=3"
        );
        setData(result);
        setCurrency(result.currency);
        setIncomeMajor(fromMinorUnits(result.defaults.income, result.currency));
        setLivingMajor(
          fromMinorUnits(result.defaults.livingCap, result.currency)
        );
        setCycleCount(result.defaults.cycleCount);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("common.failed")
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const weeklyLiving = useMemo(() => {
    if (!data) return 0;
    return Math.round(data.plan.cycles[0]?.livingCap
      ? data.plan.cycles[0].livingCap / 4
      : toMinorUnits(livingMajor, currency) / 4);
  }, [currency, data, livingMajor]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2"
            render={<Link href="/debts" />}
          >
            <ArrowLeft className="size-4" />
            {t("debtCrush.backToDebts")}
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("debtCrush.title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("debtCrush.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => load()}
        >
          <RefreshCw className="size-4" />
          {t("debtCrush.recalculate")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("debtCrush.assumptions")}</CardTitle>
          <CardDescription>{t("debtCrush.assumptionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>{t("debtCrush.income")}</Label>
            <CurrencyAmountInput
              currency={currency}
              value={incomeMajor}
              onValueChange={setIncomeMajor}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("debtCrush.livingCap")}</Label>
            <CurrencyAmountInput
              currency={currency}
              value={livingMajor}
              onValueChange={setLivingMajor}
            />
            <p className="text-muted-foreground text-xs">
              {t("debtCrush.weeklyApprox", {
                amount: money(weeklyLiving),
              })}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("debtCrush.cycles")}</Label>
            <Input
              type="number"
              min={1}
              max={6}
              value={cycleCount}
              onChange={(e) =>
                setCycleCount(
                  Math.min(6, Math.max(1, Number(e.target.value) || 1))
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t("debtCrush.includeCc")}</Label>
            <div className="flex items-center gap-2 pt-2">
              <input
                id="include-cc"
                type="checkbox"
                checked={includeCc}
                onChange={(e) => setIncludeCc(e.target.checked)}
                className="size-4"
              />
              <label htmlFor="include-cc" className="text-sm">
                {t("debtCrush.includeCcLabel")}
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("debtCrush.livingMax")}</CardDescription>
                <CardTitle className="text-xl">
                  {money(Math.max(0, data.plan.livingMaxGivenIncome))}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {data.plan.bottleneckCycleLabel
                  ? t("debtCrush.bottleneck", {
                      cycle: data.plan.bottleneckCycleLabel,
                    })
                  : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {t("debtCrush.incomeRequired")}
                </CardDescription>
                <CardTitle className="text-xl">
                  {money(data.incomeRequiredToClear)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {t("debtCrush.incomeRequiredDesc")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("debtCrush.debtLeft")}</CardDescription>
                <CardTitle className="text-xl">
                  {money(data.plan.debtRemainingStart)} →{" "}
                  {money(data.plan.debtRemainingEnd)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {t("debtCrush.afterCycles", { count: data.plan.cycles.length })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("debtCrush.ccLeft")}</CardDescription>
                <CardTitle className="text-xl">
                  {money(data.plan.separateLiabilityStart)} →{" "}
                  {money(data.plan.separateLiabilityEnd)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={data.plan.feasible ? "default" : "destructive"}>
                  {data.plan.feasible
                    ? t("debtCrush.feasible")
                    : t("debtCrush.infeasible")}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("debtCrush.calendarTitle")}</CardTitle>
              <CardDescription>
                {t("debtCrush.calendarDesc", {
                  cycle: data.payday.cycleLabel,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.plan.cycles.map((cycle) => (
                <div
                  key={cycle.start}
                  className="rounded-lg border p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{cycle.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("debtCrush.needVsIncome", {
                          need: money(cycle.totalNeed),
                          income: money(cycle.income + cycle.cashAtStart),
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={cycle.surplus >= 0 ? "secondary" : "destructive"}
                    >
                      {cycle.surplus >= 0
                        ? t("debtCrush.surplus", {
                            amount: money(cycle.surplus),
                          })
                        : t("debtCrush.gap", {
                            amount: money(Math.abs(cycle.surplus)),
                          })}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t("debtCrush.colDebt")}
                      </p>
                      <p className="font-medium">
                        {money(cycle.debtDueTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t("debtCrush.colFixed")}
                      </p>
                      <p className="font-medium">{money(cycle.fixedCosts)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t("debtCrush.colLiving")}
                      </p>
                      <p className="font-medium">{money(cycle.livingCap)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t("debtCrush.colCc")}
                      </p>
                      <p className="font-medium">
                        {money(cycle.separateLiabilityPay)}
                      </p>
                    </div>
                  </div>
                  {cycle.items.length > 0 ? (
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      {cycle.items.map((item) => (
                        <li key={item.debtId}>
                          {item.name}: {money(item.dueAmount)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{t("debtCrush.completenessTitle")}</CardTitle>
                <Badge
                  variant={
                    data.completeness.ok ? "secondary" : "destructive"
                  }
                >
                  {t("debtCrush.completenessScore", {
                    score: data.completeness.score,
                  })}
                </Badge>
              </div>
              <CardDescription>
                {t("debtCrush.completenessDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {t("debtCrush.completenessUtil", {
                  allocated: money(data.completeness.allocatedTotal),
                  salary: money(data.completeness.salary),
                  pct: data.completeness.utilizationPct,
                })}
              </p>
              {data.completeness.issues.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-destructive">
                  {data.completeness.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {t("debtCrush.completenessOk")}
                </p>
              )}
              {data.completeness.missingLabels.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t("debtCrush.missingEnvelopes", {
                    list: data.completeness.missingLabels.slice(0, 8).join(", "),
                  })}
                </p>
              ) : null}
              <Button variant="outline" size="sm" render={<Link href="/payday" />}>
                {t("debtCrush.openPayday")}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : loading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : null}
    </div>
  );
}
