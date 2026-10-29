"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import {
  DECISION_PREFERENCE_LABELS,
  DECISION_PREFERENCES,
  type DecisionPreference,
} from "@/lib/ai/decision-preferences";
import { useI18n } from "@/components/i18n-provider";
import { AiExplainer } from "@/components/ai-explainer";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ScenarioRow = { id: string; name: string };

type Props = {
  year?: number;
  month?: number;
  className?: string;
};

export function DecisionAdvisor({ year, month, className }: Props) {
  const { t, locale } = useI18n();
  const [preference, setPreference] = useState<DecisionPreference>("UNSET");
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingPref, setSavingPref] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const prefLang = locale === "en" ? "en" : "id";

  useEffect(() => {
    api<{
      features?: { decisionAdvisor?: boolean };
    }>("/api/ai/status")
      .then((s) => setEnabled(s.features?.decisionAdvisor !== false))
      .catch(() => setEnabled(true));

    api<{ decisionPreference?: DecisionPreference }>("/api/settings")
      .then((s) => {
        if (s.decisionPreference) setPreference(s.decisionPreference);
      })
      .catch(() => {
        /* settings optional for advisor session */
      });
    api<{ scenarios: ScenarioRow[] }>("/api/scenarios")
      .then((res) => setScenarios(res.scenarios ?? []))
      .catch(() => setScenarios([]));
  }, []);

  if (enabled === false) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {t("decisionAdvisor.disabled")}
        </CardContent>
      </Card>
    );
  }

  async function onPreferenceChange(next: DecisionPreference) {
    setPreference(next);
    setSavingPref(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ decisionPreference: next }),
      });
      toast.success(t("decisionAdvisor.preferenceSaved"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.failed")
      );
    } finally {
      setSavingPref(false);
    }
  }

  function toggleScenario(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        toast.error(t("decisionAdvisor.maxScenarios"));
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <div className={className ? `space-y-3 ${className}` : "space-y-3"}>
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">
            {t("decisionAdvisor.title")}
          </CardTitle>
          <CardDescription>{t("decisionAdvisor.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="decision-pref">
              {t("decisionAdvisor.preferenceLabel")}
            </Label>
            <select
              id="decision-pref"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
              value={preference}
              disabled={savingPref}
              onChange={(e) =>
                void onPreferenceChange(e.target.value as DecisionPreference)
              }
            >
              {DECISION_PREFERENCES.map((code) => (
                <option key={code} value={code}>
                  {DECISION_PREFERENCE_LABELS[code][prefLang]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("decisionAdvisor.preferenceHint")}
            </p>
          </div>

          {scenarios.length > 0 ? (
            <div className="space-y-2">
              <Label>{t("decisionAdvisor.scenariosLabel")}</Label>
              <ul className="space-y-1.5">
                {scenarios.map((s) => {
                  const checked = selectedIds.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border"
                          checked={checked}
                          onChange={() => toggleScenario(s.id)}
                        />
                        <span>{s.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                {t("decisionAdvisor.scenariosHint")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("decisionAdvisor.noScenarios")}
            </p>
          )}
        </CardContent>
      </Card>

      <AiExplainer
        key={`da:${preference}:${selectedIds.join(",")}:${locale}`}
        contextType="decision_advisor"
        contextRef={{
          ...(year && month ? { year, month } : {}),
          decisionPreference: preference,
          ...(selectedIds.length > 0 ? { scenarioIds: selectedIds } : {}),
        }}
        title={t("decisionAdvisor.askTitle")}
        description={t("decisionAdvisor.askDesc")}
        defaultQuestion={t("decisionAdvisor.defaultQuestion")}
      />
    </div>
  );
}
