"use client";

import { useEffect, useMemo, useState } from "react";
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
  accountId?: { _id?: string; name?: string; currency?: Currency };
  categoryId?: { _id?: string; name?: string; type?: string };
  counterpartyAccountId?: { _id?: string; name?: string };
};

type TxListResponse = {
  items: Tx[];
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
};

type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

const PAGE_SIZE = 50;

function toDateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function txLabel(tx: Tx) {
  return (
    tx.description ||
    tx.categoryId?.name ||
    (tx.type === "TRANSFER"
      ? `→ ${tx.counterpartyAccountId?.name ?? ""}`
      : tx.type)
  );
}

function listParams(filters: {
  q: string;
  type: string;
  accountId: string;
  categoryId: string;
  from: string;
  to: string;
  skip: number;
}) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.type) params.set("type", filters.type);
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", String(PAGE_SIZE));
  params.set("skip", String(filters.skip));
  return params;
}

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [open, setOpen] = useState(false);
  const [formType, setFormType] = useState<TxType>("EXPENSE");
  const [formAccountId, setFormAccountId] = useState("");
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCurrency, setEditCurrency] = useState<Currency>("IDR");
  const [editAmountMajor, setEditAmountMajor] = useState(0);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [accountList, categoryList, data] = await Promise.all([
          api<Account[]>("/api/accounts"),
          api<Category[]>("/api/categories"),
          api<TxListResponse>(
            `/api/transactions?limit=${PAGE_SIZE}&skip=0`
          ),
        ]);
        setAccounts(accountList.filter((a) => a.isActive));
        setCategories(categoryList);
        setTxs(data.items);
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
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

  const filterCategoryOptions = useMemo(() => {
    if (type === "INCOME") return incomeCategories;
    if (type === "EXPENSE") return expenseCategories;
    return categories;
  }, [type, incomeCategories, expenseCategories, categories]);

  const editCategoryOptions = useMemo(() => {
    if (!editing) return [];
    return editing.type === "INCOME" ? incomeCategories : expenseCategories;
  }, [editing, incomeCategories, expenseCategories]);

  function resetFormDefaults(accountList: Account[] = accounts) {
    setFormType("EXPENSE");
    const first = accountList[0];
    setFormAccountId(first?._id ?? "");
    setFormCurrency(first?.currency ?? "IDR");
  }

  function clearFilters() {
    setQ("");
    setType("");
    setAccountId("");
    setCategoryId("");
    setFrom("");
    setTo("");
  }

  async function fetchList(skip: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await api<TxListResponse>(
        `/api/transactions?${listParams({
          q,
          type,
          accountId,
          categoryId,
          from,
          to,
          skip,
        })}`
      );
      setTxs((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  function applyFilters() {
    return fetchList(0, false);
  }

  function loadMore() {
    return fetchList(txs.length, true);
  }

  function refreshList() {
    return fetchList(0, false);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const txType = String(form.get("type")) as TxType;
    const currency = String(form.get("currency")) as Currency;
    const major = Number(form.get("amount"));
    const accountIdValue = String(form.get("accountId") || "");
    if (!accountIdValue) {
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
          accountId: accountIdValue,
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
      await refreshList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  function openEdit(tx: Tx) {
    if (tx.type === "TRANSFER") {
      toast.error("Transfer tidak bisa diedit — hapus lalu buat ulang");
      return;
    }
    setEditing(tx);
    setEditCurrency(tx.currency);
    setEditAmountMajor(fromMinorUnits(tx.amount, tx.currency));
    setEditDate(toDateInputValue(tx.date));
    setEditDescription(tx.description ?? "");
    setEditCategoryId(tx.categoryId?._id ?? "");
    setEditOpen(true);
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api(`/api/transactions/${editing._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: toMinorUnits(editAmountMajor, editCurrency),
          categoryId: editCategoryId || undefined,
          description: editDescription.trim() || undefined,
          date: editDate,
        }),
      });
      toast.success("Transaction updated");
      setEditOpen(false);
      setEditing(null);
      await refreshList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await api(`/api/transactions/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      await refreshList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
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
          <DialogTrigger
            render={<Button className="w-full touch-manipulation sm:w-auto" />}
          >
            Add transaction
          </DialogTrigger>
          <DialogContent>
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
                      Belum ada kategori{" "}
                      {formType === "INCOME" ? "income" : "expense"}.
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
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
          <CardTitle>Filters</CardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading ? "Loading…" : `${total} transaksi`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="filter-q">Search</Label>
              <Input
                id="filter-q"
                placeholder="Description…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void applyFilters();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-type">Type</Label>
              <select
                id="filter-type"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setCategoryId("");
                }}
              >
                <option value="">All types</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-account">Account</Label>
              <select
                id="filter-account"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-category">Category</Label>
              <select
                id="filter-category"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={type === "TRANSFER"}
              >
                <option value="">All categories</option>
                {filterCategoryOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-from">From</Label>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-to">To</Label>
              <Input
                id="filter-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="touch-manipulation"
              onClick={() => void applyFilters()}
              disabled={loading}
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="touch-manipulation text-muted-foreground"
              onClick={() => {
                clearFilters();
                void (async () => {
                  setLoading(true);
                  try {
                    const data = await api<TxListResponse>(
                      `/api/transactions?${listParams({
                        q: "",
                        type: "",
                        accountId: "",
                        categoryId: "",
                        from: "",
                        to: "",
                        skip: 0,
                      })}`
                    );
                    setTxs(data.items);
                    setTotal(data.total);
                    setHasMore(data.hasMore);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              disabled={loading}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {txs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {loading ? "Memuat…" : "Belum ada transaksi."}
            </CardContent>
          </Card>
        ) : (
          txs.map((tx) => (
            <Card key={tx._id}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{txLabel(tx)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.date).toLocaleDateString()} · {tx.type}
                    {tx.accountId?.name ? ` · ${tx.accountId.name}` : ""}
                    {tx.categoryId?.name ? ` · ${tx.categoryId.name}` : ""}
                  </p>
                  <p
                    className={`font-mono text-base ${
                      tx.type === "INCOME"
                        ? "text-emerald-800 dark:text-emerald-300"
                        : tx.type === "EXPENSE"
                          ? "text-rose-700 dark:text-rose-400"
                          : ""
                    }`}
                  >
                    {tx.type === "INCOME"
                      ? "+"
                      : tx.type === "EXPENSE"
                        ? "−"
                        : ""}
                    {formatMoney(tx.amount, tx.currency)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {tx.type !== "TRANSFER" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="touch-manipulation"
                      onClick={() => openEdit(tx)}
                    >
                      Edit
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="touch-manipulation"
                    onClick={() => onDelete(tx._id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {loading ? "Memuat…" : "Belum ada transaksi."}
                  </TableCell>
                </TableRow>
              ) : (
                txs.map((tx) => (
                  <TableRow key={tx._id}>
                    <TableCell>
                      {new Date(tx.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{tx.type}</TableCell>
                    <TableCell>{txLabel(tx)}</TableCell>
                    <TableCell>{tx.categoryId?.name ?? "—"}</TableCell>
                    <TableCell>{tx.accountId?.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMoney(tx.amount, tx.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {tx.type !== "TRANSFER" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(tx)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(tx._id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="touch-manipulation"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore
              ? "Loading…"
              : `Load more (${txs.length} of ${total})`}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form className="space-y-3" onSubmit={onEdit}>
              <p className="text-sm text-muted-foreground">
                {editing.type} · {editing.accountId?.name ?? "Account"}
              </p>
              <div className="space-y-2">
                <Label>Amount</Label>
                <CurrencyAmountInput
                  currency={editCurrency}
                  value={editAmountMajor}
                  onValueChange={setEditAmountMajor}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  required
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                >
                  <option value="" disabled>
                    Pilih kategori…
                  </option>
                  {editCategoryOptions.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
              <Button type="submit" className="w-full" disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
