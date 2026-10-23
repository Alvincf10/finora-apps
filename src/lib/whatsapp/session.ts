import { WhatsAppSession } from "@/models/WhatsAppSession";

/** If the worker does not heartbeat within this window, treat Finora as down. */
export const WA_HEARTBEAT_STALE_MS = 15_000;

export type FinoraLiveStatus = "alive" | "connecting" | "down";

export async function getOrCreateWhatsAppSession(userId: string) {
  let session = await WhatsAppSession.findOne({ userId });
  if (!session) {
    session = await WhatsAppSession.create({
      userId,
      status: "disconnected",
      desiredState: "stopped",
    });
  }
  return session;
}

function resolveFinoraLive(session: {
  status: string;
  desiredState: string;
  lastHeartbeatAt?: Date | null;
  lastError?: string | null;
}): {
  finoraStatus: FinoraLiveStatus;
  finoraStatusLabel: string;
  finoraDownReason: string | null;
  alive: boolean;
} {
  const heartbeatAt = session.lastHeartbeatAt
    ? new Date(session.lastHeartbeatAt).getTime()
    : 0;
  const heartbeatFresh =
    heartbeatAt > 0 && Date.now() - heartbeatAt < WA_HEARTBEAT_STALE_MS;

  if (
    session.desiredState === "running" &&
    session.status === "connected" &&
    heartbeatFresh
  ) {
    return {
      finoraStatus: "alive",
      finoraStatusLabel: "Finora aktif",
      finoraDownReason: null,
      alive: true,
    };
  }

  if (
    session.desiredState === "running" &&
    (session.status === "connecting" || session.status === "qr")
  ) {
    return {
      finoraStatus: "connecting",
      finoraStatusLabel: "Finora menghubungkan…",
      finoraDownReason: null,
      alive: false,
    };
  }

  let reason: string;
  if (session.desiredState === "stopped") {
    reason = "Vira dimatikan (Disconnect). Tekan Connect untuk menyalakan.";
  } else if (session.status === "error") {
    reason = session.lastError || "Koneksi error.";
  } else if (session.status === "connected" && !heartbeatFresh) {
    reason =
      "Worker Vira tidak merespons. Cek service finora-vira atau tekan Connect ulang.";
  } else if (session.status === "disconnected") {
    reason = "WhatsApp putus. Tekan Connect untuk menghubungkan lagi.";
  } else {
    reason = session.lastError || "Finora tidak aktif.";
  }

  return {
    finoraStatus: "down",
    finoraStatusLabel: "Finora mati",
    finoraDownReason: reason,
    alive: false,
  };
}

export function serializeWhatsAppSession(session: {
  status: string;
  desiredState: string;
  qrData?: string | null;
  qrUpdatedAt?: Date | null;
  phoneNumber?: string | null;
  defaultAccountId?: { toString(): string } | null;
  allowedFrom?: string | null;
  lastError?: string | null;
  lastMessageAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  weeklyReportEnabled?: boolean | null;
  lastWeeklyReportWeekKey?: string | null;
  updatedAt?: Date;
}) {
  const live = resolveFinoraLive(session);

  return {
    status: session.status,
    desiredState: session.desiredState,
    qrData: session.qrData ?? null,
    qrUpdatedAt: session.qrUpdatedAt ?? null,
    phoneNumber: session.phoneNumber ?? null,
    defaultAccountId: session.defaultAccountId
      ? String(session.defaultAccountId)
      : null,
    allowedFrom: session.allowedFrom ?? null,
    lastError: session.lastError ?? null,
    lastMessageAt: session.lastMessageAt ?? null,
    lastHeartbeatAt: session.lastHeartbeatAt ?? null,
    weeklyReportEnabled: session.weeklyReportEnabled !== false,
    lastWeeklyReportWeekKey: session.lastWeeklyReportWeekKey ?? null,
    updatedAt: session.updatedAt ?? null,
    ...live,
    workerHint:
      "Jalankan `npm run wa:vira` di terminal terpisah agar Vira bisa connect.",
  };
}
