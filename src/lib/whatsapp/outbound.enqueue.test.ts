import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionFindOne = vi.fn();
const outboundFindOneLean = vi.fn();
const outboundCreate = vi.fn();

vi.mock("@/models/WhatsAppSession", () => ({
  WhatsAppSession: {
    findOne: (...args: unknown[]) => sessionFindOne(...args),
  },
}));

vi.mock("@/models/WhatsAppOutbound", () => ({
  WhatsAppOutbound: {
    findOne: vi.fn(() => ({ lean: outboundFindOneLean })),
    create: (...args: unknown[]) => outboundCreate(...args),
  },
}));

vi.mock("@/lib/financial/weekly-review", () => ({}));
vi.mock("@/lib/financial/budget-from-weekly", () => ({}));
vi.mock("@/lib/financial/fixed-cost-reminders", () => ({}));

import {
  enqueueBudgetAlert,
  enqueueCcLimitAlert,
} from "@/lib/whatsapp/outbound";

const userId = "user-1";

describe("enqueueCcLimitAlert / enqueueBudgetAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionFindOne.mockReset();
    outboundFindOneLean.mockReset();
    outboundCreate.mockReset();
    outboundFindOneLean.mockResolvedValue(null);
    outboundCreate.mockResolvedValue({
      _id: "out-new",
      status: "pending",
    });
  });

  it("throws ALLOWED_FROM_REQUIRED when allowedFrom is missing", async () => {
    sessionFindOne.mockResolvedValue({ allowedFrom: "" });
    await expect(
      enqueueCcLimitAlert(userId, {
        dedupeKey: "cc-warn:2026-11:1",
        kind: "CC_LIMIT_WARNING",
        body: "Vira · test",
      })
    ).rejects.toThrow("ALLOWED_FROM_REQUIRED");

    sessionFindOne.mockResolvedValue({ allowedFrom: null });
    await expect(
      enqueueBudgetAlert(userId, {
        dedupeKey: "budget-warn:2026-11-03:1",
        kind: "BUDGET_WARNING",
        body: "Vira · test",
      })
    ).rejects.toThrow("ALLOWED_FROM_REQUIRED");
  });

  it("returns null when pending/sent row exists for dedupeKey", async () => {
    sessionFindOne.mockResolvedValue({ allowedFrom: "6281234567890" });
    outboundFindOneLean.mockResolvedValue({ _id: "existing", status: "pending" });

    const cc = await enqueueCcLimitAlert(userId, {
      dedupeKey: "cc-warn:2026-11:1",
      kind: "CC_LIMIT_WARNING",
      body: "Vira · test",
    });
    expect(cc).toBeNull();
    expect(outboundCreate).not.toHaveBeenCalled();
  });

  it("create path returns id and pending status", async () => {
    sessionFindOne.mockResolvedValue({ allowedFrom: "+62 812-3456-7890" });

    const result = await enqueueBudgetAlert(userId, {
      dedupeKey: "budget-over:2026-11-03:cat",
      kind: "BUDGET_OVERFLOW",
      body: "Vira · Budget overflow",
    });

    expect(outboundCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "out-new",
      toPhone: "6281234567890",
      body: "Vira · Budget overflow",
      status: "pending",
    });
  });
});
