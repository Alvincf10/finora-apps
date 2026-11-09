import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names with tailwind conflict resolution", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", false && "hidden", "text-blue-500")).toBe(
      "text-blue-500"
    );
  });
});
