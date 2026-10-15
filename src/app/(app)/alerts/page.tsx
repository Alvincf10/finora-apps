"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import {
  clearDismissedAlerts,
  dismissAlert,
  getDismissedAlertIds,
} from "@/lib/alert-dismiss";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AppAlert = {
  id: string;
  kind: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  href: string;
  dueDate?: string;
};

type AlertsResponse = {
  count: number;
  critical: number;
  alerts: AppAlert[];
};

function kindLabel(kind: string) {
  return kind
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AlertsResponse>("/api/alerts");
      const dismissed = getDismissedAlertIds();
      setAlerts(data.alerts.filter((a) => !dismissed.has(a.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onDismiss(id: string) {
    dismissAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  function onResetDismissals() {
    clearDismissedAlerts();
    void load();
    toast.success("Dismissed alerts restored");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Alerts</h1>
          <p className="text-muted-foreground">
            Reminder live dari data — utang, fixed cost, budget, recurring.
            Tanpa AI, tanpa push.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetDismissals}
            disabled={loading}
          >
            Restore dismissed
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">CRITICAL</span> —
            overdue / over budget ·{" "}
            <span className="font-medium text-foreground">WARNING</span> —
            due soon / budget ≥80% ·{" "}
            <span className="font-medium text-foreground">INFO</span> — soft
            reminder
          </p>
          <p>Dismiss hanya disimpan di browser ini (localStorage).</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {loading
                ? "Memuat…"
                : "Tidak ada alert aktif. Semua aman untuk sekarang."}
            </CardContent>
          </Card>
        ) : (
          alerts.map((alert) => (
            <Card key={alert.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      alert.severity === "CRITICAL"
                        ? "destructive"
                        : alert.severity === "WARNING"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {alert.severity}
                  </Badge>
                  <Badge variant="outline">{kindLabel(alert.kind)}</Badge>
                  <CardTitle className="text-lg">{alert.title}</CardTitle>
                </div>
                <CardDescription>{alert.message}</CardDescription>
                {alert.dueDate ? (
                  <p className="text-xs text-muted-foreground">
                    Due {new Date(alert.dueDate).toLocaleDateString("id-ID")}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Link
                  href={alert.href}
                  className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
                >
                  Open
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDismiss(alert.id)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
