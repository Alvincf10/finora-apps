import { describe, expect, it } from "vitest";
import {
  createAccountSchema,
  createTransactionSchema,
  registerSchema,
  updateWhatsappSchema,
  whatsappActionSchema,
} from "@/lib/validations";

describe("registerSchema", () => {
  it("accepts valid registration", () => {
    const parsed = registerSchema.parse({
      name: "Ada",
      email: "ada@example.com",
      password: "password1",
    });
    expect(parsed.baseCurrency).toBe("IDR");
  });

  it("rejects short password", () => {
    expect(() =>
      registerSchema.parse({
        name: "Ada",
        email: "ada@example.com",
        password: "short",
      })
    ).toThrow();
  });
});

describe("createTransactionSchema", () => {
  const base = {
    amount: 1000,
    currency: "IDR" as const,
    accountId: "acc1",
    date: "2026-11-09",
  };

  it("requires toAccountId for TRANSFER", () => {
    const r = createTransactionSchema.safeParse({
      ...base,
      type: "TRANSFER",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("toAccountId"))).toBe(
        true
      );
    }
  });

  it("requires categoryId for EXPENSE", () => {
    const r = createTransactionSchema.safeParse({
      ...base,
      type: "EXPENSE",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("categoryId"))).toBe(
        true
      );
    }
  });

  it("accepts valid expense", () => {
    expect(
      createTransactionSchema.safeParse({
        ...base,
        type: "EXPENSE",
        categoryId: "cat1",
      }).success
    ).toBe(true);
  });
});

describe("createAccountSchema", () => {
  it("parses account payload", () => {
    const parsed = createAccountSchema.parse({
      name: "BCA",
      type: "BANK",
      currency: "IDR",
      initialBalance: 0,
    });
    expect(parsed.name).toBe("BCA");
  });
});

describe("whatsappActionSchema", () => {
  it("allows start | stop | logout", () => {
    for (const action of ["start", "stop", "logout"] as const) {
      expect(whatsappActionSchema.parse({ action }).action).toBe(action);
    }
  });
});

describe("updateWhatsappSchema", () => {
  it("validates allowedFrom digits", () => {
    expect(
      updateWhatsappSchema.safeParse({ allowedFrom: "6281234567890" }).success
    ).toBe(true);
    expect(updateWhatsappSchema.safeParse({ allowedFrom: "abc" }).success).toBe(
      false
    );
  });
});
