"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ScenarioEvaluation = {
  cashFlow: number;
  savings: number;
  debtPayoffMonths: number | null;
  endingBalance: number;
  emergencyCoverageMonths: number | null;
  cashShortfall: boolean;
  deltas: {
    cashFlow: number;
    savings: number;
    endingBalance: number;
    debtPayoffMonths: number | null;
    emergencyCoverageMonths: number | null;
  };
  changedInputs: string[];
  assumptions: string[];
  unavailable: string[];
  tradeOffs: string[];
  positives: string[];
};

type BaselineSnapshot = {
  capturedAt: string;
  currency: Currency;
  income: number;
  expenses: number;
  debtPayment: number;
  savings: number;
  debtBalance: number;
  startingBalance: number;
  liquidAssets: number;
  netWorth: number;
  essentialMonthly: number | null;
  emergencyFund: number;
  cycleLabel?: string;
  period: { year: number; month: number };
};

type SimResult = {
  cashFlow: number;
  savings: number;
  debtPayoffMonths: number | null;
  endingBalance: number;
  assumptions: string[];
  baseline?: BaselineSnapshot;
  evaluation?: ScenarioEvaluation;
};

type SavedScenario = {
  id: string;
  name: string;
  currency: Currency;
  results: ScenarioEvaluation;
  assumptions: Record<string, number | null | undefined>;
  baselineSnapshot: BaselineSnapshot;
  createdAt: string | null;
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

type ComparisonPayload = {
  currency?: Currency;
  snapshotCapturedAt?: string;
  warning?: string | null;
  bestCashFlowId: string | null;
  bestEndingBalanceId: string | null;
  fastestDebtPayoffId: string | null;
  rows: Array<{
    id: string;
    name: string;
    isBaseline: boolean;
    evaluation: ScenarioEvaluation;
  }>;
};

export default function SimulatorPage() {
  const { t, intlLocale } = useI18n();
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [debtPayment, setDebtPayment] = useState(0);
  const [savings, setSavings] = useState(0);
  const [cashBuffer, setCashBuffer] = useState(0);
  const [hasIncome, setHasIncome] = useState(false);
  const [hasExpenses, setHasExpenses] = useState(false);
  const [hasDebtPayment, setHasDebtPayment] = useState(false);
  const [hasSavings, setHasSavings] = useState(false);
  const [hasBuffer, setHasBuffer] = useState(false);
  const [currency, setCurrency] = useState<Currency>("IDR");
  const [scenarioName, setScenarioName] = useState("Alternatif A");
  const [result, setResult] = useState<SimResult | null>(null);
  const [baseline, setBaseline] = useState<BaselineSnapshot | null>(null);
  const [pack, setPack] = useState<DebtPack | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSaved = useCallback(async () => {
    const data = await api<{ scenarios: SavedScenario[] }>("/api/scenarios");
    setSaved(data.scenarios);
  }, []);

  useEffect(() => {
    Promise.all([
      api<DebtPack>("/api/simulator"),
      api<{ baseline: BaselineSnapshot }>("/api/scenarios?baseline=1"),
      loadSaved(),
    ])
      .then(([debtPack, base]) => {
        setPack(debtPack);
        setBaseline(base.baseline);
        setCurrency(base.baseline.currency);
      })
      .catch((e) => toast.error(e.message));
  }, [loadSaved]);

  function buildAssumptionsBody() {
    const body: Record<string, unknown> = {};
    if (hasIncome) body.incomeOverride = toMinorUnits(income, currency);
    if (hasExpenses) body.expensesOverride = toMinorUnits(expenses, currency);
    if (hasDebtPayment)
      body.debtPaymentOverride = toMinorUnits(debtPayment, currency);
    if (hasSavings) body.savingsOverride = toMinorUnits(savings, currency);
    if (hasBuffer) body.cashBufferOverride = toMinorUnits(cashBuffer, currency);
    return body;
  }

  async function run() {
    try {
      setBusy(true);
      const assumptions = buildAssumptionsBody();
      // Legacy simulator endpoint still accepts expenseOverrides array
      const legacyBody: Record<string, unknown> = {};
      if (assumptions.incomeOverride != null)
        legacyBody.incomeOverride = assumptions.incomeOverride;
      if (assumptions.expensesOverride != null) {
        legacyBody.expenseOverrides = [
          { categoryId: "total", amount: assumptions.expensesOverride },
        ];
      }
      if (assumptions.debtPaymentOverride != null)
        legacyBody.debtPaymentOverride = assumptions.debtPaymentOverride;
      if (assumptions.savingsOverride != null)
        legacyBody.savingsOverride = assumptions.savingsOverride;

      const data = await api<SimResult>("/api/simulator", {
        method: "POST",
        body: JSON.stringify(legacyBody),
      });
      setResult(data);
      if (data.baseline) {
        setBaseline(data.baseline);
        setCurrency(data.baseline.currency);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveScenario() {
    try {
      setBusy(true);
      const assumptions = buildAssumptionsBody();
      await api("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({
          name: scenarioName.trim() || "Untitled scenario",
          assumptions,
        }),
      });
      toast.success("Skenario disimpan");
      await loadSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeScenario(id: string) {
    try {
      await api(`/api/scenarios/${id}`, { method: "DELETE" });
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      await loadSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function compareSelected() {
    if (selectedIds.length === 0) {
      toast.error("Pilih minimal 1 skenario tersimpan");
      return;
    }
    try {
      setBusy(true);
      const data = await api<ComparisonPayload>("/api/scenarios", {
        method: "PUT",
        body: JSON.stringify({ ids: selectedIds }),
      });
      setComparison(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 5
          ? prev
          : [...prev, id]
    );
  }

  const evaluation = result?.evaluation;
  const money = useMemo(
    () => (n: number) => formatMoney(n, currency, intlLocale),
    [currency, intlLocale]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Decision Lab</h1>
        <p className="text-muted-foreground">
          Bandingkan pilihan finansial terhadap snapshot baseline — tanpa mengubah
          ledger.
        </p>
      </div>

      {baseline ? (
        <Card>
          <CardHeader>
            <CardTitle>Baseline snapshot</CardTitle>
            <CardDescription>
              {baseline.cycleLabel ?? "Pay cycle"} · captured{" "}
              {new Date(baseline.capturedAt).toLocaleString(intlLocale)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-3">
            <p>
              Income{" "}
              <span className="font-mono">{money(baseline.income)}</span>
            </p>
            <p>
              Expenses{" "}
              <span className="font-mono">{money(baseline.expenses)}</span>
            </p>
            <p>
              Debt pay{" "}
              <span className="font-mono">{money(baseline.debtPayment)}</span>
            </p>
            <p>
              Liquid{" "}
              <span className="font-mono">{money(baseline.liquidAssets)}</span>
            </p>
            <p>
              Net worth{" "}
              <span className="font-mono">{money(baseline.netWorth)}</span>
            </p>
            <p>
              Debt bal.{" "}
              <span className="font-mono">{money(baseline.debtBalance)}</span>
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("simulator.inputs")}</CardTitle>
          <CardDescription>
            Override kosong = pakai nilai baseline. Simulasi tidak menulis data
            aktual.
          </CardDescription>
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
            <p className="text-xs text-muted-foreground">
              Hasil memakai currency baseline server; samakan dengan baseline.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Nama skenario (saat simpan)</Label>
            <Input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              maxLength={120}
            />
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
          <div className="space-y-2">
            <Label>Cash buffer (opsional)</Label>
            <CurrencyAmountInput
              key={`buffer-${currency}`}
              currency={currency}
              allowEmpty
              onValueChange={(v) => {
                setHasBuffer(v > 0);
                setCashBuffer(v);
              }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => void run()} disabled={busy} className="flex-1">
              {t("simulator.run")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveScenario()}
              disabled={busy}
              className="flex-1"
            >
              Simpan skenario
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
              <span className="font-mono">{money(result.cashFlow)}</span>
              {evaluation ? (
                <span className="text-muted-foreground">
                  {" "}
                  (Δ {money(evaluation.deltas.cashFlow)})
                </span>
              ) : null}
            </p>
            <p>
              {t("simulator.savings")}{" "}
              <span className="font-mono">{money(result.savings)}</span>
            </p>
            <p>
              Ending balance{" "}
              <span className="font-mono">{money(result.endingBalance)}</span>
            </p>
            <p>
              {t("simulator.debtPayoffMonths")}{" "}
              {result.debtPayoffMonths ?? t("common.na")}
            </p>
            {evaluation?.emergencyCoverageMonths != null ? (
              <p>
                Emergency coverage ~{evaluation.emergencyCoverageMonths} bln
              </p>
            ) : null}
            {evaluation?.cashShortfall ? (
              <p className="text-destructive">Projected ending balance negatif</p>
            ) : null}
            {evaluation?.positives?.length ? (
              <div className="pt-2">
                <p className="font-medium">Positif</p>
                {evaluation.positives.map((p) => (
                  <p key={p} className="text-muted-foreground">
                    · {p}
                  </p>
                ))}
              </div>
            ) : null}
            {evaluation?.tradeOffs?.length ? (
              <div className="pt-2">
                <p className="font-medium">Trade-off</p>
                {evaluation.tradeOffs.map((p) => (
                  <p key={p} className="text-muted-foreground">
                    · {p}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="pt-2 text-muted-foreground">
              {result.assumptions.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Skenario tersimpan</CardTitle>
          <CardDescription>
            Snapshot baseline terkunci per skenario — hasil historis tidak berubah
            diam-diam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {saved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada skenario.</p>
          ) : (
            saved.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleSelect(s.id)}
                  />
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · CF {formatMoney(s.results.cashFlow, s.currency, intlLocale)}
                      {" · "}
                      end{" "}
                      {formatMoney(
                        s.results.endingBalance,
                        s.currency,
                        intlLocale
                      )}
                    </span>
                  </span>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void removeScenario(s.id)}
                >
                  Hapus
                </Button>
              </div>
            ))
          )}
          <Button
            variant="outline"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void compareSelected()}
          >
            Bandingkan terpilih ({selectedIds.length})
          </Button>
        </CardContent>
      </Card>

      {comparison ? (
        <Card>
          <CardHeader>
            <CardTitle>Perbandingan</CardTitle>
            <CardDescription>
              {comparison.snapshotCapturedAt
                ? `Snapshot ${new Date(comparison.snapshotCapturedAt).toLocaleString(intlLocale)}`
                : null}
              {comparison.warning ? ` · ${comparison.warning}` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3">Skenario</th>
                  <th className="py-2 pr-3">Cash flow</th>
                  <th className="py-2 pr-3">Ending</th>
                  <th className="py-2 pr-3">Debt months</th>
                  <th className="py-2">EF months</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => {
                  const cur = comparison.currency ?? currency;
                  const highlight =
                    row.id === comparison.bestCashFlowId ||
                    row.id === comparison.bestEndingBalanceId;
                  return (
                    <tr
                      key={row.id}
                      className={
                        highlight ? "bg-emerald-500/5" : undefined
                      }
                    >
                      <td className="py-2 pr-3 font-medium">
                        {row.name}
                        {row.isBaseline ? " *" : ""}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {formatMoney(row.evaluation.cashFlow, cur, intlLocale)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {formatMoney(
                          row.evaluation.endingBalance,
                          cur,
                          intlLocale
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {row.evaluation.debtPayoffMonths ?? "—"}
                      </td>
                      <td className="py-2">
                        {row.evaluation.emergencyCoverageMonths ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
