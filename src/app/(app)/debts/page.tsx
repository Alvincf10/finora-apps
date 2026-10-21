"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency, DebtKind } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

type Debt = {
  _id: string;
  name: string;
  kind?: DebtKind;
  originalAmount: number;
  remainingAmount: number;
  currency: Currency;
  status: string;
  dueDate?: string;
  plannedPayment?: number;
  minimumPayment?: number;
  installmentMonths?: number;
  interestRate?: number;
};

type Account = {
  _id: string;
  name: string;
  currency: Currency;
  isActive: boolean;
};

type SimContext = {
  currency: Currency;
  income: number;
  spareCashFlow: number;
  suggestedBudget: number;
  cycleLabel: string;
};

const TENOR_PRESETS = [1, 3, 6, 9, 12, 18, 24];

function toDateInput(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

/** Monthly cicilan for selected tenor (minor units). */
function monthlyForTenor(remainingAmount: number, months: number) {
  if (remainingAmount <= 0 || months <= 0) return 0;
  return Math.ceil(remainingAmount / months);
}

function defaultTenor(debt: Debt) {
  if (debt.installmentMonths && debt.installmentMonths > 0) {
    return debt.installmentMonths;
  }
  const monthly = debt.plannedPayment ?? debt.minimumPayment ?? 0;
  if (monthly > 0 && debt.remainingAmount > 0) {
    return Math.max(1, Math.ceil(debt.remainingAmount / monthly));
  }
  return 6;
}

function progressPct(debt: Debt) {
  if (debt.originalAmount <= 0) return 0;
  const paid = Math.max(0, debt.originalAmount - debt.remainingAmount);
  return Math.min(100, Math.round((paid / debt.originalAmount) * 100));
}

function statusLabel(
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  if (status === "ACTIVE") return t("debts.statusActive");
  if (status === "PAID") return t("debts.statusPaid");
  if (status === "CANCELLED") return t("debts.statusCancelled");
  return status;
}

function kindLabel(
  kind: DebtKind | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  if (kind === "MORTGAGE") return t("debts.kindMortgage");
  if (kind === "OTHER") return t("debts.kindOther");
  return t("debts.kindConsumer");
}

export default function DebtsPage() {
  const { t, intlLocale } = useI18n();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");
  const [createMonths, setCreateMonths] = useState(6);
  const [createAmountMajor, setCreateAmountMajor] = useState(0);

  /** Live tenor simulation per debt (not yet saved). */
  const [tenorByDebt, setTenorByDebt] = useState<Record<string, number>>({});
  const [savingTenor, setSavingTenor] = useState<string | null>(null);

  const [simCtx, setSimCtx] = useState<SimContext | null>(null);

  const money = (amount: number, currency: Currency) =>
    formatMoney(amount, currency, intlLocale);

  async function load() {
    const [debtList, accountList, ctx] = await Promise.all([
      api<Debt[]>("/api/debts"),
      api<Account[]>("/api/accounts"),
      api<SimContext>("/api/debts/simulate"),
    ]);
    setDebts(debtList);
    setAccounts(accountList.filter((a) => a.isActive));
    setSimCtx(ctx);
    setTenorByDebt((prev) => {
      const next: Record<string, number> = {};
      for (const d of debtList) {
        next[d._id] = prev[d._id] ?? defaultTenor(d);
      }
      return next;
    });
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  const thisMonthByCurrency = useMemo(() => {
    const map = new Map<Currency, number>();
    for (const debt of debts) {
      if (debt.status !== "ACTIVE" || debt.remainingAmount <= 0) continue;
      const months = tenorByDebt[debt._id] ?? defaultTenor(debt);
      const monthly = monthlyForTenor(debt.remainingAmount, months);
      map.set(debt.currency, (map.get(debt.currency) ?? 0) + monthly);
    }
    return [...map.entries()];
  }, [debts, tenorByDebt]);

  function setTenor(debtId: string, months: number) {
    const safe = Math.min(600, Math.max(1, Math.floor(months) || 1));
    setTenorByDebt((prev) => ({ ...prev, [debtId]: safe }));
  }

  /** Persist cicilan so Dashboard / pay-cycle use monthly amount, not full remaining. */
  async function saveCicilan(debt: Debt, monthsOverride?: number) {
    const months =
      monthsOverride ?? tenorByDebt[debt._id] ?? defaultTenor(debt);
    const safe = Math.min(600, Math.max(1, Math.floor(months) || 1));
    setTenorByDebt((prev) => ({ ...prev, [debt._id]: safe }));
    const plannedPayment = monthlyForTenor(debt.remainingAmount, safe);
    setSavingTenor(debt._id);
    try {
      await api(`/api/debts/${debt._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          plannedPayment,
          installmentMonths: safe,
        }),
      });
      toast.success(
        t("debts.installmentSaved", {
          name: debt.name,
          amount: money(plannedPayment, debt.currency),
          months: safe,
        })
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    } finally {
      setSavingTenor(null);
    }
  }

  function pickTenor(debt: Debt, months: number) {
    setTenor(debt._id, months);
    void saveCicilan(debt, months);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    try {
      const originalAmount = toMinorUnits(
        Number(form.get("originalAmount")),
        currency
      );
      const months = Math.max(1, Number(form.get("installmentMonths")) || 6);
      const monthlyRaw = Number(form.get("plannedPayment"));
      const plannedPayment =
        monthlyRaw > 0
          ? toMinorUnits(monthlyRaw, currency)
          : monthlyForTenor(originalAmount, months);

      await api("/api/debts", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          kind: (form.get("kind") as DebtKind) || "CONSUMER",
          originalAmount,
          currency,
          dueDate: form.get("dueDate") || undefined,
          plannedPayment,
          installmentMonths: months,
        }),
      });
      toast.success(t("debts.created"));
      setOpen(false);
      setCreateAmountMajor(0);
      setCreateMonths(6);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, debt: Debt) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const monthsRaw = Number(form.get("installmentMonths"));
      const monthlyRaw = Number(form.get("plannedPayment"));
      const originalAmount = toMinorUnits(
        Number(form.get("originalAmount")),
        debt.currency
      );
      const months = monthsRaw > 0 ? monthsRaw : undefined;
      const plannedPayment =
        monthlyRaw > 0
          ? toMinorUnits(monthlyRaw, debt.currency)
          : months
            ? monthlyForTenor(
                // remaining after original correction is handled server-side;
                // for preview use current remaining ratio approximation
                debt.remainingAmount > 0
                  ? Math.round(
                      (originalAmount * debt.remainingAmount) /
                        debt.originalAmount
                    )
                  : originalAmount,
                months
              )
            : undefined;

      await api(`/api/debts/${debt._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          kind: (form.get("kind") as DebtKind) || undefined,
          originalAmount,
          dueDate: form.get("dueDate") || undefined,
          status: form.get("status") || undefined,
          plannedPayment,
          installmentMonths: months,
        }),
      });
      toast.success(t("debts.updated"));
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    }
  }

  async function onPay(e: React.FormEvent<HTMLFormElement>, debtId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const debt = debts.find((d) => d._id === debtId);
    if (!debt) return;
    try {
      await api(`/api/debts/${debtId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          accountId: form.get("accountId"),
          amount: toMinorUnits(Number(form.get("amount")), debt.currency),
          date: form.get("date"),
        }),
      });
      toast.success(t("debts.paymentRecorded"));
      setPayOpen(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    }
  }

  const createPreviewMonthly =
    createAmountMajor > 0 && createMonths > 0
      ? monthlyForTenor(
          toMinorUnits(createAmountMajor, formCurrency),
          createMonths
        )
      : 0;

  const spare = simCtx?.spareCashFlow ?? 0;
  const primaryCurrency = simCtx?.currency ?? "IDR";
  const primaryThisMonth =
    thisMonthByCurrency.find(([c]) => c === primaryCurrency)?.[1] ??
    thisMonthByCurrency[0]?.[1] ??
    0;
  const affordOk = spare <= 0 || primaryThisMonth <= spare;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("debts.title")}
          </h1>
          <p className="text-muted-foreground">{t("debts.subtitle")}</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) {
              setFormCurrency("IDR");
              setCreateMonths(6);
              setCreateAmountMajor(0);
            }
          }}
        >
          <DialogTrigger render={<Button />}>{t("debts.add")}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("debts.newDebt")}</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input name="name" required />
              </div>
              <div className="space-y-2">
                <Label>{t("debts.kind")}</Label>
                <select
                  name="kind"
                  defaultValue="CONSUMER"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="CONSUMER">{t("debts.kindConsumer")}</option>
                  <option value="MORTGAGE">{t("debts.kindMortgage")}</option>
                  <option value="OTHER">{t("debts.kindOther")}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("debts.totalDebtAmount")}</Label>
                  <CurrencyAmountInput
                    name="originalAmount"
                    currency={formCurrency}
                    required
                    onValueChange={setCreateAmountMajor}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.currency")}</Label>
                  <select
                    name="currency"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    value={formCurrency}
                    onChange={(e) =>
                      setFormCurrency(e.target.value as Currency)
                    }
                  >
                    <option value="IDR">IDR</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("debts.howManyMonths")}</Label>
                <div className="flex flex-wrap gap-2">
                  {TENOR_PRESETS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={createMonths === m ? "default" : "outline"}
                      onClick={() => setCreateMonths(m)}
                    >
                      {t("debts.monthsShort", { months: m })}
                    </Button>
                  ))}
                </div>
                <Input
                  name="installmentMonths"
                  type="number"
                  min={1}
                  max={600}
                  value={createMonths}
                  onChange={(e) =>
                    setCreateMonths(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
              {createPreviewMonthly > 0 ? (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {t("debts.payThisMonthApprox")}
                  </span>
                  <span className="font-mono font-semibold">
                    {money(createPreviewMonthly, formCurrency)}
                  </span>
                  <span className="text-muted-foreground">
                    {t("debts.timesMonths", { months: createMonths })}
                  </span>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>{t("debts.firstDueOptional")}</Label>
                <Input name="dueDate" type="date" />
              </div>
              <Button type="submit" className="w-full">
                {t("common.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {thisMonthByCurrency.length > 0 ? (
        <Card className="border-primary/25 bg-gradient-to-br from-primary/5 via-background to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">{t("debts.payThisMonth")}</CardTitle>
            <CardDescription>
              {t("debts.payThisMonthDesc")}
              {simCtx?.cycleLabel ? ` · ${simCtx.cycleLabel}` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                {thisMonthByCurrency.map(([currency, total]) => (
                  <p
                    key={currency}
                    className="font-heading text-3xl font-semibold tracking-tight"
                  >
                    {money(total, currency)}
                  </p>
                ))}
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("debts.fromActiveDebts", {
                    count: debts.filter((d) => d.status === "ACTIVE").length,
                  })}
                </p>
              </div>
              {simCtx && simCtx.spareCashFlow > 0 ? (
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">
                    {t("debts.estimatedCashLeft")}
                  </p>
                  <p className="font-mono">
                    {money(simCtx.spareCashFlow, simCtx.currency)}
                  </p>
                  <Badge
                    className="mt-1"
                    variant={affordOk ? "secondary" : "outline"}
                  >
                    {affordOk
                      ? t("debts.withinBudget")
                      : t("debts.overSpare")}
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {debts.map((debt) => {
          const months = tenorByDebt[debt._id] ?? defaultTenor(debt);
          const monthly = monthlyForTenor(debt.remainingAmount, months);
          const savedMonthly =
            debt.plannedPayment ?? debt.minimumPayment ?? 0;
          const dirty =
            debt.status === "ACTIVE" &&
            (debt.installmentMonths !== months ||
              (savedMonthly > 0 && savedMonthly !== monthly) ||
              savedMonthly === 0);
          const pct = progressPct(debt);

          return (
            <Card key={debt._id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{debt.name}</span>
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    <Badge variant="outline">
                      {kindLabel(debt.kind, t)}
                    </Badge>
                    <Badge
                      variant={
                        debt.status === "ACTIVE" ? "secondary" : "outline"
                      }
                    >
                      {statusLabel(debt.status, t)}
                    </Badge>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("debts.remaining")}
                  </span>
                  <span className="font-mono">
                    {money(debt.remainingAmount, debt.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("debts.original")}
                  </span>
                  <span className="font-mono">
                    {money(debt.originalAmount, debt.currency)}
                  </span>
                </div>

                {debt.status === "ACTIVE" && debt.remainingAmount > 0 ? (
                  <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("debts.howManyMonths")}
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {TENOR_PRESETS.map((m) => (
                          <Button
                            key={m}
                            type="button"
                            size="sm"
                            variant={months === m ? "default" : "outline"}
                            className="h-8 px-2.5"
                            onClick={() => pickTenor(debt, m)}
                          >
                            {m}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={600}
                          className="h-9 w-24"
                          value={months}
                          onChange={(e) =>
                            setTenor(debt._id, Number(e.target.value))
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {t("debts.monthsUnit")}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-primary/20 bg-background px-3 py-2.5">
                      <p className="text-xs text-muted-foreground">
                        {t("debts.payThisMonth")}
                      </p>
                      <p className="font-heading text-2xl font-semibold tabular-nums">
                        {money(monthly, debt.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("debts.dividedByMonths", {
                          amount: money(debt.remainingAmount, debt.currency),
                          months,
                        })}
                        {debt.dueDate
                          ? ` · ${t("debts.dueOn", {
                              date: new Date(debt.dueDate).toLocaleDateString(
                                intlLocale,
                                {
                                  day: "numeric",
                                  month: "short",
                                }
                              ),
                            })}`
                          : ""}
                      </p>
                    </div>

                    {dirty ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={savingTenor === debt._id}
                        onClick={() => saveCicilan(debt)}
                      >
                        {savingTenor === debt._id
                          ? t("debts.savingInstallment")
                          : t("debts.saveInstallment")}
                      </Button>
                    ) : (
                      <p className="text-center text-xs text-muted-foreground">
                        {t("debts.installmentPersisted", {
                          amount: money(savedMonthly, debt.currency),
                        })}
                      </p>
                    )}
                  </div>
                ) : null}

                {debt.status === "ACTIVE" && debt.originalAmount > 0 ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("debts.progressPaid")}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Dialog
                    open={editOpen === debt._id}
                    onOpenChange={(v) => setEditOpen(v ? debt._id : null)}
                  >
                    <DialogTrigger
                      render={<Button variant="outline" className="flex-1" />}
                    >
                      {t("common.edit")}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t("debts.editDebt", { name: debt.name })}
                        </DialogTitle>
                      </DialogHeader>
                      <form
                        key={debt._id + String(debt.originalAmount) + debt.name}
                        className="space-y-3"
                        onSubmit={(e) => onEdit(e, debt)}
                      >
                        <div className="space-y-2">
                          <Label>{t("common.name")}</Label>
                          <Input name="name" required defaultValue={debt.name} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("debts.kind")}</Label>
                          <select
                            name="kind"
                            defaultValue={debt.kind ?? "CONSUMER"}
                            className="flex h-9 w-full rounded-md border px-3 text-sm"
                          >
                            <option value="CONSUMER">
                              {t("debts.kindConsumer")}
                            </option>
                            <option value="MORTGAGE">
                              {t("debts.kindMortgage")}
                            </option>
                            <option value="OTHER">
                              {t("debts.kindOther")}
                            </option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("debts.originalAmount")}</Label>
                          <CurrencyAmountInput
                            name="originalAmount"
                            currency={debt.currency}
                            defaultValue={fromMinorUnits(
                              debt.originalAmount,
                              debt.currency
                            )}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>{t("debts.monthlyInstallment")}</Label>
                            <CurrencyAmountInput
                              name="plannedPayment"
                              currency={debt.currency}
                              allowEmpty
                              defaultValue={
                                monthly > 0
                                  ? fromMinorUnits(monthly, debt.currency)
                                  : undefined
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("debts.tenorMonths")}</Label>
                            <Input
                              name="installmentMonths"
                              type="number"
                              min={1}
                              max={600}
                              defaultValue={months}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("debts.dueDate")}</Label>
                          <Input
                            name="dueDate"
                            type="date"
                            defaultValue={toDateInput(debt.dueDate)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("common.status")}</Label>
                          <select
                            name="status"
                            className="flex h-9 w-full rounded-md border px-3 text-sm"
                            defaultValue={debt.status}
                          >
                            <option value="ACTIVE">
                              {t("debts.statusActive")}
                            </option>
                            <option value="PAID">{t("debts.statusPaid")}</option>
                            <option value="CANCELLED">
                              {t("debts.statusCancelled")}
                            </option>
                          </select>
                        </div>
                        <Button type="submit" className="w-full">
                          {t("debts.saveChanges")}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  {debt.status === "ACTIVE" ? (
                    <Dialog
                      open={payOpen === debt._id}
                      onOpenChange={(v) => setPayOpen(v ? debt._id : null)}
                    >
                      <DialogTrigger
                        render={<Button variant="outline" className="flex-1" />}
                      >
                        {t("debts.recordPayment")}
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            {t("debts.payDebt", { name: debt.name })}
                          </DialogTitle>
                        </DialogHeader>
                        <form
                          className="space-y-3"
                          onSubmit={(e) => onPay(e, debt._id)}
                        >
                          <div className="space-y-2">
                            <Label>{t("transactions.fromAccount")}</Label>
                            <select
                              name="accountId"
                              className="flex h-9 w-full rounded-md border px-3 text-sm"
                              required
                            >
                              {accounts
                                .filter((a) => a.currency === debt.currency)
                                .map((a) => (
                                  <option key={a._id} value={a._id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("common.amount")}</Label>
                            <CurrencyAmountInput
                              name="amount"
                              currency={debt.currency}
                              required
                              defaultValue={
                                monthly > 0
                                  ? fromMinorUnits(monthly, debt.currency)
                                  : undefined
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("common.date")}</Label>
                            <Input
                              name="date"
                              type="date"
                              required
                              defaultValue={new Date()
                                .toISOString()
                                .slice(0, 10)}
                            />
                          </div>
                          <Button type="submit" className="w-full">
                            {t("debts.savePayment")}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {debts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("debts.emptyHint")}</p>
      ) : null}
    </div>
  );
}
