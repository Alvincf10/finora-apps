import { describe, expect, it } from "vitest";
import {
  EDUCATION_PATTERNS,
  EMERGENCY_PATTERNS,
  resolveGoalByType,
} from "@/lib/financial/wealth-ladder-math";

describe("resolveGoalByType", () => {
  it("prefers typed goalType over name match", () => {
    const goals = [
      { name: "Dana darurat keluarga", goalType: undefined },
      { name: "EF", goalType: "EMERGENCY_FUND" },
    ];
    const r = resolveGoalByType(goals, "EMERGENCY_FUND", EMERGENCY_PATTERNS);
    expect(r.goal?.name).toBe("EF");
    expect(r.nameInferred).toBe(false);
  });

  it("falls back to name with nameInferred flag", () => {
    const r = resolveGoalByType(
      [{ name: "Dana pendidikan anak", goalType: "OTHER" }],
      "EDUCATION",
      EDUCATION_PATTERNS
    );
    expect(r.goal?.name).toBe("Dana pendidikan anak");
    expect(r.nameInferred).toBe(true);
  });

  it("returns null when nothing matches", () => {
    const r = resolveGoalByType(
      [{ name: "Liburan", goalType: "OTHER" }],
      "EDUCATION",
      EDUCATION_PATTERNS
    );
    expect(r.goal).toBeNull();
    expect(r.nameInferred).toBe(false);
  });
});

describe("education gate semantics (FR-03)", () => {
  it("name-only education goal must not clear the step gate", () => {
    const resolved = resolveGoalByType(
      [{ name: "Sekolah anak", goalType: null }],
      "EDUCATION",
      EDUCATION_PATTERNS
    );
    const educationTyped = Boolean(resolved.goal && !resolved.nameInferred);
    expect(educationTyped).toBe(false);
  });

  it("typed EDUCATION goal clears the planned gate", () => {
    const resolved = resolveGoalByType(
      [{ name: "Kuliah", goalType: "EDUCATION" }],
      "EDUCATION",
      EDUCATION_PATTERNS
    );
    const educationTyped = Boolean(resolved.goal && !resolved.nameInferred);
    expect(educationTyped).toBe(true);
  });
});
