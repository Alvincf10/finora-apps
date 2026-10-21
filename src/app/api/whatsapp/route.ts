import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  updateWhatsappSchema,
  whatsappActionSchema,
} from "@/lib/validations";
import { Account } from "@/models/Account";
import {
  getOrCreateWhatsAppSession,
  serializeWhatsAppSession,
} from "@/lib/whatsapp/session";

function hasAllowedFrom(value: string | null | undefined): boolean {
  return Boolean(value && /^\d{8,20}$/.test(value));
}

export async function GET() {
  try {
    const { userId } = await requireUser();
    const session = await getOrCreateWhatsAppSession(userId);
    return ok(serializeWhatsAppSession(session));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = whatsappActionSchema.parse(
      await request.json().catch(() => ({}))
    );
    const session = await getOrCreateWhatsAppSession(userId);

    if (body.action === "start") {
      if (!hasAllowedFrom(session.allowedFrom)) {
        throw new Error("ALLOWED_FROM_REQUIRED");
      }
      if (!session.defaultAccountId) {
        throw new Error("DEFAULT_ACCOUNT_REQUIRED");
      }
      session.desiredState = "running";
      session.clearAuthRequested = false;
      session.lastError = null;
      if (session.status === "disconnected" || session.status === "error") {
        session.status = "connecting";
      }
    } else if (body.action === "stop") {
      session.desiredState = "stopped";
      session.qrData = null;
      session.lastHeartbeatAt = null;
      if (session.status !== "connected") {
        session.status = "disconnected";
      }
    } else if (body.action === "logout") {
      session.desiredState = "stopped";
      session.clearAuthRequested = true;
      session.status = "disconnected";
      session.qrData = null;
      session.qrUpdatedAt = null;
      session.phoneNumber = null;
      session.lastError = null;
      session.lastHeartbeatAt = null;
    }

    await session.save();
    return ok(serializeWhatsAppSession(session));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = updateWhatsappSchema.parse(
      await request.json().catch(() => ({}))
    );
    const session = await getOrCreateWhatsAppSession(userId);

    if (body.defaultAccountId !== undefined) {
      if (body.defaultAccountId === null) {
        session.set("defaultAccountId", null);
      } else {
        const account = await Account.findOne({
          _id: body.defaultAccountId,
          userId,
          isActive: true,
        });
        if (!account) throw new Error("NOT_FOUND");
        session.defaultAccountId = account._id;
      }
    }

    if (body.allowedFrom !== undefined) {
      session.set("allowedFrom", body.allowedFrom);
      // Clearing allowlist while running must stop the worker
      if (!hasAllowedFrom(body.allowedFrom) && session.desiredState === "running") {
        session.desiredState = "stopped";
        session.qrData = null;
        if (session.status !== "connected") {
          session.status = "disconnected";
        }
        session.lastError =
          "Vira dihentikan: nomor pengirim diizinkan wajib diisi.";
      }
    }

    await session.save();
    return ok(serializeWhatsAppSession(session));
  } catch (error) {
    return handleError(error);
  }
}
