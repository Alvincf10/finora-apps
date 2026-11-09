import { describe, expect, it } from "vitest";
import { getViraHelpText } from "@/lib/whatsapp/help-text";
import { shouldIgnoreWaEcho } from "@/lib/whatsapp/echo-guard";

describe("getViraHelpText", () => {
  it("starts with Vira · so fromMe echoes are ignored", () => {
    const text = getViraHelpText();
    expect(text.startsWith("Vira ·")).toBe(true);
    expect(shouldIgnoreWaEcho(text, true)).toBe(true);
    expect(text.toLowerCase()).toMatch(/makan|expense|saldo|report/);
  });
});
