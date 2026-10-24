/**
 * Unit checks for fixed-cost H-0 WA reminder formatting + cron window.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/test-fixed-cost-reminder.ts
 */
import assert from "node:assert/strict";
import {
  formatFixedCostDueWaText,
  isFixedCostReminderCronWindow,
  fixedCostReminderDayKey,
  type FixedCostDueItem,
} from "../src/lib/financial/fixed-cost-reminders";
import { shouldIgnoreWaEcho } from "../src/lib/whatsapp/echo-guard";

const single: FixedCostDueItem[] = [
  {
    fixedCostId: "1",
    name: "Internet Rumah",
    amount: 350_000,
    currency: "IDR",
    dueDay: 27,
  },
];

const multi: FixedCostDueItem[] = [
  {
    fixedCostId: "1",
    name: "Internet Rumah",
    amount: 350_000,
    currency: "IDR",
    dueDay: 27,
  },
  {
    fixedCostId: "2",
    name: "Listrik",
    amount: 450_000,
    currency: "IDR",
    dueDay: 27,
  },
  {
    fixedCostId: "3",
    name: "Netflix",
    amount: 186_000,
    currency: "IDR",
    dueDay: 27,
  },
];

{
  const body = formatFixedCostDueWaText(single);
  assert.ok(body.startsWith("Vira · Tagihan jatuh tempo hari ini"));
  assert.ok(!body.startsWith("Finora "));
  assert.ok(body.includes("Internet Rumah ·"));
  assert.ok(body.includes("(tgl 27)"));
  assert.ok(!body.includes("Total:"));
  assert.ok(body.includes("Catat bayar di Fixed costs"));
  assert.equal(shouldIgnoreWaEcho(body, true), true);
}

{
  const body = formatFixedCostDueWaText(multi);
  assert.ok(body.startsWith("Vira · Tagihan jatuh tempo hari ini"));
  assert.ok(body.includes("• Internet Rumah ·"));
  assert.ok(body.includes("• Listrik ·"));
  assert.ok(body.includes("• Netflix ·"));
  assert.ok(body.includes("Total:"));
  assert.ok(body.includes("(tgl 27)"));
  assert.equal(shouldIgnoreWaEcho(body, true), true);
}

{
  // 08:00 WIB = 01:00 UTC
  const at0800 = new Date(Date.UTC(2026, 9, 27, 1, 0, 0));
  assert.equal(isFixedCostReminderCronWindow(at0800), true);
  assert.equal(fixedCostReminderDayKey(at0800), "2026-10-27");

  const at0804 = new Date(Date.UTC(2026, 9, 27, 1, 4, 0));
  assert.equal(isFixedCostReminderCronWindow(at0804), true);

  const at0805 = new Date(Date.UTC(2026, 9, 27, 1, 5, 0));
  assert.equal(isFixedCostReminderCronWindow(at0805), false);

  const at0900 = new Date(Date.UTC(2026, 9, 27, 2, 0, 0));
  assert.equal(isFixedCostReminderCronWindow(at0900), false);
}

console.log("ok — fixed-cost reminder tests passed");
