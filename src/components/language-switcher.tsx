"use client";

import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={cn("flex flex-wrap gap-2", className)}
      role="group"
      aria-label={t("common.language")}
    >
      {LOCALES.map((code: Locale) => (
        <Button
          key={code}
          type="button"
          size={compact ? "sm" : "default"}
          variant={locale === code ? "default" : "outline"}
          onClick={() => setLocale(code)}
        >
          {compact ? code.toUpperCase() : LOCALE_LABELS[code]}
        </Button>
      ))}
    </div>
  );
}
