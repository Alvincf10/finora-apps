"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AiExplainerContextType =
  | "financial_health"
  | "cash_flow_forecast"
  | "scenario"
  | "action_center"
  | "roadmap"
  | "general_summary"
  | "decision_advisor";

type Props = {
  contextType: AiExplainerContextType;
  contextRef?: {
    periodDays?: 30 | 60 | 90;
    scenarioId?: string;
    scenarioIds?: string[];
    year?: number;
    month?: number;
    decisionPreference?: string;
  };
  /** Prefill question; user can edit before submit */
  defaultQuestion?: string;
  title?: string;
  description?: string;
  className?: string;
};

export function AiExplainer({
  contextType,
  contextRef,
  defaultQuestion,
  title,
  description,
  className,
}: Props) {
  const { t } = useI18n();
  const [question, setQuestion] = useState(
    defaultQuestion ?? t("aiExplainer.defaultQuestion")
  );
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onExplain() {
    const q = question.trim();
    if (!q) {
      toast.error(t("aiExplainer.questionRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await api<{
        explanation: string;
        model?: string;
        disclaimer?: string;
        validationWarnings?: string[];
      }>("/api/ai/explain", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          contextType,
          contextRef,
        }),
      });
      setExplanation(
        result.disclaimer
          ? `${result.explanation}\n\n— ${result.disclaimer}`
          : result.explanation
      );
      setModel(result.model ?? null);
      setWarnings(result.validationWarnings ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("aiExplainer.unavailable");
      setError(message);
      setExplanation(null);
      setWarnings([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          {title ?? t("aiExplainer.title")}
        </CardTitle>
        <CardDescription>
          {description ?? t("aiExplainer.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("aiExplainer.placeholder")}
          maxLength={1000}
          disabled={loading}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => onExplain()}
            disabled={loading}
            className="touch-manipulation"
          >
            {loading ? t("aiExplainer.loading") : t("aiExplainer.cta")}
          </Button>
          {explanation || error ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onExplain()}
              className="touch-manipulation"
            >
              {t("aiExplainer.retry")}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("aiExplainer.loadingHint")}
          </p>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/30">
            {error}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/30">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}

        {explanation ? (
          <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 text-sm whitespace-pre-wrap dark:bg-emerald-950/30">
            {explanation}
            {model ? (
              <p className="text-xs text-muted-foreground">
                {t("aiExplainer.modelLabel", { model })}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
