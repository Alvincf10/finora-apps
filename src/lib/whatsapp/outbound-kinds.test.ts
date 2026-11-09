import { describe, expect, it } from "vitest";
import {
  WHATSAPP_ALERT_KINDS,
  WHATSAPP_OUTBOUND_KINDS,
} from "@/lib/whatsapp/outbound-kinds";

describe("WHATSAPP_OUTBOUND_KINDS", () => {
  it("is unique and includes every alert kind", () => {
    expect(new Set(WHATSAPP_OUTBOUND_KINDS).size).toBe(
      WHATSAPP_OUTBOUND_KINDS.length
    );
    for (const kind of WHATSAPP_ALERT_KINDS) {
      expect(WHATSAPP_OUTBOUND_KINDS).toContain(kind);
    }
  });

  it("keeps operational kinds used by cron / manual send", () => {
    expect(WHATSAPP_OUTBOUND_KINDS).toEqual(
      expect.arrayContaining([
        "WEEKLY_REPORT",
        "FIXED_COST_DUE",
        "MANUAL",
        "CC_LIMIT_WARNING",
        "CC_LIMIT_OVERFLOW",
      ])
    );
  });
});
