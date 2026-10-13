"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { Button } from "@/components/ui/button";
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
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">What-If Simulator</h1>
        <p className="text-muted-foreground">
          Explore scenarios without mutating real transactions or budgets.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scenario inputs</CardTitle>
          <CardDescription>
            Leave blank to keep the current-month baseline for that field.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Currency</Label>
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
            <Label>Income override</Label>
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
            <Label>Total expenses override</Label>
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
            <Label>Debt payment override</Label>
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
            <Label>Savings override</Label>
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
              Run simulation
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Simulation result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Cash flow:{" "}
              <span className="font-mono">
                {formatMoney(result.cashFlow, currency)}
              </span>
            </p>
            <p>
              Savings:{" "}
              <span className="font-mono">
                {formatMoney(result.savings, currency)}
              </span>
            </p>
            <p>
              Ending balance delta:{" "}
              <span className="font-mono">
                {formatMoney(result.endingBalance, currency)}
              </span>
            </p>
            <p>
              Debt payoff months:{" "}
              {result.debtPayoffMonths ?? "n/a"}
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
              <CardTitle>Debt scenarios</CardTitle>
              <CardDescription>Presented objectively — no “best” pick.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pack.debts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active debts.</p>
              ) : (
                pack.debts.map((d) => (
                  <div key={d.debtId} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-muted-foreground">
                      Remaining {formatMoney(d.remainingAmount, d.currency)}
                      {d.interestRate == null
                        ? " · interest rate missing"
                        : ` · ${d.interestRate}%`}
                    </p>
                    <div className="mt-2 space-y-1">
                      {d.scenarios.map((s) => (
                        <p key={s.label}>
                          {s.label}: {formatMoney(s.monthlyPayment, d.currency)}
                          {" → "}
                          {s.estimatedMonths != null
                            ? `${s.estimatedMonths} months`
                            : s.note ?? "n/a"}
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
              <CardTitle>Emergency fund</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pack.emergency.emergencyFund ? (
                <>
                  <p>{pack.emergency.emergencyFund.name}</p>
                  <p className="font-mono">
                    {formatMoney(
                      pack.emergency.emergencyFund.currentAmount,
                      pack.emergency.emergencyFund.currency
                    )}
                  </p>
                  <p>
                    Essential monthly:{" "}
                    {formatMoney(pack.emergency.essentialMonthlyExpenses, currency)}
                  </p>
                  <p>
                    Coverage:{" "}
                    {pack.emergency.coverageMonths != null
                      ? `${pack.emergency.coverageMonths} months`
                      : "n/a"}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  No goal named like “Emergency Fund”.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
