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
  CalendarDays,
  Receipt,
  MessageCircle,
  Ellipsis,
  TrendingUp,
  Bell,
  WalletCards,
  type LucideIcon,
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

type NavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  featured?: boolean;
};

const navGroupDefs: ReadonlyArray<{
  labelKey: string;
  items: ReadonlyArray<NavItem>;
}> = [
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
        featured: true,
      },
      {
        href: "/payday",
        labelKey: "nav.paydayAllocation",
        icon: WalletCards,
        featured: true,
      },
      { href: "/budget", labelKey: "nav.budget", icon: PiggyBank },
      { href: "/debts", labelKey: "nav.debts", icon: Landmark },
      { href: "/fixed-costs", labelKey: "nav.fixedCosts", icon: Receipt },
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
      {
        href: "/reports/weekly",
        labelKey: "nav.weeklyReview",
        icon: CalendarDays,
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
];

const mobileTabDefs = [
  { href: "/dashboard", labelKey: "nav.home", icon: LayoutDashboard },
  {
    href: "/transactions",
    labelKey: "nav.transactions",
    icon: ArrowLeftRight,
  },
  {
    href: "/payday",
    labelKey: "nav.payday",
    icon: WalletCards,
    center: true,
  },
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

function pageTitle(pathname: string, t: (key: string) => string) {
  for (const group of navGroupDefs) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href)) return t(item.labelKey);
    }
  }
  return "Finora";
}

function NavLinks({
  onNavigate,
  variant = "list",
}: {
  onNavigate?: () => void;
  variant?: "list" | "grid";
}) {
  const pathname = usePathname();
  const t = useT();

  if (variant === "grid") {
    return (
      <nav className="flex flex-col gap-5">
        {navGroupDefs.map((group) => (
          <div key={group.labelKey} className="space-y-2.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(group.labelKey)}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center text-[11px] font-medium leading-tight touch-manipulation transition-all",
                      active
                        ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.15)]"
                        : item.featured
                          ? "bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/25 hover:bg-emerald-500/15"
                          : "bg-muted/60 text-muted-foreground ring-1 ring-border/60 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl transition-colors",
                        active
                          ? "bg-emerald-400/25 text-emerald-200"
                          : item.featured
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-background/50 text-foreground/80"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="line-clamp-2">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-5">
      {navGroupDefs.map((group) => (
        <div key={group.labelKey} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
                  "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all touch-manipulation",
                  active
                    ? "border-l-[3px] border-l-emerald-600 bg-emerald-500/15 font-medium text-emerald-800 dark:border-l-emerald-400 dark:text-emerald-200"
                    : "border-l-[3px] border-l-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : item.featured
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted/70 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="truncate">{t(item.labelKey)}</span>
                {item.featured && !active ? (
                  <span className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500/70" />
                ) : null}
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
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-50 via-background to-slate-100 dark:from-emerald-950/40 dark:via-background dark:to-background">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/90 p-4 backdrop-blur-xl md:flex">
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
            <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm ring-1 ring-border/50">
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
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl md:hidden pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center gap-2 px-4">
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
                className="size-10 shrink-0 touch-manipulation border-border/80 bg-card/60"
                onClick={() => setMoreOpen(true)}
                aria-label={t("nav.moreMenu")}
              >
                <Ellipsis className="size-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden px-4 py-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
            {children}
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/92 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)]"
            aria-label={t("nav.mainNav")}
          >
            <div className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5 px-1">
              {mobileTabDefs.map((tab) => {
                const Icon = tab.icon;
                const active = isActivePath(pathname, tab.href);
                const isCenter = "center" in tab && tab.center;

                if (isCenter) {
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="relative flex flex-col items-center justify-center touch-manipulation"
                    >
                      <span
                        className={cn(
                          "-mt-5 flex size-14 items-center justify-center rounded-2xl shadow-lg transition-transform active:scale-95",
                          active
                            ? "bg-emerald-500 text-emerald-950 shadow-emerald-500/35 ring-2 ring-emerald-300/40"
                            : "bg-emerald-600 text-white shadow-emerald-900/40 ring-1 ring-emerald-400/30 dark:bg-emerald-500 dark:text-emerald-950"
                        )}
                      >
                        <Icon className="size-6" strokeWidth={2.25} />
                      </span>
                      <span
                        className={cn(
                          "mt-1 text-[10px] font-semibold",
                          active
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-muted-foreground"
                        )}
                      >
                        {t(tab.labelKey)}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 text-[11px] font-medium touch-manipulation transition-colors",
                      active
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl transition-colors",
                        active &&
                          "bg-emerald-500/15 dark:bg-emerald-400/15"
                      )}
                    >
                      <Icon
                        className="size-5"
                        strokeWidth={active ? 2.35 : 2}
                      />
                    </span>
                    <span>{t(tab.labelKey)}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px] font-medium touch-manipulation transition-colors",
                  !tabActive
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl transition-colors",
                    !tabActive && "bg-emerald-500/15 dark:bg-emerald-400/15"
                  )}
                >
                  <Ellipsis
                    className="size-5"
                    strokeWidth={!tabActive ? 2.35 : 2}
                  />
                </span>
                <span>{t("common.more")}</span>
              </button>
            </div>
          </nav>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[88dvh] rounded-t-3xl border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
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
                <NavLinks
                  variant="grid"
                  onNavigate={() => setMoreOpen(false)}
                />
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
