"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "@/lib/client-api";
import { getDismissedAlertIds } from "@/lib/alert-dismiss";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type AlertsResponse = {
  count: number;
  critical: number;
  alerts: Array<{ id: string; severity: string }>;
};

export function AlertsBell({ className }: { className?: string }) {
  const t = useT();
  const [visibleCount, setVisibleCount] = useState(0);
  const [hasCritical, setHasCritical] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<AlertsResponse>("/api/alerts")
      .then((data) => {
        if (cancelled) return;
        const dismissed = getDismissedAlertIds();
        const remaining = data.alerts.filter((a) => !dismissed.has(a.id));
        setVisibleCount(remaining.length);
        setHasCritical(
          remaining.some((a) => a.severity === "CRITICAL")
        );
      })
      .catch(() => {
        /* silent — bell is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/alerts"
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "relative size-10 shrink-0 touch-manipulation",
        className
      )}
      aria-label={
        visibleCount > 0
          ? t("alerts.alertsCount", { count: visibleCount })
          : t("nav.alerts")
      }
    >
      <Bell className="size-4" />
      {visibleCount > 0 ? (
        <span
          className={cn(
            "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
            hasCritical ? "bg-rose-600" : "bg-amber-600"
          )}
        >
          {visibleCount > 9 ? "9+" : visibleCount}
        </span>
      ) : null}
    </Link>
  );
}
