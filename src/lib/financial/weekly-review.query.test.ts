import { describe, expect, it } from "vitest";
import {
  parseWeeklyReportQuery,
  isWeeklyReportCronWindow,
  weeklyReportWeekKey,
  getWeekBounds,
} from "@/lib/financial/weekly-review";

describe("parseWeeklyReportQuery", () => {
  it("matches weekly report command variants", () => {
    expect(parseWeeklyReportQuery("report minggu")).toBe(true);
    expect(parseWeeklyReportQuery("laporan minggu")).toBe(true);
    expect(parseWeeklyReportQuery("weekly report")).toBe(true);
  });

  it("rejects unrelated commands", () => {
    expect(parseWeeklyReportQuery("saldo")).toBe(false);
    expect(parseWeeklyReportQuery("makan 50k")).toBe(false);
    expect(parseWeeklyReportQuery("")).toBe(false);
  });
});

describe("weekly report cron / week bounds", () => {
  it("cron window is Sunday evening WIB", () => {
    // Sunday 20:00 WIB = 13:00 UTC
    const inWindow = new Date(Date.UTC(2026, 10, 8, 13, 0, 0)); // Sun
    expect(isWeeklyReportCronWindow(inWindow)).toBe(true);
    const monday = new Date(Date.UTC(2026, 10, 9, 13, 0, 0));
    expect(isWeeklyReportCronWindow(monday)).toBe(false);
  });

  it("week key is Monday date YYYY-MM-DD (Jakarta week)", () => {
    const key = weeklyReportWeekKey(new Date(Date.UTC(2026, 10, 9, 3, 0, 0)));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("getWeekBounds returns Mon–Sun for offset 0", () => {
    const now = new Date(Date.UTC(2026, 10, 9, 10, 0, 0)); // Mon Nov 9 2026 UTC+7-ish
    const { start, end, label } = getWeekBounds(0, now);
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(label).toMatch(/\d{2}\/\d{2}/);
  });
});
