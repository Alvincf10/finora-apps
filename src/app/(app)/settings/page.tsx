"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Settings = {
  paydayDay: number;
  monthlySalary: number;
  baseCurrency: Currency;
  timezone: string;
  name: string;
  email: string;
};

export default function SettingsPage() {
  const { data } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [paydayDay, setPaydayDay] = useState(25);
  const [salaryMajor, setSalaryMajor] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? theme : undefined;

  useEffect(() => {
    api<Settings>("/api/settings")
      .then((s) => {
        setSettings(s);
        setPaydayDay(s.paydayDay ?? 25);
        setSalaryMajor(
          fromMinorUnits(s.monthlySalary ?? 0, s.baseCurrency ?? "IDR")
        );
      })
      .catch((e) => toast.error(e.message));
  }, []);

  async function savePayCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    if (!salaryMajor || salaryMajor <= 0) {
      toast.error("Isi nominal gaji dulu (placeholder abu-abu bukan nilai tersimpan)");
      return;
    }
    setSaving(true);
    try {
      const monthlySalary = toMinorUnits(salaryMajor, settings.baseCurrency);
      const updated = await api<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          paydayDay,
          monthlySalary,
        }),
      });
      if ((updated.monthlySalary ?? 0) <= 0) {
        toast.error("Gaji gagal tersimpan. Coba save lagi.");
        return;
      }
      setSettings(updated);
      setSalaryMajor(
        fromMinorUnits(updated.monthlySalary, updated.baseCurrency)
      );
      setPaydayDay(updated.paydayDay);
      toast.success(
        `Tersimpan: gaji ${updated.monthlySalary.toLocaleString("id-ID")} · tgl ${updated.paydayDay}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const currency = settings?.baseCurrency ?? "IDR";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Profile, pay cycle, and appearance.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>From your authenticated session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name: </span>
            {data?.user?.name ?? settings?.name}
          </p>
          <p>
            <span className="text-muted-foreground">Email: </span>
            {data?.user?.email ?? settings?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Base currency: </span>
            {data?.user?.baseCurrency ?? settings?.baseCurrency}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pay cycle & salary</CardTitle>
          <CardDescription>
            Gaji dihitung otomatis tiap cycle (payday → sehari sebelum payday
            berikutnya). Tidak perlu input transaksi gaji setiap bulan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={savePayCycle}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paydayDay">Payday (tanggal)</Label>
                <Input
                  id="paydayDay"
                  type="number"
                  min={1}
                  max={28}
                  value={paydayDay}
                  onChange={(e) => setPaydayDay(Number(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Contoh 25 → cycle 25 Okt sampai 24 Nov (periode gaji
                  berikutnya / berjalan).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Monthly salary (take-home)</Label>
                <CurrencyAmountInput
                  currency={currency}
                  value={salaryMajor}
                  onValueChange={setSalaryMajor}
                  allowEmpty
                  placeholder="Contoh: 15.000.000"
                />
                <p className="text-xs text-muted-foreground">
                  {salaryMajor > 0
                    ? `Nilai siap disimpan: ${salaryMajor.toLocaleString("id-ID")}`
                    : "Ketik nominal gaji — teks abu-abu di kotak hanya contoh, bukan data tersimpan."}
                </p>
              </div>
            </div>
            <Button type="submit" disabled={saving || !settings}>
              {saving ? "Saving..." : "Save pay cycle"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Light, dark, or system</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={activeTheme === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
          >
            Light
          </Button>
          <Button
            variant={activeTheme === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
          >
            Dark
          </Button>
          <Button
            variant={activeTheme === "system" ? "default" : "outline"}
            onClick={() => setTheme("system")}
          >
            System
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
