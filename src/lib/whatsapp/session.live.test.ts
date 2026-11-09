import { describe, expect, it, vi, afterEach } from "vitest";
import {
  serializeWhatsAppSession,
  WA_HEARTBEAT_STALE_MS,
} from "@/lib/whatsapp/session";

function session(partial: Record<string, unknown>) {
  return {
    _id: "s1",
    userId: "u1",
    status: "disconnected",
    desiredState: "stopped",
    phoneNumber: null,
    allowedFrom: "62812",
    defaultAccountId: null,
    qrData: null,
    qrUpdatedAt: null,
    lastError: null,
    lastMessageAt: null,
    lastHeartbeatAt: null,
    weeklyReportEnabled: true,
    fixedCostReminderEnabled: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...partial,
  };
}

describe("serializeWhatsAppSession live status", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks alive when running+connected with fresh heartbeat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T15:00:00.000Z"));
    const out = serializeWhatsAppSession(
      session({
        status: "connected",
        desiredState: "running",
        lastHeartbeatAt: new Date(
          Date.now() - WA_HEARTBEAT_STALE_MS / 2
        ),
      }) as never
    );
    expect(out.finoraStatus).toBe("alive");
    expect(out.alive).toBe(true);
  });

  it("marks connecting while QR / connecting", () => {
    const out = serializeWhatsAppSession(
      session({
        status: "qr",
        desiredState: "running",
      }) as never
    );
    expect(out.finoraStatus).toBe("connecting");
    expect(out.alive).toBe(false);
  });

  it("marks down when heartbeat stale while connected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T15:00:00.000Z"));
    const out = serializeWhatsAppSession(
      session({
        status: "connected",
        desiredState: "running",
        lastHeartbeatAt: new Date(
          Date.now() - WA_HEARTBEAT_STALE_MS - 1
        ),
      }) as never
    );
    expect(out.finoraStatus).toBe("down");
    expect(out.finoraDownReason).toMatch(/Worker Vira/);
  });

  it("explains stopped desiredState", () => {
    const out = serializeWhatsAppSession(session({}) as never);
    expect(out.finoraStatus).toBe("down");
    expect(out.finoraDownReason).toMatch(/dimatikan/);
  });
});
