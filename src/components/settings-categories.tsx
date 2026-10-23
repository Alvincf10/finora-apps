"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Category = {
  _id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  parentId?: string | null;
  isSystem?: boolean;
};

export function SettingsCategories() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [busy, setBusy] = useState(false);

  const editing = categories.find((c) => c._id === editId) ?? null;

  const load = useCallback(async () => {
    const list = await api<Category[]>("/api/categories");
    setCategories(list);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const byId = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c._id, c);
    return map;
  }, [categories]);

  const income = categories.filter((c) => c.type === "INCOME");
  const expense = categories.filter((c) => c.type === "EXPENSE");

  function parentOptions(type: "INCOME" | "EXPENSE", excludeId?: string) {
    return categories.filter(
      (c) => c.type === type && c._id !== excludeId && !c.parentId
    );
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parentId = String(form.get("parentId") || "");
    setBusy(true);
    try {
      await api("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") || "").trim(),
          type: String(form.get("type")),
          ...(parentId ? { parentId } : {}),
        }),
      });
      toast.success(t("settings.categoriesCreated"));
      setCreateOpen(false);
      setCreateType("EXPENSE");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    const parentId = String(form.get("parentId") || "");
    setBusy(true);
    try {
      await api(`/api/categories/${editing._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name") || "").trim(),
          parentId: parentId || null,
        }),
      });
      toast.success(t("settings.categoriesUpdated"));
      setEditId(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(category: Category) {
    if (!window.confirm(t("settings.categoriesDeleteConfirm", { name: category.name }))) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/categories/${category._id}`, { method: "DELETE" });
      toast.success(t("settings.categoriesDeleted"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  function CategoryRow({ category }: { category: Category }) {
    const parentName = category.parentId
      ? byId.get(String(category.parentId))?.name
      : null;

    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {parentName ? (
              <span className="text-muted-foreground">{parentName} / </span>
            ) : null}
            {category.name}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {category.type === "INCOME"
                ? t("transactions.income")
                : t("transactions.expense")}
            </Badge>
            {category.isSystem ? (
              <Badge variant="outline" className="text-[10px]">
                {t("settings.categoriesSystem")}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="touch-manipulation"
            disabled={busy}
            onClick={() => setEditId(category._id)}
          >
            {t("common.edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="touch-manipulation text-destructive"
            disabled={busy}
            onClick={() => onDelete(category)}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>
    );
  }

  function CategoryGroup({
    title,
    items,
  }: {
    title: string;
    items: Category[];
  }) {
    if (items.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <div className="space-y-2">
          {items.map((c) => (
            <CategoryRow key={c._id} category={c} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{t("settings.categories")}</CardTitle>
          <CardDescription>{t("settings.categoriesDesc")}</CardDescription>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(v) => {
            setCreateOpen(v);
            if (v) setCreateType("EXPENSE");
          }}
        >
          <DialogTrigger
            render={<Button size="sm" className="touch-manipulation" />}
          >
            {t("settings.categoriesAdd")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("settings.categoriesNew")}</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label htmlFor="cat-name">{t("common.name")}</Label>
                <Input
                  id="cat-name"
                  name="name"
                  required
                  maxLength={100}
                  placeholder={t("settings.categoriesNamePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-type">{t("common.type")}</Label>
                <select
                  id="cat-type"
                  name="type"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={createType}
                  onChange={(e) =>
                    setCreateType(e.target.value as "INCOME" | "EXPENSE")
                  }
                >
                  <option value="EXPENSE">{t("transactions.expense")}</option>
                  <option value="INCOME">{t("transactions.income")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-parent">
                  {t("settings.categoriesParent")}
                </Label>
                <select
                  id="cat-parent"
                  name="parentId"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">{t("settings.categoriesNoParent")}</option>
                  {parentOptions(createType).map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t("common.saving") : t("common.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            <CategoryGroup
              title={t("transactions.expense")}
              items={expense}
            />
            <CategoryGroup title={t("transactions.income")} items={income} />
          </>
        )}
      </CardContent>

      <Dialog open={!!editId} onOpenChange={(v) => !v && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("common.editNamed", { name: editing.name })
                : t("common.edit")}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <form className="space-y-3" onSubmit={onEdit}>
              <div className="space-y-2">
                <Label htmlFor="edit-cat-name">{t("common.name")}</Label>
                <Input
                  id="edit-cat-name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cat-parent">
                  {t("settings.categoriesParent")}
                </Label>
                <select
                  id="edit-cat-parent"
                  name="parentId"
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  defaultValue={
                    editing.parentId ? String(editing.parentId) : ""
                  }
                >
                  <option value="">{t("settings.categoriesNoParent")}</option>
                  {parentOptions(editing.type, editing._id).map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t("common.saving") : t("common.saveChanges")}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
