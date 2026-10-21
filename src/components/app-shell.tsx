"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  Landmark,
  Target,
  BarChart3,
  Settings,
  LogOut,
  Sparkles,
  Lightbulb,
  FlaskConical,
  CalendarRange,
  Receipt,
  MessageCircle,
  Ellipsis,
  TrendingUp,
  Repeat,
  Bell,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useT } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { AlertsBell } from "@/components/alerts-bell";

const navGroupDefs = [
  {
    labelKey: "nav.overview",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/alerts", labelKey: "nav.alerts", icon: Bell },
    ],
  },
  {
    labelKey: "nav.money",
    items: [
      {
        href: "/transactions",
        labelKey: "nav.transactions",
        icon: ArrowLeftRight,
      },
      { href: "/accounts", labelKey: "nav.accounts", icon: Wallet },
    ],
  },
  {
    labelKey: "nav.planning",
    items: [
      {
        href: "/budget/recommendation",
        labelKey: "nav.smartBudget",
        icon: Sparkles,
      },
      { href: "/budget", labelKey: "nav.budget", icon: PiggyBank },
      { href: "/debts", labelKey: "nav.debts", icon: Landmark },
      { href: "/fixed-costs", labelKey: "nav.fixedCosts", icon: Receipt },
      { href: "/recurring", labelKey: "nav.recurring", icon: Repeat },
      { href: "/goals", labelKey: "nav.goals", icon: Target },
    ],
  },
  {
    labelKey: "nav.insights",
    items: [
      {
        href: "/insights",
        labelKey: "nav.financialInsights",
        icon: Lightbulb,
      },
      { href: "/forecast", labelKey: "nav.forecast", icon: TrendingUp },
      {
        href: "/reports/monthly",
        labelKey: "nav.monthlyReview",
        icon: CalendarRange,
      },
      { href: "/simulator", labelKey: "nav.simulator", icon: FlaskConical },
      { href: "/reports", labelKey: "nav.analytics", icon: BarChart3 },
    ],
  },
  {
    labelKey: "nav.system",
    items: [
      { href: "/whatsapp", labelKey: "nav.whatsapp", icon: MessageCircle },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
] as const;

const mobileTabDefs = [
  { href: "/dashboard", labelKey: "nav.home", icon: LayoutDashboard },
  {
    href: "/transactions",
    labelKey: "nav.transactions",
    icon: ArrowLeftRight,
  },
  { href: "/accounts", labelKey: "nav.accounts", icon: Wallet },
  { href: "/budget", labelKey: "nav.budget", icon: PiggyBank },
] as const;

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/budget" &&
      href !== "/reports" &&
      pathname.startsWith(href)) ||
    (href === "/budget" && pathname === "/budget") ||
    (href === "/reports" && pathname === "/reports")
  );
}

function pageTitle(
  pathname: string,
  t: (key: string) => string
) {
  for (const group of navGroupDefs) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href)) return t(item.labelKey);
    }
  }
  return "Finora";
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="flex flex-col gap-4">
      {navGroupDefs.map((group) => (
        <div key={group.labelKey} className="space-y-1">
          <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(group.labelKey)}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors touch-manipulation",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  const pathname = usePathname();
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const title = pageTitle(pathname, t);
  const tabActive = mobileTabDefs.some((tab) =>
    isActivePath(pathname, tab.href)
  );

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-950">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 p-4 backdrop-blur md:flex">
          <div className="mb-6 flex items-start justify-between gap-2 px-2">
            <div>
              <p className="font-heading text-xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">
                Finora
              </p>
              <p className="text-xs text-muted-foreground">{t("nav.tagline")}</p>
            </div>
            <AlertsBell />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain pr-1">
            <NavLinks />
          </div>
          <div className="mt-auto space-y-3 pt-6">
            <Separator />
            <LanguageSwitcher compact className="px-1" />
            <div className="px-2 text-sm">
              <p className="font-medium">{data?.user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {data?.user?.email}
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 size-4" />
              {t("common.signOut")}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur md:hidden pt-[env(safe-area-inset-top)]">
            <div className="flex h-12 items-center gap-2 px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-sm font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">
                  Finora
                </p>
                <p className="truncate text-xs text-muted-foreground">{title}</p>
              </div>
              <AlertsBell />
              <Button
                variant="outline"
                size="icon"
                className="size-10 shrink-0 touch-manipulation"
                onClick={() => setMoreOpen(true)}
                aria-label={t("nav.moreMenu")}
              >
                <Ellipsis className="size-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
            {children}
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]"
            aria-label={t("nav.mainNav")}
          >
            <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
              {mobileTabDefs.map((tab) => {
                const Icon = tab.icon;
                const active = isActivePath(pathname, tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium touch-manipulation transition-colors",
                      active
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-muted-foreground"
                    )}
                  >
                    <Icon
                      className={cn("size-5", active && "stroke-[2.25px]")}
                    />
                    <span>{t(tab.labelKey)}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium touch-manipulation transition-colors",
                  !tabActive
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-muted-foreground"
                )}
              >
                <Ellipsis
                  className={cn("size-5", !tabActive && "stroke-[2.25px]")}
                />
                <span>{t("common.more")}</span>
              </button>
            </div>
          </nav>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:hidden"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="font-heading text-emerald-800 dark:text-emerald-300">
                  Finora
                </SheetTitle>
                <SheetDescription>
                  {data?.user?.name ?? t("common.menu")} · {t("nav.allPages")}
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto overscroll-contain px-4 pb-4">
                <LanguageSwitcher compact className="mb-4" />
                <NavLinks onNavigate={() => setMoreOpen(false)} />
                <Separator className="my-4" />
                <Button
                  variant="ghost"
                  className="w-full justify-start min-h-11"
                  onClick={() => {
                    setMoreOpen(false);
                    signOut({ callbackUrl: "/login" });
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  {t("common.signOut")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
