import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatPrefixExamples,
  getWaPrefix,
  stripWaPrefix,
} from "@/lib/whatsapp/prefix";

describe("getWaPrefix", () => {
  const saved = process.env.WA_PREFIX;

  beforeEach(() => {
    delete process.env.WA_PREFIX;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.WA_PREFIX;
    else process.env.WA_PREFIX = saved;
  });

  it('defaults to "finora" when unset', () => {
    expect(getWaPrefix()).toBe("finora");
  });

  it("normalizes env value", () => {
    process.env.WA_PREFIX = "  Finora ";
    expect(getWaPrefix()).toBe("finora");
  });

  it("allows empty prefix (pass-through mode)", () => {
    process.env.WA_PREFIX = "";
    expect(getWaPrefix()).toBe("");
  });
});

describe("stripWaPrefix", () => {
  const saved = process.env.WA_PREFIX;

  beforeEach(() => {
    process.env.WA_PREFIX = "finora";
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.WA_PREFIX;
    else process.env.WA_PREFIX = saved;
  });

  it("strips space, colon, dot, and slash forms", () => {
    expect(stripWaPrefix("finora makan 50rb")).toEqual({
      ok: true,
      body: "makan 50rb",
    });
    expect(stripWaPrefix("Finora: saldo")).toEqual({ ok: true, body: "saldo" });
    expect(stripWaPrefix("/finora help")).toEqual({ ok: true, body: "help" });
  });

  it("maps bare prefix to help", () => {
    expect(stripWaPrefix("finora")).toEqual({ ok: true, body: "help" });
  });

  it("rejects missing prefix", () => {
    expect(stripWaPrefix("makan 50rb")).toEqual({
      ok: false,
      reason: "missing_prefix",
    });
  });
});

describe("formatPrefixExamples", () => {
  const saved = process.env.WA_PREFIX;

  afterEach(() => {
    if (saved === undefined) delete process.env.WA_PREFIX;
    else process.env.WA_PREFIX = saved;
  });

  it("includes prefix when set", () => {
    process.env.WA_PREFIX = "finora";
    expect(formatPrefixExamples()).toBe("finora makan 50rb");
  });

  it("omits prefix when disabled", () => {
    process.env.WA_PREFIX = "";
    expect(formatPrefixExamples()).toBe("makan 50rb");
  });
});
