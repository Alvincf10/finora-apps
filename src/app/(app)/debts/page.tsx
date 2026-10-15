"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Debt = {
  _id: string;
  name: string;
  originalAmount: number;
  remainingAmount: number;
  currency: Currency;
  status: string;
  dueDate?: string;
  plannedPayment?: number;
  minimumPayment?: number;
};

type Account = {
  _id: string;
  name: string;
  currency: Currency;
  isActive: boolean;
};

function toDateInput(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  async function load() {
    const [debtList, accountList] = await Promise.all([
      api<Debt[]>("/api/debts"),
      api<Account[]>("/api/accounts"),
    ]);
    setDebts(debtList);
    setAccounts(accountList.filter((a) => a.isActive));
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    try {
      const monthlyRaw = Number(form.get("plannedPayment"));
      await api("/api/debts", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          originalAmount: toMinorUnits(Number(form.get("originalAmount")), currency),
          currency,
          dueDate: form.get("dueDate") || undefined,
          plannedPayment:
            monthlyRaw > 0 ? toMinorUnits(monthlyRaw, currency) : undefined,
        }),
      });
      toast.success("Debt created");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, debt: Debt) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const monthlyRaw = Number(form.get("plannedPayment"));
      await api(`/api/debts/${debt._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          originalAmount: toMinorUnits(
            Number(form.get("originalAmount")),
            debt.currency
          ),
          dueDate: form.get("dueDate") || undefined,
          status: form.get("status") || undefined,
          plannedPayment:
            monthlyRaw > 0
              ? toMinorUnits(monthlyRaw, debt.currency)
              : undefined,
        }),
      });
      toast.success("Debt updated");
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
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
      toast.success("Payment recorded");
      setPayOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Debts</h1>
          <p className="text-muted-foreground">
            Track remaining balances and payment history.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) setFormCurrency("IDR");
          }}
        >
          <DialogTrigger render={<Button />}>Add debt</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New debt</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Original amount</Label>
                  <CurrencyAmountInput
                    name="originalAmount"
                    currency={formCurrency}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
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
                <Label>Monthly payment (installment)</Label>
                <CurrencyAmountInput
                  name="plannedPayment"
                  currency={formCurrency}
                  allowEmpty
                />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input name="dueDate" type="date" />
              </div>
              <Button type="submit" className="w-full">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {debts.map((debt) => (
          <Card key={debt._id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{debt.name}</span>
                <Badge variant={debt.status === "ACTIVE" ? "secondary" : "outline"}>
                  {debt.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-mono">
                  {formatMoney(debt.remainingAmount, debt.currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Original</span>
                <span className="font-mono">
                  {formatMoney(debt.originalAmount, debt.currency)}
                </span>
              </div>
              {(debt.plannedPayment ?? debt.minimumPayment) ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly payment</span>
                  <span className="font-mono">
                    {formatMoney(
                      debt.plannedPayment ?? debt.minimumPayment ?? 0,
                      debt.currency
                    )}
                  </span>
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
                    Edit
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit {debt.name}</DialogTitle>
                    </DialogHeader>
                    <form
                      key={debt._id + String(debt.originalAmount) + debt.name}
                      className="space-y-3"
                      onSubmit={(e) => onEdit(e, debt)}
                    >
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input name="name" required defaultValue={debt.name} />
                      </div>
                      <div className="space-y-2">
                        <Label>Original amount</Label>
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
                      <div className="space-y-2">
                        <Label>Monthly payment (installment)</Label>
                        <CurrencyAmountInput
                          name="plannedPayment"
                          currency={debt.currency}
                          allowEmpty
                          defaultValue={
                            debt.plannedPayment || debt.minimumPayment
                              ? fromMinorUnits(
                                  debt.plannedPayment ??
                                    debt.minimumPayment ??
                                    0,
                                  debt.currency
                                )
                              : undefined
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Due date</Label>
                        <Input
                          name="dueDate"
                          type="date"
                          defaultValue={toDateInput(debt.dueDate)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <select
                          name="status"
                          className="flex h-9 w-full rounded-md border px-3 text-sm"
                          defaultValue={debt.status}
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="PAID">PAID</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                      <Button type="submit" className="w-full">
                        Save changes
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
                      Record payment
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Pay {debt.name}</DialogTitle>
                      </DialogHeader>
                      <form
                        className="space-y-3"
                        onSubmit={(e) => onPay(e, debt._id)}
                      >
                        <div className="space-y-2">
                          <Label>From account</Label>
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
                          <Label>Amount</Label>
                          <CurrencyAmountInput
                            name="amount"
                            currency={debt.currency}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input
                            name="date"
                            type="date"
                            required
                            defaultValue={new Date().toISOString().slice(0, 10)}
                          />
                        </div>
                        <Button type="submit" className="w-full">
                          Save payment
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
