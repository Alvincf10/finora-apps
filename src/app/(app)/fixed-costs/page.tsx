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
};

export default function FixedCostsPage() {
  const { t, intlLocale } = useI18n();
  const [items, setItems] = useState<FixedCost[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  async function load() {
    const list = await api<FixedCost[]>("/api/fixed-costs");
    setItems(list);
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

  const activeTotal = items
    .filter((i) => i.isActive && i.currency === "IDR")
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("fixedCosts.title")}
          </h1>
          <p className="text-muted-foreground">{t("fixedCosts.subtitle")}</p>
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
          <Card key={item._id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{item.name}</span>
                <Badge variant={item.isActive ? "secondary" : "outline"}>
                  {item.isActive
                    ? t("fixedCosts.statusOn")
                    : t("fixedCosts.statusOff")}
                </Badge>
              </CardTitle>
              <CardDescription>
                {t("fixedCosts.dueEvery", { day: item.dueDay })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-mono text-xl">
                {formatMoney(item.amount, item.currency, intlLocale)}
              </p>
              <div className="flex gap-2">
                <Dialog
                  open={editOpen === item._id}
                  onOpenChange={(v) => setEditOpen(v ? item._id : null)}
                >
                  <DialogTrigger
                    render={<Button variant="outline" className="flex-1" />}
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
                  className="flex-1"
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
