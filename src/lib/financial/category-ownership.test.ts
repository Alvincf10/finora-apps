import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneLean = vi.fn();

vi.mock("@/models/Category", () => ({
  Category: {
    findOne: vi.fn(() => ({ select: vi.fn().mockReturnValue({ lean: findOneLean }) })),
  },
}));

import { assertCategoryOwned } from "@/lib/financial/category-ownership";

const userId = "user-1";

describe("assertCategoryOwned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneLean.mockReset();
  });

  it("allows null or empty category id without lookup", async () => {
    await expect(assertCategoryOwned(userId, null)).resolves.toBeUndefined();
    await expect(assertCategoryOwned(userId, undefined)).resolves.toBeUndefined();
    await expect(assertCategoryOwned(userId, "")).resolves.toBeUndefined();
    expect(findOneLean).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when category is missing for user", async () => {
    findOneLean.mockResolvedValue(null);
    await expect(assertCategoryOwned(userId, "cat-missing")).rejects.toThrow(
      "NOT_FOUND"
    );
  });

  it("resolves when category exists", async () => {
    findOneLean.mockResolvedValue({ _id: "cat-1" });
    await expect(assertCategoryOwned(userId, "cat-1")).resolves.toBeUndefined();
  });
});
