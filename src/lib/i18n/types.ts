export type Locale = "id" | "en";

export const LOCALES: Locale[] = ["id", "en"];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_STORAGE_KEY = "finora-locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

export const INTL_LOCALE: Record<Locale, string> = {
  id: "id-ID",
  en: "en-US",
};

export type TranslationParams = Record<string, string | number>;
