"use client";

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
  Menu,
  LogOut,
  Sparkles,
  Lightbulb,
  FlaskConical,
  CalendarRange,
  Receipt,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const navGroups = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Money",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/accounts", label: "Accounts", icon: Wallet },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/budget/recommendation", label: "Smart Budget", icon: Sparkles },
      { href: "/budget", label: "Budget", icon: PiggyBank },
      { href: "/debts", label: "Debts", icon: Landmark },
      { href: "/fixed-costs", label: "Fixed costs", icon: Receipt },
      { href: "/goals", label: "Goals", icon: Target },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/insights", label: "Financial Insights", icon: Lightbulb },
      { href: "/reports/monthly", label: "Monthly Review", icon: CalendarRange },
      { href: "/simulator", label: "Simulator", icon: FlaskConical },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/budget" &&
                item.href !== "/reports" &&
                pathname.startsWith(item.href)) ||
              (item.href === "/budget" && pathname === "/budget") ||
              (item.href === "/reports" && pathname === "/reports");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
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

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 p-4 backdrop-blur md:flex">
          <div className="mb-6 px-2">
            <p className="font-heading text-xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">
              Finora
            </p>
            <p className="text-xs text-muted-foreground">
              Financial intelligence
            </p>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <NavLinks />
          </div>
          <div className="mt-auto space-y-3 pt-6">
            <Separator />
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
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur md:hidden">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="icon" />}>
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="font-heading text-emerald-800">
                    Finora
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>
            <p className="font-heading font-semibold">Finora</p>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
