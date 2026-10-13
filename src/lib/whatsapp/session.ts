import { WhatsAppSession } from "@/models/WhatsAppSession";

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
  updatedAt?: Date;
}) {
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
    updatedAt: session.updatedAt ?? null,
    workerHint:
      "Jalankan `npm run wa:vira` di terminal terpisah agar Vira bisa connect.",
  };
}
