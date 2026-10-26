"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
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

type FixedCost = {
  _id: string;
  name: string;
  amount: number;
  currency: Currency;
  dueDay: number;
  isActive: boolean;
  notes?: string;
  paidThisCycle?: boolean;
  paidFromAccountId?: string;
  paidFromAccountName?: string;
  cycleLabel?: string;
};

type Account = {
  _id: string;
  name: string;
  type: string;
  currency: Currency;
  currentBalance: number;
  isActive: boolean;
};

export default function FixedCostsPage() {
  const { t, intlLocale } = useI18n();
  const [items, setItems] = useState<FixedCost[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  async function load() {
    const [list, accountList] = await Promise.all([
      api<FixedCost[]>("/api/fixed-costs"),
      api<Account[]>("/api/accounts"),
    ]);
    setItems(list);
    setAccounts(
      accountList.filter(
        (a) => a.isActive && ["BANK", "CASH", "E_WALLET"].includes(a.type)
      )
    );
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    try {
      await api("/api/fixed-costs", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          amount: toMinorUnits(Number(form.get("amount")), currency),
          currency,
          dueDay: Number(form.get("dueDay")),
          notes: form.get("notes") || undefined,
        }),
      });
      toast.success(t("fixedCosts.created"));
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, item: FixedCost) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api(`/api/fixed-costs/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          amount: toMinorUnits(Number(form.get("amount")), item.currency),
          dueDay: Number(form.get("dueDay")),
          isActive: form.get("isActive") === "true",
          notes: form.get("notes") || undefined,
        }),
      });
      toast.success(t("fixedCosts.updated"));
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onDelete(id: string) {
    try {
      await api(`/api/fixed-costs/${id}`, { method: "DELETE" });
      toast.success(t("common.deleted"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onPay(e: React.FormEvent<HTMLFormElement>, item: FixedCost) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const accountId = String(form.get("accountId") || "");
    if (!accountId) {
      toast.error(t("fixedCosts.selectAccountFirst"));
      return;
    }
    const account = accounts.find((a) => a._id === accountId);
    setPaying(true);
    try {
      const result = await api<{
        alreadyPaidThisCycle?: boolean;
        fundingAccountId?: string;
        fundingBalance?: number;
      }>(`/api/fixed-costs/${item._id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          accountId,
          amount: toMinorUnits(Number(form.get("amount")), item.currency),
          date: form.get("date") || undefined,
          notes: form.get("notes") || undefined,
        }),
      });
      if (result.alreadyPaidThisCycle) {
        toast.success(t("fixedCosts.alreadyPaid"));
      } else {
        toast.success(
          t("fixedCosts.paymentRecorded", {
            account: account?.name ?? "account",
            balance: formatMoney(
              result.fundingBalance ?? 0,
              item.currency,
              intlLocale
            ),
          })
        );
      }
      setPayOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setPaying(false);
    }
  }

  async function onChangeSource(
    e: React.FormEvent<HTMLFormElement>,
    item: FixedCost
  ) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const accountId = String(form.get("accountId") || "");
    if (!accountId) {
      toast.error(t("fixedCosts.selectAccountFirst"));
      return;
    }
    const account = accounts.find((a) => a._id === accountId);
    setPaying(true);
    try {
      const result = await api<{ fundingBalance?: number }>(
        `/api/fixed-costs/${item._id}/pay`,
        {
          method: "PATCH",
          body: JSON.stringify({ accountId }),
        }
      );
      toast.success(
        t("fixedCosts.changeSourceDone", {
          account: account?.name ?? "account",
          balance: formatMoney(
            result.fundingBalance ?? 0,
            item.currency,
            intlLocale
          ),
        })
      );
      setSourceOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setPaying(false);
    }
  }

  const activeTotal = items
    .filter((i) => i.isActive && i.currency === "IDR")
    .reduce((sum, i) => sum + i.amount, 0);

  const today = new Date().toISOString().slice(0, 10);

  function fundingAccountsFor(currency: Currency) {
    return accounts.filter((a) => a.currency === currency);
  }

  /** Prefer dedicated fixed-cost pocket (e.g. ATM Fixed cost). */
  function preferredFundingAccountId(currency: Currency) {
    const list = fundingAccountsFor(currency);
    return (
      list.find((a) => /fixed/i.test(a.name))?._id ??
      list.find((a) => /bca/i.test(a.name))?._id ??
      list[0]?._id ??
      ""
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("fixedCosts.title")}
          </h1>
          <p className="text-muted-foreground">{t("fixedCosts.subtitle")}</p>
          {items[0]?.cycleLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Cycle: {items[0].cycleLabel}
            </p>
          ) : null}
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) setFormCurrency("IDR");
          }}
        >
          <DialogTrigger render={<Button />}>
            {t("fixedCosts.add")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("fixedCosts.newItem")}</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input
                  name="name"
                  required
                  placeholder={t("fixedCosts.namePlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("common.amount")}</Label>
                  <CurrencyAmountInput
                    name="amount"
                    currency={formCurrency}
                    required
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
                <Label>{t("fixedCosts.dueDayLabel")}</Label>
                <Input
                  name="dueDay"
                  type="number"
                  min={1}
                  max={31}
                  required
                  placeholder="30"
                />
                <p className="text-xs text-muted-foreground">
                  {t("fixedCosts.dueDayHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("common.notes")}</Label>
                <Input name="notes" placeholder={t("common.optional")} />
              </div>
              <Button type="submit" className="w-full">
                {t("common.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {activeTotal > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("fixedCosts.totalActive")}</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatMoney(activeTotal, "IDR", intlLocale)}
              {t("fixedCosts.perMonth")}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Card
            key={item._id}
            className={
              item.paidThisCycle
                ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
                : undefined
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{item.name}</span>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {item.paidThisCycle ? (
                    <Badge variant="secondary">
                      {t("fixedCosts.paidThisCycle")}
                    </Badge>
                  ) : null}
                  <Badge variant={item.isActive ? "secondary" : "outline"}>
                    {item.isActive
                      ? t("fixedCosts.statusOn")
                      : t("fixedCosts.statusOff")}
                  </Badge>
                </div>
              </CardTitle>
              <CardDescription>
                {t("fixedCosts.dueEvery", { day: item.dueDay })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-mono text-xl">
                {formatMoney(item.amount, item.currency, intlLocale)}
              </p>
              {item.paidThisCycle && item.paidFromAccountName ? (
                <p className="text-xs text-muted-foreground">
                  {t("fixedCosts.paidFrom", {
                    account: item.paidFromAccountName,
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {item.isActive && item.paidThisCycle ? (
                  <Dialog
                    open={sourceOpen === item._id}
                    onOpenChange={(v) => setSourceOpen(v ? item._id : null)}
                  >
                    <DialogTrigger
                      render={
                        <Button
                          variant="secondary"
                          className="min-w-[7.5rem] flex-1 touch-manipulation"
                          disabled={
                            fundingAccountsFor(item.currency).length === 0
                          }
                        />
                      }
                    >
                      {t("fixedCosts.changeSource")}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t("fixedCosts.changeSourceTitle", {
                            name: item.name,
                          })}
                        </DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        {t("fixedCosts.changeSourceHint")}
                      </p>
                      <form
                        className="space-y-3"
                        onSubmit={(e) => onChangeSource(e, item)}
                      >
                        <div className="space-y-2">
                          <Label>{t("fixedCosts.selectAccount")}</Label>
                          <select
                            name="accountId"
                            required
                            defaultValue={
                              item.paidFromAccountId ||
                              preferredFundingAccountId(item.currency)
                            }
                            className="flex h-9 w-full rounded-md border px-3 text-sm"
                          >
                            {fundingAccountsFor(item.currency).map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.name} ·{" "}
                                {formatMoney(
                                  a.currentBalance,
                                  a.currency,
                                  intlLocale
                                )}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={paying}
                        >
                          {t("fixedCosts.changeSource")}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : null}

                {item.isActive && !item.paidThisCycle ? (
                  <Dialog
                    open={payOpen === item._id}
                    onOpenChange={(v) => setPayOpen(v ? item._id : null)}
                  >
                    <DialogTrigger
                      render={
                        <Button
                          className="min-w-[7.5rem] flex-1 touch-manipulation"
                          disabled={
                            fundingAccountsFor(item.currency).length === 0
                          }
                          title={
                            fundingAccountsFor(item.currency).length === 0
                              ? t("fixedCosts.noFundingAccounts")
                              : undefined
                          }
                        />
                      }
                    >
                      <Check className="size-3.5" />
                      {t("fixedCosts.pay")}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t("fixedCosts.payTitle", { name: item.name })}
                        </DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        {t("fixedCosts.payHint")}
                      </p>
                      <form
                        className="space-y-3"
                        onSubmit={(e) => onPay(e, item)}
                      >
                        <div className="space-y-2">
                          <Label>{t("fixedCosts.selectAccount")}</Label>
                          <select
                            name="accountId"
                            required
                            defaultValue={preferredFundingAccountId(
                              item.currency
                            )}
                            className="flex h-9 w-full rounded-md border px-3 text-sm"
                          >
                            {fundingAccountsFor(item.currency).map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.name} ·{" "}
                                {formatMoney(
                                  a.currentBalance,
                                  a.currency,
                                  intlLocale
                                )}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("common.amount")}</Label>
                          <CurrencyAmountInput
                            name="amount"
                            currency={item.currency}
                            required
                            defaultValue={fromMinorUnits(
                              item.amount,
                              item.currency
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("fixedCosts.payDate")}</Label>
                          <Input
                            name="date"
                            type="date"
                            required
                            defaultValue={today}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("common.notes")}</Label>
                          <Input
                            name="notes"
                            defaultValue={item.notes ?? ""}
                            placeholder={t("common.optional")}
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={paying}
                        >
                          {t("fixedCosts.pay")}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : null}

                <Dialog
                  open={editOpen === item._id}
                  onOpenChange={(v) => setEditOpen(v ? item._id : null)}
                >
                  <DialogTrigger
                    render={
                      <Button
                        variant="outline"
                        className="flex-1 touch-manipulation"
                      />
                    }
                  >
                    {t("common.edit")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {t("common.editNamed", { name: item.name })}
                      </DialogTitle>
                    </DialogHeader>
                    <form
                      key={item._id + String(item.amount) + item.dueDay}
                      className="space-y-3"
                      onSubmit={(e) => onEdit(e, item)}
                    >
                      <div className="space-y-2">
                        <Label>{t("common.name")}</Label>
                        <Input name="name" required defaultValue={item.name} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.amount")}</Label>
                        <CurrencyAmountInput
                          name="amount"
                          currency={item.currency}
                          required
                          defaultValue={fromMinorUnits(
                            item.amount,
                            item.currency
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("fixedCosts.dueDay")}</Label>
                        <Input
                          name="dueDay"
                          type="number"
                          min={1}
                          max={31}
                          required
                          defaultValue={item.dueDay}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.status")}</Label>
                        <select
                          name="isActive"
                          className="flex h-9 w-full rounded-md border px-3 text-sm"
                          defaultValue={item.isActive ? "true" : "false"}
                        >
                          <option value="true">{t("fixedCosts.statusOn")}</option>
                          <option value="false">
                            {t("fixedCosts.statusOff")}
                          </option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.notes")}</Label>
                        <Input name="notes" defaultValue={item.notes ?? ""} />
                      </div>
                      <Button type="submit" className="w-full">
                        {t("common.saveChanges")}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  className="flex-1 touch-manipulation"
                  onClick={() => onDelete(item._id)}
                >
                  {t("common.delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("fixedCosts.empty")}</p>
      ) : null}
    </div>
  );
}
