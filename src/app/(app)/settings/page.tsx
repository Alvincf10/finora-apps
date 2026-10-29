"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import {
  DECISION_PREFERENCE_LABELS,
  DECISION_PREFERENCES,
} from "@/lib/ai/decision-preferences";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SettingsCategories } from "@/components/settings-categories";
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

type DecisionPreference =
  | "UNSET"
  | "LIQUIDITY"
  | "DEBT_PAYOFF"
  | "MAXIMIZE_SAVINGS"
  | "SPENDING_STABILITY"
  | "ROADMAP_FOCUS";

type Settings = {
  paydayDay: number;
  monthlySalary: number;
  baseCurrency: Currency;
  timezone: string;
  name: string;
  email: string;
  decisionPreference?: DecisionPreference;
};

export default function SettingsPage() {
  const { data } = useSession();
  const { theme, setTheme } = useTheme();
  const { t, intlLocale, locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [paydayDay, setPaydayDay] = useState(25);
  const [salaryMajor, setSalaryMajor] = useState(0);
  const [decisionPreference, setDecisionPreference] =
    useState<DecisionPreference>("UNSET");
  const [saving, setSaving] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

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
        setDecisionPreference(s.decisionPreference ?? "UNSET");
      })
      .catch((e) => toast.error(e.message));
  }, []);

  async function saveDecisionPreference(next: DecisionPreference) {
    setDecisionPreference(next);
    setSavingPref(true);
    try {
      const updated = await api<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ decisionPreference: next }),
      });
      setSettings(updated);
      setDecisionPreference(updated.decisionPreference ?? next);
      toast.success(t("decisionAdvisor.preferenceSaved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSavingPref(false);
    }
  }

  async function savePayCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    if (!salaryMajor || salaryMajor <= 0) {
      toast.error(t("settings.salaryRequired"));
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
        toast.error(t("settings.salarySaveFailed"));
        return;
      }
      setSettings(updated);
      setSalaryMajor(
        fromMinorUnits(updated.monthlySalary, updated.baseCurrency)
      );
      setPaydayDay(updated.paydayDay);
      toast.success(
        t("settings.savedPayCycle", {
          salary: updated.monthlySalary.toLocaleString(intlLocale),
          day: updated.paydayDay,
        })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  const currency = settings?.baseCurrency ?? "IDR";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.profile")}</CardTitle>
          <CardDescription>{t("settings.profileDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t("common.name")}: </span>
            {data?.user?.name ?? settings?.name}
          </p>
          <p>
            <span className="text-muted-foreground">{t("common.email")}: </span>
            {data?.user?.email ?? settings?.email}
          </p>
          <p>
            <span className="text-muted-foreground">
              {t("settings.baseCurrency")}:{" "}
            </span>
            {data?.user?.baseCurrency ?? settings?.baseCurrency}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
          <CardDescription>{t("settings.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <SettingsCategories />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.payCycle")}</CardTitle>
          <CardDescription>{t("settings.payCycleDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={savePayCycle}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paydayDay">{t("settings.payday")}</Label>
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
                  {t("settings.paydayHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.monthlySalary")}</Label>
                <CurrencyAmountInput
                  currency={currency}
                  value={salaryMajor}
                  onValueChange={setSalaryMajor}
                  allowEmpty
                  placeholder={t("settings.salaryPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {salaryMajor > 0
                    ? t("settings.salaryReady", {
                        amount: salaryMajor.toLocaleString(intlLocale),
                      })
                    : t("settings.salaryHint")}
                </p>
              </div>
            </div>
            <Button type="submit" disabled={saving || !settings}>
              {saving ? t("common.saving") : t("settings.savePayCycle")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("decisionAdvisor.preferenceLabel")}</CardTitle>
          <CardDescription>
            {t("decisionAdvisor.preferenceHint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="settings-decision-pref">
            {t("decisionAdvisor.title")}
          </Label>
          <select
            id="settings-decision-pref"
            className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
            value={decisionPreference}
            disabled={savingPref || !settings}
            onChange={(e) =>
              void saveDecisionPreference(
                e.target.value as DecisionPreference
              )
            }
          >
            {DECISION_PREFERENCES.map((code) => (
              <option key={code} value={code}>
                {DECISION_PREFERENCE_LABELS[code][locale === "en" ? "en" : "id"]}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.theme")}</CardTitle>
          <CardDescription>{t("settings.themeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={activeTheme === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
          >
            {t("settings.themeLight")}
          </Button>
          <Button
            variant={activeTheme === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
          >
            {t("settings.themeDark")}
          </Button>
          <Button
            variant={activeTheme === "system" ? "default" : "outline"}
            onClick={() => setTheme("system")}
          >
            {t("settings.themeSystem")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
