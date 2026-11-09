import { describe, expect, it, vi } from "vitest";
import {
  formatWeeklyReportWaText,
  parseWeeklyReportQuery,
  type WeeklyReview,
} from "@/lib/financial/weekly-review";
import {
  formatFixedCostDueWaText,
  type FixedCostDueItem,
} from "@/lib/financial/fixed-cost-reminders";
import { getViraHelpText } from "@/lib/whatsapp/help-text";
import {
  shouldIgnoreWaEcho,
  wouldEchoLoopAsWeeklyReport,
} from "@/lib/whatsapp/echo-guard";
import { stripWaPrefix } from "@/lib/whatsapp/prefix";
import {
  WHATSAPP_ALERT_KINDS,
  WHATSAPP_OUTBOUND_KINDS,
} from "@/lib/whatsapp/outbound-kinds";
import {
  buildOutboundFailedUpdate,
  buildOutboundSentUpdate,
  markOutboundFailed,
  markOutboundSent,
  outboundStatusUpdateKeys,
} from "@/lib/whatsapp/outbound-flush";
import { WhatsAppOutbound } from "@/models/WhatsAppOutbound";

function sampleReview(): WeeklyReview {
  return {
    offset: 0,
    label: "03/11–09/11/2026",
    expenses: 2_000_000,
    prevExpenses: 1_500_000,
    expenseChangePercent: 33.33,
    topCategories: [],
    overCategories: [],
    advice: [],
    currency: "IDR",
    daysLeftInMonth: 21,
  };
}

const fixedCostItems: FixedCostDueItem[] = [
  {
    fixedCostId: "1",
    name: "Netflix",
    amount: 54_000,
    currency: "IDR",
    dueDay: 9,
  },
];

/** Bodies every WA feature may send — must never echo-loop as commands. */
function allFeatureOutboundBodies(): { feature: string; body: string }[] {
  return [
    {
      feature: "weekly_report",
      body: formatWeeklyReportWaText(sampleReview()),
    },
    {
      feature: "fixed_cost_due",
      body: formatFixedCostDueWaText(fixedCostItems),
    },
    {
      feature: "budget_overflow",
      body: [
        "Vira · Budget overflow",
        "Entertainment sudah melebihi plafon minggu ini (03/11–09/11/2026).",
        "Terpakai Rp 500.000 / Rp 400.000 (+Rp 100.000).",
      ].join("\n"),
    },
    {
      feature: "budget_warning",
      body: [
        "Vira · Hati-hati budget",
        "Food sudah 87% plafon minggu ini (03/11–09/11/2026) — minggu belum selesai.",
        "Terpakai Rp 870.000 / Rp 1.000.000 (sisa Rp 130.000).",
      ].join("\n"),
    },
    {
      feature: "cc_limit_overflow",
      body: [
        "Vira · Limit CC habis",
        "Kartu Kredit sudah di / melebihi limit.",
        "Outstanding Rp 3.214.482 / limit Rp 3.214.482.",
        "Sisa limit Rp 0 — tahan belanja CC atau bayar tagihan dulu.",
      ].join("\n"),
    },
    {
      feature: "cc_limit_warning",
      body: [
        "Vira · CC mendekati limit",
        "Kartu Kredit sudah 93% terpakai.",
        "Outstanding Rp 2.988.482 / limit Rp 3.214.482 (sisa Rp 226.000).",
      ].join("\n"),
    },
    {
      feature: "help",
      body: getViraHelpText(),
    },
    {
      feature: "balance",
      body: "Vira · saldo\n• BCA: Rp 1.000.000",
    },
    {
      feature: "totals_expense",
      body: "Vira · total pengeluaran bulan ini\nRp 2.000.000",
    },
    {
      feature: "tx_ack",
      body: "OK · Expense makan Rp 50.000 · BCA",
    },
    {
      feature: "parse_error",
      body: "Vira · format tidak dikenali. Contoh: finora makan 50k",
    },
    {
      feature: "legacy_finora_report",
      body: "Finora · Report minggu 19/10–25/10/2026\nPengeluaran: Rp 1.000.000",
    },
  ];
}

describe("WhatsAppOutbound kind enum ↔ producers (spam root cause)", () => {
  it("schema enum lists every WHATSAPP_OUTBOUND_KINDS value", () => {
    const path = WhatsAppOutbound.schema.path("kind") as {
      options?: { enum?: string[] };
      enumValues?: string[];
    };
    const enumValues = path.enumValues ?? path.options?.enum ?? [];
    for (const kind of WHATSAPP_OUTBOUND_KINDS) {
      expect(enumValues, `missing schema enum: ${kind}`).toContain(kind);
    }
  });

  it("alert producer kinds are a subset of the outbound schema enum", () => {
    for (const kind of WHATSAPP_ALERT_KINDS) {
      expect(WHATSAPP_OUTBOUND_KINDS).toContain(kind);
    }
  });

  it("includes CC_LIMIT_WARNING and CC_LIMIT_OVERFLOW (Nov 2026 incident)", () => {
    expect(WHATSAPP_OUTBOUND_KINDS).toContain("CC_LIMIT_WARNING");
    expect(WHATSAPP_OUTBOUND_KINDS).toContain("CC_LIMIT_OVERFLOW");
  });
});

describe("outbound flush must not re-validate kind (pending-loop guard)", () => {
  it("sent update only touches status fields — never kind/body", () => {
    const update = buildOutboundSentUpdate(new Date("2026-11-09T14:22:36.000Z"));
    expect(outboundStatusUpdateKeys(update)).toEqual([
      "error",
      "sentAt",
      "status",
    ]);
    expect(update).toEqual({
      status: "sent",
      sentAt: new Date("2026-11-09T14:22:36.000Z"),
      error: null,
    });
    expect(update).not.toHaveProperty("kind");
    expect(update).not.toHaveProperty("body");
  });

  it("failed update only touches status/error — never kind/body", () => {
    const update = buildOutboundFailedUpdate(
      "WhatsAppOutbound validation failed: kind: `CC_LIMIT_WARNING`"
    );
    expect(outboundStatusUpdateKeys(update)).toEqual(["error", "status"]);
    expect(update.status).toBe("failed");
    expect(update).not.toHaveProperty("kind");
  });

  it("markOutboundSent uses updateOne $set (not document.save)", async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const model = { updateOne };
    await markOutboundSent(model, "6af1d72c0e1b32a752ea2647", new Date(0));
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [, payload] = updateOne.mock.calls[0]!;
    expect(payload).toEqual({
      $set: {
        status: "sent",
        sentAt: new Date(0),
        error: null,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("kind");
  });

  it("markOutboundFailed uses updateOne even when error mentions kind enum", async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    await markOutboundFailed(
      { updateOne },
      "6af1d72c0e1b32a752ea2647",
      "kind: `CC_LIMIT_WARNING` is not a valid enum value"
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "6af1d72c0e1b32a752ea2647" },
      {
        $set: {
          status: "failed",
          error: "kind: `CC_LIMIT_WARNING` is not a valid enum value",
        },
      }
    );
  });

  it("simulates stale-enum incident: status can still leave pending without validating kind", async () => {
    // Document already has kind the stale worker cannot validate on .save().
    const staleDoc = {
      _id: "6af1d72c0e1b32a752ea2647",
      kind: "CC_LIMIT_WARNING",
      status: "pending",
      body: "Vira · CC mendekati limit\nKartu Kredit sudah 93% terpakai.",
    };
    const updateOne = vi.fn().mockImplementation(async (_filter, update) => {
      Object.assign(staleDoc, update.$set);
      return { modifiedCount: 1 };
    });

    await markOutboundSent({ updateOne }, staleDoc._id, new Date(1));

    expect(staleDoc.status).toBe("sent");
    expect(staleDoc.kind).toBe("CC_LIMIT_WARNING");
    expect(staleDoc.status).not.toBe("pending");
  });
});

describe("all WA feature replies are echo-safe (false-positive spam)", () => {
  it.each(allFeatureOutboundBodies())(
    "$feature fromMe echo must be ignored",
    ({ body }) => {
      expect(shouldIgnoreWaEcho(body, true)).toBe(true);
      expect(wouldEchoLoopAsWeeklyReport(body)).toBe(false);
    }
  );

  it.each(allFeatureOutboundBodies())(
    "$feature must not parse as a weekly-report command after prefix strip",
    ({ body, feature }) => {
      if (feature === "legacy_finora_report") {
        // Echo-guard blocks first; strip alone is unsafe — assert guard wins.
        expect(shouldIgnoreWaEcho(body, true)).toBe(true);
        return;
      }
      const stripped = stripWaPrefix(body);
      if (stripped.ok) {
        expect(parseWeeklyReportQuery(stripped.body)).toBe(false);
      }
    }
  );

  it("real user short commands still pass echo-guard", () => {
    expect(shouldIgnoreWaEcho("finora makan 42k", true)).toBe(false);
    expect(shouldIgnoreWaEcho("finora report minggu", true)).toBe(false);
    expect(shouldIgnoreWaEcho("finora saldo", false)).toBe(false);
  });

  it("empty / whitespace is ignored (no false command fire)", () => {
    expect(shouldIgnoreWaEcho("", true)).toBe(true);
    expect(shouldIgnoreWaEcho("   ", false)).toBe(true);
  });
});
