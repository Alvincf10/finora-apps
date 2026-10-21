import { en, type Dictionary } from "./dictionaries/en";
import { id } from "./dictionaries/id";
import {
  DEFAULT_LOCALE,
  INTL_LOCALE,
  LOCALES,
  type Locale,
  type TranslationParams,
} from "./types";

export type { Dictionary, Locale, TranslationParams };
export {
  DEFAULT_LOCALE,
  INTL_LOCALE,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  LOCALES,
} from "./types";

export const dictionaries: Record<Locale, Dictionary> = { id, en };

type NestedKeyOf<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
        : Prefix extends ""
          ? K
          : `${Prefix}.${K}`;
    }[keyof T & string]
  : never;

export type TranslationKey = NestedKeyOf<Dictionary>;

function getByPath(dict: Dictionary, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function interpolate(
  template: string,
  params?: TranslationParams
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{${key}}`
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey | string,
  params?: TranslationParams
): string {
  const primary = getByPath(dictionaries[locale], key);
  const fallback =
    locale !== DEFAULT_LOCALE
      ? getByPath(dictionaries[DEFAULT_LOCALE], key)
      : undefined;
  return interpolate(primary ?? fallback ?? key, params);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
