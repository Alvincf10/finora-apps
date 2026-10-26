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
  DialogDescription,
  DialogFooter,
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
import { useI18n } from "@/components/i18n-provider";

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local `YYYY-MM-DDTHH:mm` for datetime-local inputs (avoids UTC day shift). */
function toDateTimeLocalValue(value?: string | Date) {
  const d = value ? new Date(value) : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatTxDateTime(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function typeLabel(
  type: string,
  t: (key: string) => string
) {
  if (type === "INCOME") return t("transactions.income");
  if (type === "EXPENSE") return t("transactions.expense");
  if (type === "TRANSFER") return t("transactions.transfer");
  return type;
}

export default function TransactionsPage() {
  const { t, intlLocale } = useI18n();
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
  const [editAccountId, setEditAccountId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCurrency, setEditCurrency] = useState<Currency>("IDR");
  const [editAmountMajor, setEditAmountMajor] = useState(0);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tx | null>(null);
  const [deleting, setDeleting] = useState(false);

  const money = (amount: number, currency: Currency) =>
    formatMoney(amount, currency, intlLocale);

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
        toast.error(e instanceof Error ? e.message : t("common.failed"));
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

  const editAccountOptions = useMemo(() => {
    const list = [...accounts];
    const currentId = editing?.accountId?._id;
    if (
      currentId &&
      !list.some((a) => a._id === currentId) &&
      editing?.accountId?.name
    ) {
      list.unshift({
        _id: currentId,
        name: editing.accountId.name,
        type: "UNKNOWN",
        currency: editing.accountId.currency ?? editing.currency,
        currentBalance: 0,
        isActive: false,
      });
    }
    return list;
  }, [accounts, editing]);

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
      toast.error(e instanceof Error ? e.message : t("common.failed"));
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
      toast.error(t("transactions.selectAccountFirst"));
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
      toast.success(t("transactions.created"));
      setOpen(false);
      await refreshList();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    }
  }

  function openEdit(tx: Tx) {
    if (tx.type === "TRANSFER") {
      toast.error(t("transactions.transferNoEdit"));
      return;
    }
    setEditing(tx);
    setEditAccountId(tx.accountId?._id ?? "");
    setEditCurrency(tx.currency);
    setEditAmountMajor(fromMinorUnits(tx.amount, tx.currency));
    setEditDate(toDateTimeLocalValue(tx.date));
    setEditDescription(tx.description ?? "");
    setEditCategoryId(tx.categoryId?._id ?? "");
    setEditOpen(true);
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    if (!editAccountId) {
      toast.error(t("transactions.selectAccountFirst"));
      return;
    }
    setSavingEdit(true);
    try {
      await api(`/api/transactions/${editing._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: toMinorUnits(editAmountMajor, editCurrency),
          accountId: editAccountId,
          categoryId: editCategoryId || undefined,
          description: editDescription.trim() || undefined,
          date: editDate,
        }),
      });
      toast.success(t("transactions.updated"));
      setEditOpen(false);
      setEditing(null);
      await refreshList();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api(`/api/transactions/${deleteTarget._id}`, { method: "DELETE" });
      toast.success(t("transactions.deleted"));
      setDeleteTarget(null);
      await refreshList();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold">
            {t("transactions.title")}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t("transactions.subtitle")}
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
                toast.error(
                  e instanceof Error ? e.message : t("common.failed")
                );
              }
            })();
          }}
        >
          <DialogTrigger
            render={<Button className="w-full touch-manipulation sm:w-auto" />}
          >
            {t("transactions.add")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("transactions.newTransaction")}</DialogTitle>
            </DialogHeader>
            <form
              key={open ? "open" : "closed"}
              className="space-y-3"
              onSubmit={onCreate}
            >
              <div className="space-y-2">
                <Label>{t("common.type")}</Label>
                <select
                  name="type"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as TxType)}
                >
                  <option value="INCOME">{t("transactions.income")}</option>
                  <option value="EXPENSE">{t("transactions.expense")}</option>
                  <option value="TRANSFER">{t("transactions.transfer")}</option>
                </select>
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
                <Label>
                  {formType === "TRANSFER"
                    ? t("transactions.fromAccount")
                    : t("common.account")}
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
                    {t("transactions.selectAccount")}
                  </option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("transactions.noActiveAccounts")}
                  </p>
                ) : null}
              </div>
              {formType === "TRANSFER" ? (
                <div className="space-y-2">
                  <Label>{t("transactions.toAccount")}</Label>
                  <select
                    name="toAccountId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t("transactions.selectToAccount")}
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
                  <Label>{t("common.category")}</Label>
                  <select
                    name="categoryId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t("transactions.selectCategory")}
                    </option>
                    {categoryOptions.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {categoryOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("transactions.noCategoriesForType", {
                        type:
                          formType === "INCOME"
                            ? t("transactions.income").toLowerCase()
                            : t("transactions.expense").toLowerCase(),
                      })}
                    </p>
                  ) : null}
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("common.date")}</Label>
                <Input
                  name="date"
                  type="datetime-local"
                  required
                  defaultValue={toDateTimeLocalValue()}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Input
                  name="description"
                  placeholder={t("transactions.optionalPlaceholder")}
                />
              </div>
              <Button type="submit" className="w-full">
                {t("common.save")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
          <CardTitle>{t("transactions.filters")}</CardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading
              ? t("common.loading")
              : t("transactions.countLabel", { count: total })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="filter-q">{t("common.search")}</Label>
              <Input
                id="filter-q"
                placeholder={t("transactions.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void applyFilters();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-type">{t("common.type")}</Label>
              <select
                id="filter-type"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setCategoryId("");
                }}
              >
                <option value="">{t("transactions.allTypes")}</option>
                <option value="INCOME">{t("transactions.income")}</option>
                <option value="EXPENSE">{t("transactions.expense")}</option>
                <option value="TRANSFER">{t("transactions.transfer")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-account">{t("common.account")}</Label>
              <select
                id="filter-account"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">{t("transactions.allAccounts")}</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-category">{t("common.category")}</Label>
              <select
                id="filter-category"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={type === "TRANSFER"}
              >
                <option value="">{t("transactions.allCategories")}</option>
                {filterCategoryOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-from">{t("common.from")}</Label>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-to">{t("common.to")}</Label>
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
              {t("transactions.apply")}
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
                    toast.error(
                      e instanceof Error ? e.message : t("common.failed")
                    );
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              disabled={loading}
            >
              {t("transactions.clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {txs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {loading ? t("common.loading") : t("transactions.empty")}
            </CardContent>
          </Card>
        ) : (
          txs.map((tx) => (
            <Card key={tx._id}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{txLabel(tx)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTxDateTime(tx.date, intlLocale)} ·{" "}
                    {typeLabel(tx.type, t)}
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
                    {money(tx.amount, tx.currency)}
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
                      {t("common.edit")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="touch-manipulation"
                    onClick={() => setDeleteTarget(tx)}
                  >
                    {t("common.delete")}
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
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("common.description")}</TableHead>
                <TableHead>{t("common.category")}</TableHead>
                <TableHead>{t("common.account")}</TableHead>
                <TableHead className="text-right">
                  {t("common.amount")}
                </TableHead>
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
                    {loading ? t("common.loading") : t("transactions.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                txs.map((tx) => (
                  <TableRow key={tx._id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatTxDateTime(tx.date, intlLocale)}
                    </TableCell>
                    <TableCell>{typeLabel(tx.type, t)}</TableCell>
                    <TableCell>{txLabel(tx)}</TableCell>
                    <TableCell>{tx.categoryId?.name ?? "—"}</TableCell>
                    <TableCell>{tx.accountId?.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {money(tx.amount, tx.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {tx.type !== "TRANSFER" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(tx)}
                          >
                            {t("common.edit")}
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(tx)}
                        >
                          {t("common.delete")}
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
              ? t("common.loading")
              : t("transactions.loadMoreCount", {
                  shown: txs.length,
                  total,
                })}
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
            <DialogTitle>{t("transactions.editTransaction")}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form className="space-y-3" onSubmit={onEdit}>
              <p className="text-sm text-muted-foreground">
                {typeLabel(editing.type, t)}
              </p>
              <div className="space-y-2">
                <Label>{t("common.account")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  required
                  value={editAccountId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setEditAccountId(id);
                    const account = editAccountOptions.find(
                      (a) => a._id === id
                    );
                    if (account) setEditCurrency(account.currency);
                  }}
                >
                  <option value="" disabled>
                    {t("transactions.selectAccount")}
                  </option>
                  {editAccountOptions.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("common.amount")}</Label>
                <CurrencyAmountInput
                  currency={editCurrency}
                  value={editAmountMajor}
                  onValueChange={setEditAmountMajor}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.category")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  required
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                >
                  <option value="" disabled>
                    {t("transactions.selectCategory")}
                  </option>
                  {editCategoryOptions.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("common.date")}</Label>
                <Input
                  type="datetime-local"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={t("transactions.optionalPlaceholder")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={savingEdit}>
                {savingEdit
                  ? t("common.saving")
                  : t("transactions.saveChanges")}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>{t("transactions.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-medium text-foreground">
                    {txLabel(deleteTarget)}
                  </span>
                  {" · "}
                  <span className="font-mono tabular-nums">
                    {money(deleteTarget.amount, deleteTarget.currency)}
                  </span>
                  <br />
                  {t("transactions.deleteConfirm")}
                </>
              ) : (
                t("transactions.deleteConfirm")
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="touch-manipulation"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="touch-manipulation"
              disabled={deleteTarget == null || deleting}
              onClick={() => {
                void confirmDelete();
              }}
            >
              {deleting ? t("common.saving") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
