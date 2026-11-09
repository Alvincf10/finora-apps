import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  interpolate,
  isLocale,
  resolveLocale,
  translate,
} from "@/lib/i18n";

describe("interpolate", () => {
  it("substitutes params and leaves unknown placeholders", () => {
    expect(interpolate("Hi {name}", { name: "Ada" })).toBe("Hi Ada");
    expect(interpolate("Hi {name}", undefined)).toBe("Hi {name}");
    expect(interpolate("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});

describe("translate", () => {
  it("resolves nested keys for locale", () => {
    expect(translate("id", "nav.dashboard")).toBeTruthy();
    expect(translate("en", "nav.dashboard")).toBeTruthy();
  });

  it("falls back to default locale then key", () => {
    expect(translate("en", "nonexistent.key.xyz")).toBe("nonexistent.key.xyz");
  });

  it("interpolates params", () => {
    const text = translate("id", "common.editNamed", { name: "Food" });
    expect(text).toContain("Food");
  });
});

describe("isLocale", () => {
  it("accepts supported locales only", () => {
    expect(isLocale("id")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("resolveLocale", () => {
  it("returns input when valid else default", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("xx")).toBe(DEFAULT_LOCALE);
  });
});
