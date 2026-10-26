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

type ActionItem = {
  id: string;
  issueKey: string;
  source: "ALERT" | "RECOMMENDATION";
  type: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  message: string;
  href?: string;
  status?: string;
  dueDate?: string | null;
  ruleVersion?: string | null;
};

type ActionCenterResponse = {
  actions: ActionItem[];
  counts: {
    total: number;
    critical: number;
    high: number;
    alerts: number;
    recommendations: number;
  };
  period: { year: number; month: number };
};

function typeLabel(type: string) {
  return type
    .replace(/^ALERT_/, "")
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function priorityVariant(
  priority: ActionItem["priority"]
): "destructive" | "secondary" | "outline" {
  if (priority === "CRITICAL" || priority === "HIGH") return "destructive";
  if (priority === "MEDIUM") return "secondary";
  return "outline";
}

export default function AlertsPage() {
  const { t, intlLocale } = useI18n();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [counts, setCounts] = useState<ActionCenterResponse["counts"] | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const qs = refresh ? "?refresh=1" : "";
        const data = await api<ActionCenterResponse>(
          `/api/action-center${qs}`
        );
        const dismissed = getDismissedAlertIds();
        setActions(
          data.actions.filter(
            (a) => a.source !== "ALERT" || !dismissed.has(a.id)
          )
        );
        setCounts(data.counts);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.failed"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  function onDismissAlert(id: string) {
    dismissAlert(id);
    setActions((prev) => prev.filter((a) => a.id !== id));
  }

  async function onRecStatus(
    id: string,
    status: "ACCEPTED" | "DISMISSED" | "VIEWED"
  ) {
    try {
      await api("/api/action-center", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
    }
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
          <h1 className="font-heading text-3xl font-semibold">Action Center</h1>
          <p className="text-muted-foreground">
            Prioritas tindakan dari alert live + rekomendasi — deduplikasi
            otomatis.
          </p>
          {counts ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {counts.total} aktif · {counts.critical} critical ·{" "}
              {counts.alerts} alert · {counts.recommendations} rekomendasi
            </p>
          ) : null}
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
            onClick={() => void load(true)}
            disabled={loading}
          >
            {loading ? t("common.refreshing") : t("common.refresh")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm text-muted-foreground">
          <p>
            Alert bersifat live; rekomendasi tersimpan dengan issue key stabil.
            Masalah yang sama tidak ditampilkan dua kali.
          </p>
          <p>{t("alerts.dismissHint")}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {actions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {loading ? t("common.loading") : t("alerts.empty")}
            </CardContent>
          </Card>
        ) : (
          actions.map((item) => (
            <Card key={`${item.source}:${item.id}`}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={priorityVariant(item.priority)}>
                    {item.priority}
                  </Badge>
                  <Badge variant="outline">{typeLabel(item.type)}</Badge>
                  <Badge variant="outline">{item.source}</Badge>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <CardDescription>{item.message}</CardDescription>
                {item.dueDate ? (
                  <p className="text-xs text-muted-foreground">
                    {t("alerts.due", {
                      date: new Date(item.dueDate).toLocaleDateString(
                        intlLocale
                      ),
                    })}
                  </p>
                ) : null}
                <p className="font-mono text-[10px] text-muted-foreground">
                  {item.issueKey}
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
                  >
                    {t("alerts.open")}
                  </Link>
                ) : null}
                {item.source === "ALERT" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDismissAlert(item.id)}
                  >
                    {t("alerts.dismiss")}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void onRecStatus(item.id, "ACCEPTED")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onRecStatus(item.id, "DISMISSED")}
                    >
                      {t("alerts.dismiss")}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
