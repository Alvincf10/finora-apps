import { describe, expect, it } from "vitest";
import { escapeRegex, sanitizeSearchQuery } from "@/lib/escape-regex";

describe("escapeRegex", () => {
  it("escapes metacharacters", () => {
    expect(escapeRegex("a+b.*(c)")).toBe("a\\+b\\.\\*\\(c\\)");
  });
});

describe("sanitizeSearchQuery", () => {
  it("returns null for blank", () => {
    expect(sanitizeSearchQuery("   ")).toBeNull();
    expect(sanitizeSearchQuery(null)).toBeNull();
  });

  it("trims, caps length, and escapes", () => {
    const q = sanitizeSearchQuery("  makan.*  ", 80);
    expect(q).toBe("makan\\.\\*");
    const long = sanitizeSearchQuery(`abc${"x".repeat(200)}`, 10);
    expect(long).toBe(`abc${"x".repeat(7)}`);
  });
});

