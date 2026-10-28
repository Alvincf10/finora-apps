"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Coins, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import { projectGoldMonths } from "@/lib/financial/gold-installment";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
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

type Scenario = {
  id: "HEMAT" | "STANDAR" | "LONGGAR";
  labelId: string;
  principalPay: number;
  interestDue: number;
  totalPay: number;
  remainingAfter: number;
  nextInterestAfter: number;
  estimatedMonthsLeft: number;
};

type GoldPlanRow = {
  id: string;
  name: string;
  currency: Currency;
  status: string;
  principal: number;
  remainingPrincipal: number;
  monthlyRatePercent: number;
  startDate: string;
  paidRecorded: number;
  paymentCount: number;
  principalPaid: number;
  interestPaid: number;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    notes?: string | null;
    principalPortion: number;
    interestPortion: number;
  }>;
  recommendation: {
    monthlyRatePercent: number;
    remainingPrincipal: number;
    interestDueNow: number;
    principalPaid: number;
    interestPaid: number;
    paidRecorded: number;
    originalPrincipal: number;
    recommendedMonthsLeft: number | null;
    scenarios: Scenario[];
  };
};

type GoldResponse = { plan: GoldPlanRow | null };

export const GOLD_UNLOCK_KEY = "finora.weekly.gold";

export function isGoldUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(GOLD_UNLOCK_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return new URLSearchParams(window.location.search).has("gold");
}

export function unlockGold(): void {
  try {
    sessionStorage.setItem(GOLD_UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

function toDateInput(iso?: string) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return new Date(iso).toISOString().slice(0, 10);
}

export function GoldPanel() {
  const { t, intlLocale } = useI18n();
  const [data, setData] = useState<GoldResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  const [name, setName] = useState("Gold");
  const [principalMajor, setPrincipalMajor] = useState(0);
  const [rate, setRate] = useState(3);
  const [startDate, setStartDate] = useState(toDateInput());
  const [planPokokMajor, setPlanPokokMajor] = useState(0);
  const [payPokokMajor, setPayPokokMajor] = useState(0);
  const [payBungaMajor, setPayBungaMajor] = useState(0);
  const [payDate, setPayDate] = useState(toDateInput());
  const [payNotes, setPayNotes] = useState("");

  const currency: Currency = data?.plan?.currency ?? "IDR";

  const money = useCallback(
    (amount: number, cur: Currency = currency) =>
      formatMoney(amount, cur, intlLocale),
    [currency, intlLocale]
  );

  function resetPayForm() {
    setPayPokokMajor(0);
    setPayBungaMajor(0);
    setPayDate(toDateInput());
    setPayNotes("");
    setEditingPaymentId(null);
  }

  function startEditPayment(p: GoldPlanRow["payments"][number]) {
    setEditingPaymentId(p.id);
    setPayPokokMajor(fromMinorUnits(p.principalPortion, currency));
    setPayBungaMajor(fromMinorUnits(p.interestPortion, currency));
    setPayDate(toDateInput(p.date));
    setPayNotes(p.notes ?? "");
    setPayOpen(true);
  }

  const load = useCallback(async () => {
    const res = await api<GoldResponse>("/api/reports/weekly/gold");
    setData(res);
    if (res.plan) {
      const cur = res.plan.currency;
      setName(res.plan.name);
      setPrincipalMajor(fromMinorUnits(res.plan.principal, cur));
      setRate(res.plan.monthlyRatePercent || 3);
      setStartDate(toDateInput(res.plan.startDate));
      const standar = res.plan.recommendation.scenarios.find(
        (s) => s.id === "STANDAR"
      );
      setPlanPokokMajor(
        fromMinorUnits(
          standar?.principalPay ??
            Math.ceil(res.plan.remainingPrincipal / 4),
          cur
        )
      );
      setEditing(false);
    } else {
      setEditing(true);
    }
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  const plan = data?.plan ?? null;
  const rec = plan?.recommendation;

  const projection = useMemo(() => {
    if (!plan) return [];
    return projectGoldMonths({
      remainingPrincipal: plan.remainingPrincipal,
      monthlyRatePercent: plan.monthlyRatePercent,
      principalPayPerMonth: toMinorUnits(Math.max(0, planPokokMajor), currency),
      monthsAhead: 2,
    });
  }, [plan, planPokokMajor, currency]);

  async function savePlan(e: FormEvent) {
    e.preventDefault();
    if (principalMajor <= 0) {
      toast.error(t("reports.goldNeedPrincipal"));
      return;
    }
    setSaving(true);
    try {
      const hasExisting = Boolean(data?.plan);
      await api<GoldResponse>("/api/reports/weekly/gold", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim() || "Gold",
          currency,
          principal: toMinorUnits(principalMajor, currency),
          monthlyRatePercent: rate,
          startDate,
          resetPayments: !hasExisting,
        }),
      });
      toast.success(t("reports.goldSaved"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function savePayment(e: FormEvent) {
    e.preventDefault();
    if (payPokokMajor <= 0 && payBungaMajor <= 0) {
      toast.error(t("reports.goldNeedPaymentSplit"));
      return;
    }
    setSaving(true);
    try {
      const principalPortion =
        payPokokMajor > 0 ? toMinorUnits(payPokokMajor, currency) : 0;
      const interestPortion =
        payBungaMajor > 0 ? toMinorUnits(payBungaMajor, currency) : 0;

      if (editingPaymentId) {
        await api("/api/reports/weekly/gold", {
          method: "POST",
          body: JSON.stringify({
            action: "edit_payment",
            paymentId: editingPaymentId,
            principalPortion,
            interestPortion,
            date: payDate,
            notes: payNotes.trim() || null,
          }),
        });
        toast.success(t("reports.goldPaymentUpdated"));
      } else {
        await api("/api/reports/weekly/gold", {
          method: "POST",
          body: JSON.stringify({
            action: "add_payment",
            principalPortion,
            interestPortion,
            amount: principalPortion + interestPortion,
            date: payDate,
            notes: payNotes.trim() || undefined,
          }),
        });
        toast.success(t("reports.goldPaymentSaved"));
      }
      setPayOpen(false);
      resetPayForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(paymentId: string) {
    setSaving(true);
    try {
      await api("/api/reports/weekly/gold", {
        method: "POST",
        body: JSON.stringify({ action: "delete_payment", paymentId }),
      });
      toast.success(t("reports.goldPaymentDeleted"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">{t("reports.goldLoading")}</p>
    );
  }

  const thisMonth = projection[0];
  const afterPay = projection[0]
    ? Math.max(
        0,
        (plan?.remainingPrincipal ?? 0) - (thisMonth?.principalPay ?? 0)
      )
    : 0;

  return (
    <Card className="border-amber-500/25 bg-gradient-to-br from-amber-50/80 via-card to-card ring-1 ring-amber-500/20 dark:from-amber-950/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading">
              <Coins className="size-5 text-amber-700 dark:text-amber-400" />
              {plan?.name ?? t("reports.goldTitle")}
              <Badge variant="outline" className="font-normal">
                {t("reports.goldHiddenBadge")}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {t("reports.goldSubtitleSimple")}
            </CardDescription>
          </div>
          {plan && !editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              {t("reports.goldEdit")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(editing || !plan) && (
          <form onSubmit={savePlan} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("reports.goldPokokPinjaman")}</Label>
              <CurrencyAmountInput
                currency={currency}
                value={principalMajor}
                onValueChange={setPrincipalMajor}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gold-rate">{t("reports.goldMonthlyRate")}</Label>
              <Input
                id="gold-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gold-name">{t("reports.goldName")}</Label>
              <Input
                id="gold-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gold-start">{t("reports.goldStartDate")}</Label>
              <Input
                id="gold-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving} size="sm">
                {t("reports.goldSavePlan")}
              </Button>
              {plan ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  {t("common.cancel")}
                </Button>
              ) : null}
            </div>
          </form>
        )}

        {plan && !editing && rec ? (
          <>
            {/* Compact status */}
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("reports.goldPaidTotal")}
                </p>
                <p className="font-mono font-medium tabular-nums">
                  {money(plan.paidRecorded)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("reports.goldPaidSplitShort", {
                    principal: money(plan.principalPaid),
                    interest: money(plan.interestPaid),
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("reports.goldRemainingPokok")}
                </p>
                <p className="font-mono font-medium tabular-nums">
                  {money(plan.remainingPrincipal)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("reports.goldOfOriginal", {
                    original: money(plan.principal),
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("reports.goldNextDueTitle")}
                </p>
                <p className="font-mono font-medium tabular-nums text-amber-800 dark:text-amber-300">
                  {money(rec.interestDueNow)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {plan.monthlyRatePercent}% × sisa pokok
                </p>
              </div>
            </div>

            {/* Plan principal + live projection */}
            <div className="space-y-3 rounded-xl bg-background/70 p-3 ring-1 ring-border/50">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1 space-y-1.5">
                  <Label>{t("reports.goldPlanPokok")}</Label>
                  <CurrencyAmountInput
                    currency={currency}
                    value={planPokokMajor}
                    onValueChange={setPlanPokokMajor}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pb-0.5">
                  {rec.scenarios.map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant={
                        Math.abs(
                          planPokokMajor -
                            fromMinorUnits(s.principalPay, currency)
                        ) < 1
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        setPlanPokokMajor(
                          fromMinorUnits(s.principalPay, currency)
                        )
                      }
                    >
                      {t(s.labelId)}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("reports.goldProjIntro", {
                  total: money(
                    (thisMonth?.principalPay ?? 0) + (thisMonth?.interestDue ?? 0)
                  ),
                })}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th className="py-1.5 pr-3 font-medium">
                        {t("reports.goldProjColWhen")}
                      </th>
                      <th className="py-1.5 pr-3 font-medium">
                        {t("reports.goldRemainingPokok")}
                      </th>
                      <th className="py-1.5 pr-3 font-medium">
                        {t("reports.goldBunga")}
                      </th>
                      <th className="py-1.5 font-medium">
                        {t("reports.goldProjColBayar")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs tabular-nums sm:text-sm">
                    {projection.map((row, idx) => {
                      const label =
                        row.offset === 0
                          ? t("reports.goldProjThisMonth")
                          : row.offset === 1
                            ? t("reports.goldProjNextMonth")
                            : t("reports.goldProjMonthN", { n: row.offset });
                      const sisaSetelah =
                        idx === 0
                          ? afterPay
                          : Math.max(
                              0,
                              row.remainingPrincipal - row.principalPay
                            );
                      return (
                        <tr
                          key={row.offset}
                          className="border-b border-border/40"
                        >
                          <td className="py-2 pr-3 font-sans text-foreground">
                            {label}
                          </td>
                          <td className="py-2 pr-3">
                            <span>{money(row.remainingPrincipal)}</span>
                            {row.principalPay > 0 ? (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                → {money(sisaSetelah)}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3">{money(row.interestDue)}</td>
                          <td className="py-2">{money(row.totalPay)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPayPokokMajor(planPokokMajor);
                  setPayBungaMajor(
                    fromMinorUnits(rec.interestDueNow, currency)
                  );
                  setPayDate(toDateInput());
                  setPayNotes("");
                  setEditingPaymentId(null);
                  setPayOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t("reports.goldUsePlanPay")}
              </Button>
            </div>

            {/* Payments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("reports.goldPaymentsTitle")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (payOpen) {
                      setPayOpen(false);
                      resetPayForm();
                    } else {
                      resetPayForm();
                      setPayBungaMajor(
                        fromMinorUnits(rec.interestDueNow, currency)
                      );
                      setPayOpen(true);
                    }
                  }}
                >
                  <Plus className="size-4" />
                  {t("reports.goldAddPayment")}
                </Button>
              </div>

              {payOpen ? (
                <form
                  onSubmit={savePayment}
                  className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-2"
                >
                  <div className="space-y-1">
                    <Label>{t("reports.goldPayPokok")}</Label>
                    <CurrencyAmountInput
                      currency={currency}
                      value={payPokokMajor}
                      onValueChange={setPayPokokMajor}
                      allowEmpty
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("reports.goldPayBunga")}</Label>
                    <CurrencyAmountInput
                      currency={currency}
                      value={payBungaMajor}
                      onValueChange={setPayBungaMajor}
                      allowEmpty
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gold-pay-date">
                      {t("reports.goldPaymentDate")}
                    </Label>
                    <Input
                      id="gold-pay-date"
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gold-pay-notes">
                      {t("reports.goldPaymentNotes")}
                    </Label>
                    <Input
                      id="gold-pay-notes"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" size="sm" disabled={saving}>
                      {editingPaymentId
                        ? t("reports.goldUpdatePayment")
                        : t("reports.goldSavePayment")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPayOpen(false);
                        resetPayForm();
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              ) : null}

              {plan.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("reports.goldPaymentsEmpty")}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {plan.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="font-mono tabular-nums">
                          {money(p.amount)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {toDateInput(p.date)} ·{" "}
                          {t("reports.goldPaymentSplit", {
                            principal: money(p.principalPortion),
                            interest: money(p.interestPortion),
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={saving}
                          onClick={() => startEditPayment(p)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={saving}
                          onClick={() => void deletePayment(p.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function GoldUnlockTitle({
  children,
  unlocked,
  onUnlock,
}: {
  children: ReactNode;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const [taps, setTaps] = useState(0);

  useEffect(() => {
    if (taps === 0) return;
    const id = window.setTimeout(() => setTaps(0), 2500);
    return () => window.clearTimeout(id);
  }, [taps]);

  return (
    <button
      type="button"
      className="group relative text-left"
      aria-label={unlocked ? undefined : "Unlock Gold"}
      onClick={() => {
        if (unlocked) return;
        const next = taps + 1;
        setTaps(next);
        if (next >= 5) {
          unlockGold();
          onUnlock();
          setTaps(0);
        }
      }}
    >
      {children}
      {!unlocked && taps > 0 ? (
        <span className="absolute -right-5 top-1 opacity-40" aria-hidden>
          <Lock className="size-3" />
        </span>
      ) : null}
    </button>
  );
}
