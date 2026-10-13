"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits } from "@/lib/money";
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

type Account = {
  _id: string;
  name: string;
  type: string;
  currency: Currency;
  currentBalance: number;
  isActive: boolean;
};

type Category = { _id: string; name: string; type: string };
type Tx = {
  _id: string;
  type: string;
  amount: number;
  currency: Currency;
  description?: string;
  date: string;
  accountId?: { name?: string };
  categoryId?: { name?: string };
  counterpartyAccountId?: { name?: string };
};

type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState(false);
  const [formType, setFormType] = useState<TxType>("EXPENSE");
  const [formAccountId, setFormAccountId] = useState("");
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    const [transactions, accountList, categoryList] = await Promise.all([
      api<Tx[]>(`/api/transactions?${params}`),
      api<Account[]>("/api/accounts"),
      api<Category[]>("/api/categories"),
    ]);
    setTxs(transactions);
    setAccounts(accountList.filter((a) => a.isActive));
    setCategories(categoryList);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "INCOME"),
    [categories]
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "EXPENSE"),
    [categories]
  );
  const categoryOptions =
    formType === "INCOME" ? incomeCategories : expenseCategories;

  function resetFormDefaults(accountList: Account[] = accounts) {
    setFormType("EXPENSE");
    const first = accountList[0];
    setFormAccountId(first?._id ?? "");
    setFormCurrency(first?.currency ?? "IDR");
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const txType = String(form.get("type")) as TxType;
    const currency = String(form.get("currency")) as Currency;
    const major = Number(form.get("amount"));
    const accountId = String(form.get("accountId") || "");
    if (!accountId) {
      toast.error("Pilih akun dulu");
      return;
    }

    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: txType,
          amount: toMinorUnits(major, currency),
          currency,
          accountId,
          toAccountId:
            txType === "TRANSFER"
              ? form.get("toAccountId") || undefined
              : undefined,
          categoryId:
            txType !== "TRANSFER"
              ? form.get("categoryId") || undefined
              : undefined,
          description: form.get("description") || undefined,
          date: form.get("date"),
        }),
      });
      toast.success("Transaction saved");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  async function onDelete(id: string) {
    try {
      await api(`/api/transactions/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Transactions</h1>
          <p className="text-muted-foreground">
            Income, expenses, and transfers.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) return;
            resetFormDefaults();
            void (async () => {
              try {
                const accountList = (
                  await api<Account[]>("/api/accounts")
                ).filter((a) => a.isActive);
                setAccounts(accountList);
                resetFormDefaults(accountList);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })();
          }}
        >
          <DialogTrigger render={<Button />}>Add transaction</DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New transaction</DialogTitle>
            </DialogHeader>
            <form
              key={open ? "open" : "closed"}
              className="space-y-3"
              onSubmit={onCreate}
            >
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  name="type"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as TxType)}
                >
                  <option value="INCOME">Income</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <CurrencyAmountInput
                    name="amount"
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
                <Label>
                  {formType === "TRANSFER" ? "From account" : "Account"}
                </Label>
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
                    Pilih akun…
                  </option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Belum ada akun aktif. Buat dulu di halaman Accounts.
                  </p>
                ) : null}
              </div>
              {formType === "TRANSFER" ? (
                <div className="space-y-2">
                  <Label>To account</Label>
                  <select
                    name="toAccountId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Pilih akun tujuan…
                    </option>
                    {accounts
                      .filter((a) => a._id !== formAccountId)
                      .map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select
                    name="categoryId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Pilih kategori…
                    </option>
                    {categoryOptions.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {categoryOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Belum ada kategori {formType === "INCOME" ? "income" : "expense"}.
                    </p>
                  ) : null}
                </div>
              )}
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  name="date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input name="description" placeholder="Opsional" />
              </div>
              <Button type="submit" className="w-full">
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="flex h-9 rounded-md border px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
            <option value="TRANSFER">Transfer</option>
          </select>
          <Button
            variant="outline"
            onClick={() => load().catch((e) => toast.error(e.message))}
          >
            Apply
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((tx) => (
                <TableRow key={tx._id}>
                  <TableCell>
                    {new Date(tx.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{tx.type}</TableCell>
                  <TableCell>
                    {tx.description ||
                      tx.categoryId?.name ||
                      (tx.type === "TRANSFER"
                        ? `→ ${tx.counterpartyAccountId?.name ?? ""}`
                        : "—")}
                  </TableCell>
                  <TableCell>{tx.accountId?.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(tx._id)}
                    >
                      Delete
                    </Button>
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
