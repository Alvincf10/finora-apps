"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type Account = {
  _id: string;
  name: string;
  currency: Currency;
  isActive: boolean;
};

type Category = { _id: string; name: string; type: string };

type Recurring = {
  _id: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  currency: Currency;
  description?: string;
  frequency: "MONTHLY" | "WEEKLY";
  dayOfMonth?: number;
  nextOccurrence: string;
  endDate?: string;
  isActive: boolean;
  accountId?: { _id?: string; name?: string };
  categoryId?: { _id?: string; name?: string };
};

type GenerateResult = {
  createdCount: number;
};

export default function RecurringPage() {
  const { t, intlLocale } = useI18n();
  const [items, setItems] = useState<Recurring[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [formType, setFormType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [formFrequency, setFormFrequency] = useState<"MONTHLY" | "WEEKLY">(
    "MONTHLY"
  );
  const [formAccountId, setFormAccountId] = useState("");
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.type === formType),
    [categories, formType]
  );

  async function load() {
    const [list, accountList, categoryList] = await Promise.all([
      api<Recurring[]>("/api/recurring"),
      api<Account[]>("/api/accounts"),
      api<Category[]>("/api/categories"),
    ]);
    setItems(list);
    const active = accountList.filter((a) => a.isActive);
    setAccounts(active);
    setCategories(categoryList);
    if (!formAccountId && active[0]) {
      setFormAccountId(active[0]._id);
      setFormCurrency(active[0].currency);
    }
  }

  useEffect(() => {
    load().catch((e) =>
      toast.error(e instanceof Error ? e.message : t("common.failed"))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGenerate() {
    setGenerating(true);
    try {
      const result = await api<GenerateResult>("/api/recurring/generate", {
        method: "POST",
      });
      if (result.createdCount > 0) {
        toast.success(
          t("recurring.generated", { count: result.createdCount })
        );
      } else {
        toast.message(t("recurring.noneDue"));
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setGenerating(false);
    }
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    const frequency = String(form.get("frequency")) as "MONTHLY" | "WEEKLY";
    try {
      await api("/api/recurring", {
        method: "POST",
        body: JSON.stringify({
          type: form.get("type"),
          amount: toMinorUnits(Number(form.get("amount")), currency),
          currency,
          accountId: form.get("accountId"),
          categoryId: form.get("categoryId"),
          description: form.get("description") || undefined,
          frequency,
          dayOfMonth:
            frequency === "MONTHLY"
              ? Number(form.get("dayOfMonth"))
              : undefined,
          endDate: form.get("endDate") || undefined,
        }),
      });
      toast.success(t("recurring.created"));
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function toggleActive(item: Recurring) {
    try {
      await api(`/api/recurring/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onDelete(id: string) {
    try {
      await api(`/api/recurring/${id}`, { method: "DELETE" });
      toast.success(t("common.deleted"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  const dueCount = items.filter(
    (i) => i.isActive && new Date(i.nextOccurrence) <= new Date()
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold">
            {t("recurring.title")}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t("recurring.subtitle")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            className="touch-manipulation"
            disabled={generating}
            onClick={() => void onGenerate()}
          >
            {generating
              ? t("recurring.posting")
              : dueCount > 0
                ? t("recurring.generateDue", { count: dueCount })
                : t("recurring.generate")}
          </Button>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) return;
              setFormType("EXPENSE");
              setFormFrequency("MONTHLY");
              const first = accounts[0];
              setFormAccountId(first?._id ?? "");
              setFormCurrency(first?.currency ?? "IDR");
            }}
          >
            <DialogTrigger
              render={
                <Button className="w-full touch-manipulation sm:w-auto" />
              }
            >
              {t("recurring.add")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("recurring.newItem")}</DialogTitle>
              </DialogHeader>
              <form
                key={open ? "open" : "closed"}
                className="space-y-3"
                onSubmit={onCreate}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("common.type")}</Label>
                    <select
                      name="type"
                      className="flex h-9 w-full rounded-md border px-3 text-sm"
                      value={formType}
                      onChange={(e) =>
                        setFormType(e.target.value as "INCOME" | "EXPENSE")
                      }
                    >
                      <option value="EXPENSE">{t("transactions.expense")}</option>
                      <option value="INCOME">{t("transactions.income")}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("recurring.frequency")}</Label>
                    <select
                      name="frequency"
                      className="flex h-9 w-full rounded-md border px-3 text-sm"
                      value={formFrequency}
                      onChange={(e) =>
                        setFormFrequency(
                          e.target.value as "MONTHLY" | "WEEKLY"
                        )
                      }
                    >
                      <option value="MONTHLY">{t("recurring.monthly")}</option>
                      <option value="WEEKLY">{t("recurring.weekly")}</option>
                    </select>
                  </div>
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
                  <Label>{t("common.account")}</Label>
                  <select
                    name="accountId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                    value={formAccountId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFormAccountId(id);
                      const account = accounts.find((a) => a._id === id);
                      if (account) setFormCurrency(account.currency);
                    }}
                  >
                    <option value="" disabled>
                      {t("recurring.selectAccount")}
                    </option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("common.category")}</Label>
                  <select
                    name="categoryId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t("recurring.selectCategory")}
                    </option>
                    {categoryOptions.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {formFrequency === "MONTHLY" ? (
                  <div className="space-y-2">
                    <Label>{t("recurring.dayOfMonth")}</Label>
                    <Input
                      name="dayOfMonth"
                      type="number"
                      min={1}
                      max={31}
                      required
                      defaultValue={25}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("recurring.dayOfMonthHint")}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>{t("common.description")}</Label>
                  <Input
                    name="description"
                    placeholder={t("recurring.descPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("recurring.endDate")}</Label>
                  <Input name="endDate" type="date" />
                </div>
                <Button type="submit" className="w-full">
                  {t("common.save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
          <p>
            {t("recurring.hint")}{" "}
            <Link
              href="/fixed-costs"
              className="underline underline-offset-2"
            >
              {t("recurring.fixedCostsLink")}
            </Link>{" "}
            {t("recurring.hintSuffix")}
          </p>
          <Link
            href="/transactions"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            {t("recurring.viewTransactions")}
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const isDue =
            item.isActive && new Date(item.nextOccurrence) <= new Date();
          return (
            <Card key={item._id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate">
                    {item.description || item.categoryId?.name || item.type}
                  </span>
                  <div className="flex gap-1">
                    {isDue ? (
                      <Badge variant="destructive">{t("recurring.due")}</Badge>
                    ) : null}
                    <Badge variant={item.isActive ? "secondary" : "outline"}>
                      {item.isActive
                        ? t("recurring.statusOn")
                        : t("recurring.statusOff")}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>
                  {item.type} · {item.frequency}
                  {item.frequency === "MONTHLY" && item.dayOfMonth
                    ? t("recurring.dayShort", { day: item.dayOfMonth })
                    : ""}
                  {" · "}
                  {item.accountId?.name}
                  {item.categoryId?.name
                    ? ` · ${item.categoryId.name}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-mono text-xl">
                  {formatMoney(item.amount, item.currency, intlLocale)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("recurring.next", {
                    date: new Date(item.nextOccurrence).toLocaleDateString(
                      intlLocale
                    ),
                  })}
                  {item.endDate
                    ? t("recurring.ends", {
                        date: new Date(item.endDate).toLocaleDateString(
                          intlLocale
                        ),
                      })
                    : ""}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => void toggleActive(item)}
                  >
                    {item.isActive
                      ? t("recurring.pause")
                      : t("recurring.resume")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => void onDelete(item._id)}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("recurring.empty")}</p>
      ) : null}
    </div>
  );
}
