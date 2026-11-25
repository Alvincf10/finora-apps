"use client";

import { useEffect, useState } from "react";
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
  Lightbulb,
  CalendarDays,
  Receipt,
  MessageCircle,
  Ellipsis,
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
import { prefetchPrimaryTabs } from "@/lib/use-api";

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
      {
        href: "/reports/weekly",
        labelKey: "nav.weeklyReview",
        icon: CalendarDays,
      },
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
  if (pathname.startsWith("/debts/crush")) return t("debtCrush.title");
  if (pathname.startsWith("/debts/history")) return t("debts.historyTitle");
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
            <p className="px-1 text-[11px] font-semibold tracking-[0.08em] text-on-surface-variant">
              {t(group.labelKey)}
            </p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-[5rem] flex-col items-center justify-center gap-2 rounded-[1.25rem] px-2 py-3 text-center text-[11px] font-medium leading-tight touch-manipulation transition-colors active:scale-[0.98]",
                      active
                        ? "bg-secondary-container text-on-secondary-container"
                        : item.featured
                          ? "bg-primary-container/70 text-on-primary-container"
                          : "bg-surface-container-high text-on-surface-variant"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : item.featured
                            ? "bg-primary/15 text-primary"
                            : "bg-surface-container-lowest text-foreground"
                      )}
                    >
                      <Icon className="size-5" strokeWidth={active ? 2.25 : 2} />
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

  useEffect(() => {
    prefetchPrimaryTabs();
  }, []);

  return (
    <div className="min-h-dvh bg-surface md:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] md:from-emerald-50 md:via-background md:to-slate-100 dark:md:from-emerald-950/40 dark:md:via-background dark:md:to-background">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 p-4 md:flex md:bg-sidebar/90 md:backdrop-blur-xl">
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
          {/* Material You top app bar — mobile only */}
          <header className="sticky top-0 z-20 bg-surface-container md:hidden pt-[env(safe-area-inset-top)]">
            <div className="flex h-16 items-center gap-1 px-3">
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate font-heading text-[1.125rem] font-semibold tracking-tight text-primary">
                  Finora
                </p>
                <p className="truncate text-xs text-on-surface-variant">
                  {title}
                </p>
              </div>
              <AlertsBell className="size-11 rounded-full border-0 bg-surface-container-high text-on-surface-variant shadow-none hover:bg-surface-container-highest" />
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 touch-manipulation rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                onClick={() => setMoreOpen(true)}
                aria-label={t("nav.moreMenu")}
              >
                <Ellipsis className="size-5" />
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden px-4 py-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
            {children}
          </main>

          {/* Material You navigation bar — mobile only */}
          <nav
            className="fixed inset-x-0 bottom-0 z-30 md:hidden pb-[env(safe-area-inset-bottom)]"
            aria-label={t("nav.mainNav")}
          >
            <div className="mx-2 mb-2 rounded-[1.75rem] bg-surface-container px-1 shadow-[0_-1px_0_0_color-mix(in_oklch,var(--outline-variant)_40%,transparent)] dark:shadow-[0_0_0_1px_color-mix(in_oklch,var(--outline-variant)_35%,transparent)]">
              <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5">
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
                            "-mt-7 flex size-14 items-center justify-center rounded-[1.125rem] transition-transform active:scale-95",
                            active
                              ? "bg-primary text-primary-foreground shadow-[0_4px_12px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
                              : "bg-primary-container text-on-primary-container shadow-[0_2px_8px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                          )}
                        >
                          <Icon className="size-6" strokeWidth={2.25} />
                        </span>
                        <span
                          className={cn(
                            "mt-1.5 text-[10px] font-semibold tracking-wide",
                            active
                              ? "text-primary"
                              : "text-on-surface-variant"
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
                        "flex flex-col items-center justify-center gap-1 touch-manipulation transition-colors",
                        active
                          ? "text-on-secondary-container"
                          : "text-on-surface-variant"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-[4rem] items-center justify-center rounded-full transition-colors",
                          active && "bg-secondary-container"
                        )}
                      >
                        <Icon
                          className="size-5"
                          strokeWidth={active ? 2.35 : 2}
                        />
                      </span>
                      <span
                        className={cn(
                          "text-[11px] leading-none",
                          active ? "font-semibold text-primary" : "font-medium"
                        )}
                      >
                        {t(tab.labelKey)}
                      </span>
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 touch-manipulation transition-colors",
                    !tabActive
                      ? "text-on-secondary-container"
                      : "text-on-surface-variant"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-[4rem] items-center justify-center rounded-full transition-colors",
                      !tabActive && "bg-secondary-container"
                    )}
                  >
                    <Ellipsis
                      className="size-5"
                      strokeWidth={!tabActive ? 2.35 : 2}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-none",
                      !tabActive
                        ? "font-semibold text-primary"
                        : "font-medium"
                    )}
                  >
                    {t("common.more")}
                  </span>
                </button>
              </div>
            </div>
          </nav>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="max-h-[88dvh] gap-0 rounded-t-[1.75rem] border-0 bg-surface-container pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_color-mix(in_oklch,var(--foreground)_12%,transparent)] md:hidden"
            >
              <div
                className="mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full bg-outline-variant"
                aria-hidden
              />
              <SheetHeader className="text-left">
                <SheetTitle className="font-heading text-primary">
                  Finora
                </SheetTitle>
                <SheetDescription className="text-on-surface-variant">
                  {data?.user?.name ?? t("common.menu")} · {t("nav.allPages")}
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto overscroll-contain px-4 pb-5">
                <LanguageSwitcher compact className="mb-4" />
                <NavLinks
                  variant="grid"
                  onNavigate={() => setMoreOpen(false)}
                />
                <Separator className="my-4 bg-outline-variant/60" />
                <Button
                  variant="ghost"
                  className="w-full min-h-12 justify-start rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-foreground"
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
