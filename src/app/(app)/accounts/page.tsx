"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Account = {
  _id: string;
  name: string;
  type: string;
  currency: Currency;
  currentBalance: number;
  initialBalance: number;
  isActive: boolean;
  creditLimit?: number;
  statementDueAmount?: number;
  statementDueDay?: number;
  debitMode?: boolean;
};

function isCreditCard(type: string) {
  return type === "CREDIT_CARD";
}

export default function AccountsPage() {
  const { t, intlLocale } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");
  const [createType, setCreateType] = useState("BANK");

  const editing = accounts.find((a) => a._id === editOpen) ?? null;

  async function load() {
    setAccounts(await api<Account[]>("/api/accounts"));
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    const type = String(form.get("type"));
    const cc = isCreditCard(type);
    try {
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          type,
          currency,
          initialBalance: toMinorUnits(
            Number(form.get("initialBalance")),
            currency
          ),
          ...(cc
            ? {
                creditLimit: toMinorUnits(
                  Number(form.get("creditLimit") || 0),
                  currency
                ),
                statementDueAmount: toMinorUnits(
                  Number(form.get("statementDueAmount") || 0),
                  currency
                ),
                statementDueDay: Number(form.get("statementDueDay") || 0) || undefined,
                debitMode: form.get("debitMode") === "on",
              }
            : {}),
        }),
      });
      toast.success(t("accounts.created"));
      setOpen(false);
      setCreateType("BANK");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, account: Account) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const type = String(form.get("type"));
    const cc = isCreditCard(type);
    try {
      await api(`/api/accounts/${account._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          type,
          currentBalance: toMinorUnits(
            Number(form.get("currentBalance")),
            account.currency
          ),
          ...(cc
            ? {
                creditLimit: toMinorUnits(
                  Number(form.get("creditLimit") || 0),
                  account.currency
                ),
                statementDueAmount: toMinorUnits(
                  Number(form.get("statementDueAmount") || 0),
                  account.currency
                ),
                statementDueDay:
                  Number(form.get("statementDueDay") || 0) || null,
                debitMode: form.get("debitMode") === "on",
              }
            : {
                creditLimit: null,
                statementDueAmount: null,
                statementDueDay: null,
                debitMode: false,
              }),
        }),
      });
      toast.success(t("accounts.updated"));
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function archive(id: string) {
    try {
      await api(`/api/accounts/${id}`, { method: "DELETE" });
      toast.success(t("accounts.archivedToast"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function restore(id: string) {
    try {
      await api(`/api/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      toast.success(t("accounts.restoredToast"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  function AccountActions({ account }: { account: Account }) {
    return (
      <div className="flex flex-wrap justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="touch-manipulation"
          onClick={() => setEditOpen(account._id)}
        >
          {t("common.edit")}
        </Button>
        {account.isActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="touch-manipulation"
            onClick={() => archive(account._id)}
          >
            {t("accounts.archive")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="touch-manipulation"
            onClick={() => restore(account._id)}
          >
            {t("accounts.restore")}
          </Button>
        )}
      </div>
    );
  }

  const typeOptions = (
    <>
      <option value="CASH">{t("accounts.typeCash")}</option>
      <option value="BANK">{t("accounts.typeBank")}</option>
      <option value="E_WALLET">{t("accounts.typeEWallet")}</option>
      <option value="CREDIT_CARD">{t("accounts.typeCreditCard")}</option>
      <option value="OTHER">{t("accounts.typeOther")}</option>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold">
            {t("accounts.title")}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t("accounts.subtitle")}
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) {
              setFormCurrency("IDR");
              setCreateType("BANK");
            }
          }}
        >
          <DialogTrigger
            render={<Button className="w-full touch-manipulation sm:w-auto" />}
          >
            {t("accounts.add")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("accounts.newAccount")}</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input
                  name="name"
                  required
                  placeholder={t("accounts.namePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.type")}</Label>
                <select
                  name="type"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                >
                  {typeOptions}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-2">
                  <Label>
                    {isCreditCard(createType)
                      ? t("accounts.outstanding")
                      : t("accounts.initialBalance")}
                  </Label>
                  <CurrencyAmountInput
                    name="initialBalance"
                    currency={formCurrency}
                    defaultValue={0}
                  />
                </div>
              </div>
              {isCreditCard(createType) ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-2">
                    <Label>{t("accounts.creditLimit")}</Label>
                    <CurrencyAmountInput
                      name="creditLimit"
                      currency={formCurrency}
                      defaultValue={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("accounts.statementDue")}</Label>
                    <CurrencyAmountInput
                      name="statementDueAmount"
                      currency={formCurrency}
                      defaultValue={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("accounts.statementDueDay")}</Label>
                    <Input
                      name="statementDueDay"
                      type="number"
                      min={1}
                      max={31}
                      placeholder="15"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="debitMode"
                      className="mt-1"
                      defaultChecked
                    />
                    <span>
                      {t("accounts.debitMode")}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t("accounts.debitModeHint")}
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
              <Button type="submit" className="w-full">
                {t("common.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3 md:hidden">
        {accounts.map((a) => (
          <Card key={a._id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type} · {a.currency}
                  </p>
                </div>
                <Badge variant={a.isActive ? "secondary" : "outline"}>
                  {a.isActive ? t("common.active") : t("common.archived")}
                </Badge>
              </div>
              <p
                className={`font-mono text-lg ${
                  isCreditCard(a.type)
                    ? "text-amber-800 dark:text-amber-300"
                    : "text-emerald-800 dark:text-emerald-300"
                }`}
              >
                {isCreditCard(a.type)
                  ? `${t("accounts.outstanding")}: ${formatMoney(a.currentBalance, a.currency, intlLocale)}`
                  : formatMoney(a.currentBalance, a.currency, intlLocale)}
              </p>
              {isCreditCard(a.type) ? (
                <p className="text-xs text-muted-foreground">
                  {t("accounts.creditLimit")}:{" "}
                  {formatMoney(a.creditLimit ?? 0, a.currency, intlLocale)}
                  {" · "}
                  {t("accounts.statementDue")}:{" "}
                  {formatMoney(
                    a.statementDueAmount ?? 0,
                    a.currency,
                    intlLocale
                  )}
                </p>
              ) : null}
              <AccountActions account={a} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>{t("accounts.yourAccounts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("accounts.balance")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a._id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.type}</TableCell>
                  <TableCell>
                    <Badge variant={a.isActive ? "secondary" : "outline"}>
                      {a.isActive ? t("common.active") : t("common.archived")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(a.currentBalance, a.currency, intlLocale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AccountActions account={a} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditOpen(null);
        }}
      >
        <DialogContent>
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("common.editNamed", { name: editing.name })}
                </DialogTitle>
              </DialogHeader>
              <form
                key={
                  editing._id +
                  String(editing.currentBalance) +
                  editing.name +
                  editing.type
                }
                className="space-y-3"
                onSubmit={(e) => onEdit(e, editing)}
              >
                <div className="space-y-2">
                  <Label>{t("common.name")}</Label>
                  <Input name="name" required defaultValue={editing.name} />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.type")}</Label>
                  <select
                    name="type"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    defaultValue={editing.type}
                  >
                    {typeOptions}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {isCreditCard(editing.type)
                      ? t("accounts.outstanding")
                      : t("accounts.currentBalance")}
                  </Label>
                  <CurrencyAmountInput
                    name="currentBalance"
                    currency={editing.currency}
                    defaultValue={fromMinorUnits(
                      editing.currentBalance,
                      editing.currency
                    )}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {isCreditCard(editing.type)
                      ? t("accounts.ccOutstandingHint")
                      : t("accounts.balanceHint")}
                  </p>
                </div>
                {isCreditCard(editing.type) ? (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="space-y-2">
                      <Label>{t("accounts.creditLimit")}</Label>
                      <CurrencyAmountInput
                        name="creditLimit"
                        currency={editing.currency}
                        defaultValue={fromMinorUnits(
                          editing.creditLimit ?? 0,
                          editing.currency
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("accounts.statementDue")}</Label>
                      <CurrencyAmountInput
                        name="statementDueAmount"
                        currency={editing.currency}
                        defaultValue={fromMinorUnits(
                          editing.statementDueAmount ?? 0,
                          editing.currency
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("accounts.statementDueDay")}</Label>
                      <Input
                        name="statementDueDay"
                        type="number"
                        min={1}
                        max={31}
                        defaultValue={editing.statementDueDay ?? ""}
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="debitMode"
                        className="mt-1"
                        defaultChecked={Boolean(editing.debitMode)}
                      />
                      <span>
                        {t("accounts.debitMode")}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t("accounts.debitModeHint")}
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}
                <Button type="submit" className="w-full">
                  {t("common.save")}
                </Button>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
