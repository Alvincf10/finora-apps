"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Insight = {
  _id: string;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  message: string;
  evidence?: Array<Record<string, unknown>>;
  actionType?: string;
  status: string;
  currentValue?: number;
  recommendedValue?: number;
  difference?: number;
};

const MONEY_KEYS = new Set([
  "current",
  "average3m",
  "threshold",
  "budget",
  "projected",
  "income",
  "expense",
  "fund",
  "essentialMonthly",
  "currentPayment",
  "boostedPayment",
]);

const LABEL: Record<string, string> = {
  current: "Bulan ini",
  average3m: "Rata-rata 3 bln",
  threshold: "Batas wajar",
  budget: "Budget",
  projected: "Proyeksi EOM",
  changePercent: "Perubahan",
  income: "Income",
  expense: "Expense",
  fund: "Dana sekarang",
  essentialMonthly: "Essentials / bln",
  targetMonths: "Target (bulan)",
  currentMonths: "Estimasi lunas (skrg)",
  boostedMonths: "Estimasi lunas (+15%)",
  currentPayment: "Cicilan sekarang",
  boostedPayment: "Cicilan +15%",
  metric: "Metrik",
};

function typeLabel(type: string) {
  return type
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function actionLabel(actionType?: string) {
  if (actionType === "VIEW_BUDGET") return "Lihat budget";
  if (actionType === "SIMULATE") return "Buka simulator";
  if (actionType === "VIEW_SPENDING") return "Lihat transaksi";
  if (actionType === "VIEW_DEBT") return "Lihat hutang";
  if (actionType === "VIEW_GOALS") return "Lihat goals";
  if (actionType === "VIEW_FORECAST") return "Lihat forecast";
  return "Buka rekomendasi";
}

function formatEvidenceValue(
  key: string,
  value: unknown,
  currency: Currency
): string | null {
  if (value == null) return null;
  if (key === "metric") return null;
  if (key === "dueDate" && (typeof value === "string" || value instanceof Date)) {
    return new Date(value).toLocaleDateString("id-ID");
  }
  if (typeof value === "number") {
    if (key === "changePercent") return `${value}%`;
    if (MONEY_KEYS.has(key) || key.toLowerCase().includes("amount")) {
      return formatMoney(value, currency);
    }
    if (
      key.includes("Months") ||
      key === "targetMonths" ||
      key === "coverage"
    ) {
      return String(value);
    }
    // Heuristic: large ints are often minor units
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return formatMoney(value, currency);
    }
    return String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function EvidenceList({
  evidence,
  currency = "IDR",
}: {
  evidence: Array<Record<string, unknown>>;
  currency?: Currency;
}) {
  const rows = evidence.flatMap((item) =>
    Object.entries(item)
      .map(([key, value]) => {
        const formatted = formatEvidenceValue(key, value, currency);
        if (formatted == null) return null;
        return {
          key,
          label: LABEL[key] ?? key,
          value: formatted,
        };
      })
      .filter((r): r is { key: string; label: string; value: string } => r != null)
  );

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm sm:grid-cols-3">
      {rows.map((row) => (
        <div key={`${row.key}-${row.value}`} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="truncate font-mono tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function InsightsPage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const data = await api<Insight[]>(
        `/api/insights${refresh ? "?refresh=1" : ""}`
      );
      setItems(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: "VIEWED" | "ACCEPTED" | "DISMISSED") {
    try {
      await api("/api/insights", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  function actionHref(actionType?: string) {
    if (actionType === "VIEW_BUDGET") return "/budget";
    if (actionType === "SIMULATE") return "/simulator";
    if (actionType === "VIEW_SPENDING") return "/transactions";
    if (actionType === "VIEW_DEBT") return "/debts";
    if (actionType === "VIEW_GOALS") return "/goals";
    if (actionType === "VIEW_FORECAST") return "/forecast";
    return "/budget/recommendation";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            Financial Insights
          </h1>
          <p className="text-muted-foreground">
            Sinyal dari datamu — baca judul + angka, lalu Accept / Dismiss.
          </p>
        </div>
        <Button variant="outline" onClick={() => load(true)} disabled={loading}>
          {loading ? "Refreshing..." : "Regenerate"}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">HIGH</span> = perlu
            perhatian segera ·{" "}
            <span className="font-medium text-foreground">MEDIUM</span> = pantau ·{" "}
            <span className="font-medium text-foreground">LOW</span> = info saja
          </p>
          <p>
            <span className="font-medium text-foreground">Accept</span> = kamu setuju /
            sudah ditindak ·{" "}
            <span className="font-medium text-foreground">Dismiss</span> = abaikan
            untuk sekarang
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Belum ada insight. Catat transaksi beberapa bulan, lalu Regenerate.
              Anomaly butuh minimal 2 bulan history kategori yang sama.
            </CardContent>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item._id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      item.priority === "HIGH"
                        ? "destructive"
                        : item.priority === "MEDIUM"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {item.priority}
                  </Badge>
                  <Badge variant="outline">{typeLabel(item.type)}</Badge>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <CardDescription className="text-sm leading-relaxed">
                  {item.message}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.evidence?.length ? (
                  <EvidenceList evidence={item.evidence} />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={actionHref(item.actionType)}
                    className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
                  >
                    {actionLabel(item.actionType)}
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setStatus(item._id, "ACCEPTED")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus(item._id, "DISMISSED")}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
