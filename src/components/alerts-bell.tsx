"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getDismissedAlertIds } from "@/lib/alert-dismiss";
import { useApi } from "@/lib/use-api";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type ActionCenterResponse = {
  counts: { total: number; critical: number };
  actions: Array<{
    id: string;
    source: "ALERT" | "RECOMMENDATION";
    priority: string;
  }>;
};

export function AlertsBell({ className }: { className?: string }) {
  const t = useT();
  const { data } = useApi<ActionCenterResponse>("/api/action-center", {
    shouldRetryOnError: false,
  });

  const { visibleCount, hasCritical } = useMemo(() => {
    if (!data) return { visibleCount: 0, hasCritical: false };
    const dismissed = getDismissedAlertIds();
    const remaining = data.actions.filter(
      (a) => a.source !== "ALERT" || !dismissed.has(a.id)
    );
    return {
      visibleCount: remaining.length,
      hasCritical: remaining.some(
        (a) => a.priority === "CRITICAL" || a.priority === "HIGH"
      ),
    };
  }, [data]);

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
