import { describe, expect, it } from "vitest";
import {
  FROM_ME_COMMAND_MAX_BODY,
  isBotReplyText,
  shouldIgnoreWaEcho,
  wouldEchoLoopAsWeeklyReport,
} from "@/lib/whatsapp/echo-guard";

describe("isBotReplyText", () => {
  it("detects bot signature prefixes", () => {
    expect(isBotReplyText("Vira · saldo")).toBe(true);
    expect(isBotReplyText("OK · done")).toBe(true);
    expect(isBotReplyText("Finora · app")).toBe(true);
    expect(isBotReplyText("finora makan")).toBe(false);
  });
});

describe("shouldIgnoreWaEcho", () => {
  it("ignores empty and bot replies", () => {
    expect(shouldIgnoreWaEcho("  ", false)).toBe(true);
    expect(shouldIgnoreWaEcho("Vira · report", false)).toBe(true);
  });

  it("passes normal inbound from others", () => {
    expect(shouldIgnoreWaEcho("finora saldo", false)).toBe(false);
  });

  it("ignores fromMe without prefix or with long body", () => {
    expect(shouldIgnoreWaEcho("hello", true)).toBe(true);
    expect(
      shouldIgnoreWaEcho(
        `finora ${"x".repeat(FROM_ME_COMMAND_MAX_BODY + 1)}`,
        true
      )
    ).toBe(true);
  });

  it("allows short prefixed fromMe commands", () => {
    expect(shouldIgnoreWaEcho("finora report minggu", true)).toBe(false);
  });
});

describe("wouldEchoLoopAsWeeklyReport", () => {
  it("is false for bot-safe bodies", () => {
    expect(
      wouldEchoLoopAsWeeklyReport("Vira · Report minggu 01/11–07/11/2026")
    ).toBe(false);
  });

  it("is true when fromMe would parse as weekly report command", () => {
    expect(wouldEchoLoopAsWeeklyReport("finora report minggu")).toBe(true);
    expect(wouldEchoLoopAsWeeklyReport("finora mingguan")).toBe(true);
  });

  it("is false for unrelated short commands", () => {
    expect(wouldEchoLoopAsWeeklyReport("finora saldo")).toBe(false);
  });
});
