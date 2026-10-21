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
import { useI18n } from "@/components/i18n-provider";
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
  const { t, intlLocale } = useI18n();
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AlertsResponse>("/api/alerts");
      const dismissed = getDismissedAlertIds();
      setAlerts(data.alerts.filter((a) => !dismissed.has(a.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
    toast.success(t("alerts.restored"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("alerts.title")}
          </h1>
          <p className="text-muted-foreground">{t("alerts.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetDismissals}
            disabled={loading}
          >
            {t("alerts.restoreDismissed")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? t("common.refreshing") : t("common.refresh")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm text-muted-foreground">
          <p>{t("alerts.legend")}</p>
          <p>{t("alerts.dismissHint")}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {loading ? t("common.loading") : t("alerts.empty")}
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
                    {t("alerts.due", {
                      date: new Date(alert.dueDate).toLocaleDateString(
                        intlLocale
                      ),
                    })}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Link
                  href={alert.href}
                  className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
                >
                  {t("alerts.open")}
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDismiss(alert.id)}
                >
                  {t("alerts.dismiss")}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
