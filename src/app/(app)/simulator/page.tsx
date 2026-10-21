"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SimResult = {
  cashFlow: number;
  savings: number;
  debtPayoffMonths: number | null;
  endingBalance: number;
  assumptions: string[];
};

type DebtPack = {
  debts: Array<{
    debtId: string;
    name: string;
    remainingAmount: number;
    currency: Currency;
    interestRate: number | null;
    scenarios: Array<{
      label: string;
      monthlyPayment: number;
      estimatedMonths: number | null;
      note?: string;
    }>;
  }>;
  emergency: {
    coverageMonths: number | null;
    essentialMonthlyExpenses: number;
    emergencyFund: null | {
      name: string;
      currentAmount: number;
      currency: Currency;
    };
  };
};

export default function SimulatorPage() {
  const { t, intlLocale } = useI18n();
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [debtPayment, setDebtPayment] = useState(0);
  const [savings, setSavings] = useState(0);
  const [hasIncome, setHasIncome] = useState(false);
  const [hasExpenses, setHasExpenses] = useState(false);
  const [hasDebtPayment, setHasDebtPayment] = useState(false);
  const [hasSavings, setHasSavings] = useState(false);
  const [currency, setCurrency] = useState<Currency>("IDR");
  const [result, setResult] = useState<SimResult | null>(null);
  const [pack, setPack] = useState<DebtPack | null>(null);

  useEffect(() => {
    api<DebtPack>("/api/simulator")
      .then(setPack)
      .catch((e) => toast.error(e.message));
  }, []);

  async function run() {
    try {
      const body: Record<string, unknown> = {};
      if (hasIncome) body.incomeOverride = toMinorUnits(income, currency);
      if (hasExpenses)
        body.expenseOverrides = [
          { categoryId: "total", amount: toMinorUnits(expenses, currency) },
        ];
      if (hasDebtPayment)
        body.debtPaymentOverride = toMinorUnits(debtPayment, currency);
      if (hasSavings) body.savingsOverride = toMinorUnits(savings, currency);

      const data = await api<SimResult>("/api/simulator", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">
          {t("simulator.title")}
        </h1>
        <p className="text-muted-foreground">{t("simulator.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("simulator.inputs")}</CardTitle>
          <CardDescription>{t("simulator.inputsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("common.currency")}</Label>
            <select
              className="flex h-9 w-full rounded-md border px-3 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="IDR">IDR</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("simulator.incomeOverride")}</Label>
            <CurrencyAmountInput
              key={`income-${currency}`}
              currency={currency}
              allowEmpty
              onValueChange={(v) => {
                setHasIncome(v > 0);
                setIncome(v);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("simulator.expensesOverride")}</Label>
            <CurrencyAmountInput
              key={`expenses-${currency}`}
              currency={currency}
              allowEmpty
              onValueChange={(v) => {
                setHasExpenses(v > 0);
                setExpenses(v);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("simulator.debtOverride")}</Label>
            <CurrencyAmountInput
              key={`debt-${currency}`}
              currency={currency}
              allowEmpty
              onValueChange={(v) => {
                setHasDebtPayment(v > 0);
                setDebtPayment(v);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("simulator.savingsOverride")}</Label>
            <CurrencyAmountInput
              key={`savings-${currency}`}
              currency={currency}
              allowEmpty
              onValueChange={(v) => {
                setHasSavings(v > 0);
                setSavings(v);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={run} className="w-full">
              {t("simulator.run")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("simulator.result")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {t("simulator.cashFlow")}{" "}
              <span className="font-mono">
                {formatMoney(result.cashFlow, currency, intlLocale)}
              </span>
            </p>
            <p>
              {t("simulator.savings")}{" "}
              <span className="font-mono">
                {formatMoney(result.savings, currency, intlLocale)}
              </span>
            </p>
            <p>
              {t("simulator.endingDelta")}{" "}
              <span className="font-mono">
                {formatMoney(result.endingBalance, currency, intlLocale)}
              </span>
            </p>
            <p>
              {t("simulator.debtPayoffMonths")}{" "}
              {result.debtPayoffMonths ?? t("common.na")}
            </p>
            <div className="pt-2 text-muted-foreground">
              {result.assumptions.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {pack ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("simulator.debtScenarios")}</CardTitle>
              <CardDescription>
                {t("simulator.debtScenariosDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pack.debts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("simulator.noActiveDebts")}
                </p>
              ) : (
                pack.debts.map((d) => (
                  <div key={d.debtId} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-muted-foreground">
                      {t("simulator.remaining", {
                        amount: formatMoney(
                          d.remainingAmount,
                          d.currency,
                          intlLocale
                        ),
                      })}
                      {d.interestRate == null
                        ? t("simulator.interestMissing")
                        : ` · ${d.interestRate}%`}
                    </p>
                    <div className="mt-2 space-y-1">
                      {d.scenarios.map((s) => (
                        <p key={s.label}>
                          {s.label}:{" "}
                          {formatMoney(s.monthlyPayment, d.currency, intlLocale)}
                          {" → "}
                          {s.estimatedMonths != null
                            ? t("simulator.months", {
                                count: s.estimatedMonths,
                              })
                            : s.note ?? t("common.na")}
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("simulator.emergencyFund")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pack.emergency.emergencyFund ? (
                <>
                  <p>{pack.emergency.emergencyFund.name}</p>
                  <p className="font-mono">
                    {formatMoney(
                      pack.emergency.emergencyFund.currentAmount,
                      pack.emergency.emergencyFund.currency,
                      intlLocale
                    )}
                  </p>
                  <p>
                    {t("simulator.essentialMonthly")}{" "}
                    {formatMoney(
                      pack.emergency.essentialMonthlyExpenses,
                      currency,
                      intlLocale
                    )}
                  </p>
                  <p>
                    {t("simulator.coverage")}{" "}
                    {pack.emergency.coverageMonths != null
                      ? t("simulator.months", {
                          count: pack.emergency.coverageMonths,
                        })
                      : t("common.na")}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {t("simulator.noEmergencyGoal")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
