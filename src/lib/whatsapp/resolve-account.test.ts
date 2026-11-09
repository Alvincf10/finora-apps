import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOne, find } = vi.hoisted(() => ({
  findOne: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/models/Account", () => ({
  Account: {
    findOne,
    find,
  },
}));

import { resolveWaAccount } from "@/lib/whatsapp/resolve-account";

describe("resolveWaAccount", () => {
  beforeEach(() => {
    findOne.mockReset();
    find.mockReset();
  });

  it("requires default account when no hint", async () => {
    const res = await resolveWaAccount("u1", null, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/rekening default/);
  });

  it("returns default account when no hint", async () => {
    const account = { _id: "a1", name: "BCA", type: "BANK" };
    findOne.mockResolvedValue(account);
    const res = await resolveWaAccount("u1", "a1", null);
    expect(res).toEqual({ ok: true, account });
  });

  it("errors when default missing", async () => {
    findOne.mockResolvedValue(null);
    const res = await resolveWaAccount("u1", "missing", null);
    expect(res.ok).toBe(false);
  });

  it("picks sole CC when hint is cc", async () => {
    const cc = { _id: "c1", name: "BCA CC", type: "CREDIT_CARD" };
    find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([cc]),
    });
    const res = await resolveWaAccount("u1", null, "cc");
    expect(res).toEqual({ ok: true, account: cc });
  });

  it("prefers default among multiple debit accounts", async () => {
    const a = { _id: "b1", name: "BCA", type: "BANK" };
    const b = { _id: "b2", name: "Mandiri", type: "BANK" };
    find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([a, b]),
    });
    const res = await resolveWaAccount("u1", "b2", "debit");
    expect(res).toEqual({ ok: true, account: b });
  });

  it("asks user to pick when multiple CC and default is not one of them", async () => {
    const cards = [
      { _id: "c1", name: "BCA CC", type: "CREDIT_CARD" },
      { _id: "c2", name: "Mandiri CC", type: "CREDIT_CARD" },
    ];
    find.mockReturnValue({
      sort: vi.fn().mockResolvedValue(cards),
    });
    const res = await resolveWaAccount("u1", "bank-default", "cc");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/2 rekening/);
  });
});
