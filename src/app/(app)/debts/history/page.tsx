"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency, DebtKind } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
};

function statusLabel(
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  if (status === "ACTIVE") return t("debts.statusActive");
  if (status === "PAID") return t("debts.statusPaid");
  if (status === "CANCELLED") return t("debts.statusCancelled");
  return status;
}

export default function DebtHistoryPage() {
  const { t, intlLocale } = useI18n();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [editOpen, setEditOpen] = useState<string | null>(null);

  const money = (amount: number, currency: Currency) =>
    formatMoney(amount, currency, intlLocale);

  const historyDebts = useMemo(
    () => debts.filter((d) => d.status === "PAID" || d.status === "CANCELLED"),
    [debts]
  );

  async function load() {
    const debtList = await api<Debt[]>("/api/debts");
    setDebts(debtList);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function onEdit(e: React.FormEvent<HTMLFormElement>, debt: Debt) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api(`/api/debts/${debt._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          status: form.get("status") || undefined,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 gap-1.5 text-muted-foreground"
            render={<Link href="/debts" />}
          >
            <ArrowLeft className="size-4" />
            {t("debts.backToDebts")}
          </Button>
          <h1 className="font-heading text-3xl font-semibold">
            {t("debts.historyTitle")}
          </h1>
          <p className="text-muted-foreground">{t("debts.historyDesc")}</p>
        </div>
      </div>

      {historyDebts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("debts.historyEmpty")}</p>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("debts.historyTitle")}</CardTitle>
            <CardDescription>
              {t("debts.historyCount", { count: historyDebts.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {historyDebts.map((debt) => (
              <div
                key={debt._id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{debt.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {statusLabel(debt.status, t)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {money(debt.originalAmount, debt.currency)}
                    </span>
                  </div>
                </div>
                <Dialog
                  open={editOpen === debt._id}
                  onOpenChange={(v) => setEditOpen(v ? debt._id : null)}
                >
                  <DialogTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 touch-manipulation"
                      />
                    }
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
                      key={debt._id + debt.status + debt.name}
                      className="space-y-3"
                      onSubmit={(e) => onEdit(e, debt)}
                    >
                      <div className="space-y-2">
                        <Label>{t("common.name")}</Label>
                        <Input
                          name="name"
                          required
                          defaultValue={debt.name}
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
