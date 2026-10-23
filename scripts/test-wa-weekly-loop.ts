/**
 * Regression tests: "Kirim ke WA" weekly report must never echo-loop.
 *
 * Run: npm run test:wa-weekly
 */
import assert from "node:assert/strict";
import {
  formatWeeklyReportWaText,
  parseWeeklyReportQuery,
  type WeeklyReview,
} from "../src/lib/financial/weekly-review";
import { stripWaPrefix } from "../src/lib/whatsapp/prefix";
import {
  isBotReplyText,
  shouldIgnoreWaEcho,
  wouldEchoLoopAsWeeklyReport,
} from "../src/lib/whatsapp/echo-guard";

function sampleReview(label = "19/10–25/10/2026"): WeeklyReview {
  return {
    offset: 0,
    label,
    expenses: 7_317_017,
    prevExpenses: 1_866_000,
    expenseChangePercent: 292,
    topCategories: [],
    overCategories: [
      {
        categoryId: "debt",
        categoryName: "Debt Payment",
        weekAmount: 6_487_017,
        prevWeekAmount: 0,
        wowChangePercent: null,
        weeklyAllotment: null,
        paceUtilization: null,
        budgetAmount: null,
        classification: "IMPORTANT",
        nature: "DEBT",
        signals: ["WOW"],
        cuttable: false,
        topItems: [
          { label: "Debt payment: bayar cc", amount: 3_000_000 },
          { label: "Debt payment: rupiah cepat", amount: 1_143_000 },
        ],
      },
    ],
    advice: [
      {
        categoryId: null,
        categoryName: "hepi",
        message:
          "Ada kategori over, tapi itu fixed/utang/tabungan — jangan dipotong. Cek hepi (Lifestyle) minggu depan.",
        dailyCap: null,
        priority: "MEDIUM",
      },
    ],
    currency: "IDR",
    daysLeftInMonth: 8,
  };
}

// --- formatWeeklyReportWaText: safe for outbound ---
{
  const body = formatWeeklyReportWaText(sampleReview());
  assert.ok(
    body.startsWith("Vira · Report minggu "),
    "report header must use Vira · (not Finora ·)"
  );
  assert.ok(
    !body.startsWith("Finora "),
    "report must not start with Finora command prefix"
  );
  assert.equal(
    wouldEchoLoopAsWeeklyReport(body),
    false,
    "formatted report must not echo-loop as weekly report command"
  );
  assert.equal(
    shouldIgnoreWaEcho(body, true),
    true,
    "fromMe echo of formatted report must be ignored"
  );
  assert.equal(
    isBotReplyText(body),
    true,
    "formatted report is a bot reply signature"
  );
}

// --- intentional user command still works ---
{
  for (const cmd of [
    "finora report minggu",
    "finora rekap minggu",
    "finora weekly report",
    "finora: report minggu",
  ]) {
    assert.equal(
      shouldIgnoreWaEcho(cmd, false),
      false,
      `inbound command must be handled: ${cmd}`
    );
    assert.equal(
      shouldIgnoreWaEcho(cmd, true),
      false,
      `short fromMe command must be handled: ${cmd}`
    );
    const stripped = stripWaPrefix(cmd);
    assert.equal(stripped.ok, true, `prefix strip ok: ${cmd}`);
    assert.equal(
      parseWeeklyReportQuery(stripped.ok ? stripped.body : ""),
      true,
      `parseWeeklyReportQuery: ${cmd}`
    );
  }
}

// --- regression: old buggy header WOULD have looped ---
{
  const buggy =
    "Finora · Report minggu 19/10–25/10/2026\n" +
    "Pengeluaran: Rp 7.317.017 (vs minggu lalu +292%)\n\n" +
    "Over / waspada:\n• Debt Payment Rp 6.487.017 [wow]";

  // Without echo-guard, strip + parse would treat this as a command:
  const stripped = stripWaPrefix(buggy);
  assert.equal(stripped.ok, true, "old header matched Finora prefix (the bug)");
  assert.equal(
    parseWeeklyReportQuery(stripped.ok ? stripped.body : ""),
    true,
    "old header body matched weekly report query (the bug)"
  );

  // With echo-guard, it must be blocked:
  assert.equal(
    shouldIgnoreWaEcho(buggy, true),
    true,
    "echo-guard must block old Finora · report fromMe"
  );
  assert.equal(
    wouldEchoLoopAsWeeklyReport(buggy),
    false,
    "echo-guard prevents wouldEchoLoop for old header"
  );
}

// --- other bot replies ---
{
  assert.equal(shouldIgnoreWaEcho("Vira · format tidak dikenali.", true), true);
  assert.equal(shouldIgnoreWaEcho("OK · Expense makan Rp 50.000", true), true);
  assert.equal(shouldIgnoreWaEcho("halo apa kabar", false), false);
  assert.equal(
    shouldIgnoreWaEcho("halo apa kabar", true),
    true,
    "fromMe without Finora prefix ignored"
  );
}

// --- simulate one "Kirim ke WA" send cycle (no second trigger) ---
{
  const outbound = formatWeeklyReportWaText(sampleReview());
  // First send is enqueue/outbound — not an inbound command.
  // When WhatsApp echoes it back as fromMe notify:
  let handledAsCommand = 0;
  if (!shouldIgnoreWaEcho(outbound, true)) {
    const stripped = stripWaPrefix(outbound);
    if (stripped.ok && parseWeeklyReportQuery(stripped.body)) {
      handledAsCommand += 1;
    }
  }
  assert.equal(
    handledAsCommand,
    0,
    "Kirim ke WA body must not re-enter weekly report handler on fromMe echo"
  );
}

console.log("test-wa-weekly-loop: all passed");
