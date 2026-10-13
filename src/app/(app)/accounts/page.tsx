"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
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
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

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
    try {
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          type: form.get("type"),
          currency,
          initialBalance: toMinorUnits(Number(form.get("initialBalance")), currency),
        }),
      });
      toast.success("Account created");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, account: Account) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api(`/api/accounts/${account._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          type: form.get("type"),
          currentBalance: toMinorUnits(
            Number(form.get("currentBalance")),
            account.currency
          ),
        }),
      });
      toast.success("Account updated");
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  async function archive(id: string) {
    try {
      await api(`/api/accounts/${id}`, { method: "DELETE" });
      toast.success("Account archived");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  async function restore(id: string) {
    try {
      await api(`/api/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      toast.success("Account restored");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Accounts</h1>
          <p className="text-muted-foreground">
            Set the current balance to restart tracking from a known amount.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) setFormCurrency("IDR");
          }}
        >
          <DialogTrigger render={<Button />}>Add account</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New account</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input name="name" required placeholder="BCA / Cash / Bank Austria" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  name="type"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  defaultValue="BANK"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="E_WALLET">E-wallet</option>
                  <option value="CREDIT_CARD">Credit card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-2">
                  <Label>Initial balance</Label>
                  <CurrencyAmountInput
                    name="initialBalance"
                    currency={formCurrency}
                    defaultValue={0}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
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
                      {a.isActive ? "Active" : "Archived"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(a.currentBalance, a.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog
                        open={editOpen === a._id}
                        onOpenChange={(v) => setEditOpen(v ? a._id : null)}
                      >
                        <DialogTrigger
                          render={<Button variant="ghost" size="sm" />}
                        >
                          Edit
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit {a.name}</DialogTitle>
                          </DialogHeader>
                          <form
                            key={
                              a._id +
                              String(a.currentBalance) +
                              a.name +
                              a.type
                            }
                            className="space-y-3"
                            onSubmit={(e) => onEdit(e, a)}
                          >
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input
                                name="name"
                                required
                                defaultValue={a.name}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <select
                                name="type"
                                className="flex h-9 w-full rounded-md border px-3 text-sm"
                                defaultValue={a.type}
                              >
                                <option value="CASH">Cash</option>
                                <option value="BANK">Bank</option>
                                <option value="E_WALLET">E-wallet</option>
                                <option value="CREDIT_CARD">Credit card</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Current balance</Label>
                              <CurrencyAmountInput
                                name="currentBalance"
                                currency={a.currency}
                                defaultValue={fromMinorUnits(
                                  a.currentBalance,
                                  a.currency
                                )}
                                required
                              />
                              <p className="text-xs text-muted-foreground">
                                Enter the balance you want as of your restart
                                date (e.g. 12 Oct). Existing transactions stay;
                                opening balance is adjusted so this matches.
                              </p>
                            </div>
                            <Button type="submit" className="w-full">
                              Save
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                      {a.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => archive(a._id)}
                        >
                          Archive
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => restore(a._id)}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
