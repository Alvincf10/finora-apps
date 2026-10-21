/**
 * Vira — WhatsApp worker (Baileys).
 * Run alongside Next.js: npm run wa:vira
 */
import { config as loadEnv } from "dotenv";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import mongoose from "mongoose";

loadEnv({ path: ".env.local" });
loadEnv();

const ROOT = process.cwd();
const AUTH_ROOT = join(ROOT, ".wa-auth");
const POLL_MS = 2_000;
const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "info" });

type Active = {
  userId: string;
  sock: WASocket;
  stopping: boolean;
};

const active = new Map<string, Active>();
/** Prevents tick() + close-handler from opening duplicate sockets. */
const starting = new Set<string>();
/** Backoff until timestamp (ms) before next start attempt. */
const cooldownUntil = new Map<string, number>();
const failCount = new Map<string, number>();

function authDir(userId: string) {
  return join(AUTH_ROOT, userId);
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function jidToPhone(jid: string | null | undefined): string {
  if (!jid) return "";
  const user = jid.split("@")[0] ?? "";
  return digitsOnly(user.split(":")[0]);
}

/** Collect phone candidates — WhatsApp may send LID (@lid) instead of PN. */
function messagePhoneCandidates(msg: WAMessage): string[] {
  const out = new Set<string>();
  const add = (value?: string | null) => {
    const phone = jidToPhone(value);
    // Skip pure LIDs that are not plausible E.164 (too short / no country feel) —
    // still keep them so an explicit allowlist of a LID could work later.
    if (phone) out.add(phone);
  };
  add(msg.key.remoteJid);
  add(msg.key.participant);
  // Baileys PN aliases when remoteJid is a LID
  add((msg.key as { senderPn?: string }).senderPn);
  add((msg.key as { participantPn?: string }).participantPn);
  add((msg.key as { remoteJidAlt?: string }).remoteJidAlt);
  return [...out];
}

function extractText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.ephemeralMessage?.message?.conversation) {
    return m.ephemeralMessage.message.conversation;
  }
  if (m.ephemeralMessage?.message?.extendedTextMessage?.text) {
    return m.ephemeralMessage.message.extendedTextMessage.text;
  }
  return "";
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (.env.local)");
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri, {
    bufferCommands: false,
    retryWrites: false,
  });
}

async function loadAppModules() {
  // Dynamic import so dotenv runs first; uses tsx path aliases from tsconfig.
  const sessionMod = await import("../src/models/WhatsAppSession");
  const accountMod = await import("../src/models/Account");
  const parseMod = await import("../src/lib/whatsapp/parse-expense");
  const catMod = await import("../src/lib/whatsapp/resolve-category");
  const txMod = await import("../src/lib/financial/transactions");
  const moneyMod = await import("../src/lib/money");
  const helpMod = await import("../src/lib/whatsapp/help-text");
  const totalsMod = await import("../src/lib/whatsapp/query-totals");
  const prefixMod = await import("../src/lib/whatsapp/prefix");
  return {
    WhatsAppSession: sessionMod.WhatsAppSession,
    Account: accountMod.Account,
    parseMoneyMessage: parseMod.parseMoneyMessage,
    resolveCategoryId: catMod.resolveCategoryId,
    createTransaction: txMod.createTransaction,
    formatMoney: moneyMod.formatMoney,
    getViraHelpText: helpMod.getViraHelpText,
    parseTotalsQuery: totalsMod.parseTotalsQuery,
    buildTotalsReply: totalsMod.buildTotalsReply,
    stripWaPrefix: prefixMod.stripWaPrefix,
    getWaPrefix: prefixMod.getWaPrefix,
    formatPrefixExamples: prefixMod.formatPrefixExamples,
  };
}

type AppModules = Awaited<ReturnType<typeof loadAppModules>>;

async function patchSession(
  WhatsAppSession: AppModules["WhatsAppSession"],
  userId: string,
  patch: Record<string, unknown>
) {
  await WhatsAppSession.findOneAndUpdate({ userId }, { $set: patch });
}

async function clearAuthFolder(userId: string) {
  const dir = authDir(userId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    logger.info({ userId }, "cleared Baileys auth folder");
  }
}

async function stopSocket(userId: string, logout: boolean) {
  const entry = active.get(userId);
  if (!entry) return;
  entry.stopping = true;
  try {
    if (logout) {
      await entry.sock.logout();
    } else {
      entry.sock.end(undefined);
    }
  } catch (err) {
    logger.warn({ err, userId }, "error while stopping socket");
  }
  active.delete(userId);
  starting.delete(userId);
}

function needsFreshAuth(code: number | undefined): boolean {
  if (code === undefined) return false;
  return (
    code === DisconnectReason.loggedOut ||
    code === DisconnectReason.badSession ||
    code === DisconnectReason.multideviceMismatch ||
    code === DisconnectReason.forbidden ||
    // WhatsApp often returns 405 when session/creds are unusable
    code === 405
  );
}

async function startSocket(userId: string, mods: AppModules) {
  if (active.has(userId) || starting.has(userId)) return;
  const until = cooldownUntil.get(userId) ?? 0;
  if (Date.now() < until) return;

  starting.add(userId);
  try {
    mkdirSync(authDir(userId), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authDir(userId));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Finora"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    const entry: Active = { userId, sock, stopping: false };
    active.set(userId, entry);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        failCount.set(userId, 0);
        await patchSession(mods.WhatsAppSession, userId, {
          status: "qr",
          qrData: qr,
          qrUpdatedAt: new Date(),
          lastError: null,
        });
        logger.info({ userId }, "QR updated (scan from /whatsapp)");
      }

      if (connection === "connecting") {
        await patchSession(mods.WhatsAppSession, userId, {
          status: "connecting",
        });
      }

      if (connection === "open") {
        failCount.set(userId, 0);
        cooldownUntil.delete(userId);
        const phone = jidToPhone(sock.user?.id);
        await patchSession(mods.WhatsAppSession, userId, {
          status: "connected",
          qrData: null,
          phoneNumber: phone || null,
          lastError: null,
          lastHeartbeatAt: new Date(),
        });
        logger.info({ userId, phone }, "WhatsApp connected");
      }

      if (connection === "close") {
        const boom = lastDisconnect?.error as Boom | undefined;
        const code = boom?.output?.statusCode;
        const msg = boom?.message ?? "connection closed";
        active.delete(userId);
        starting.delete(userId);

        const session = await mods.WhatsAppSession.findOne({ userId });
        if (!session) return;

        if (session.desiredState === "stopped") {
          await patchSession(mods.WhatsAppSession, userId, {
            status: "disconnected",
            qrData: null,
          });
          return;
        }

        const fails = (failCount.get(userId) ?? 0) + 1;
        failCount.set(userId, fails);

        if (needsFreshAuth(code) || fails >= 5) {
          await clearAuthFolder(userId);
          failCount.set(userId, 0);
          cooldownUntil.set(userId, Date.now() + 3_000);
          await patchSession(mods.WhatsAppSession, userId, {
            status: "qr",
            qrData: null,
            phoneNumber: null,
            lastError: `Session di-reset (code ${code ?? "?"}). Menunggu QR baru…`,
          });
          logger.warn(
            { userId, code, fails },
            "cleared auth — next connect will show new QR"
          );
          return;
        }

        // Exponential backoff: 3s, 6s, 12s… max 30s. Do NOT startSocket here —
        // tick() owns starts so we never open duplicate sockets.
        const delay = Math.min(30_000, 3_000 * 2 ** (fails - 1));
        cooldownUntil.set(userId, Date.now() + delay);
        await patchSession(mods.WhatsAppSession, userId, {
          status: "connecting",
          lastError: `${msg} (code ${code ?? "?"}) · retry in ${Math.round(delay / 1000)}s`,
        });
        logger.info({ userId, code, delay }, "will reconnect after backoff");
      }
    });

    sock.ev.on("messages.upsert", async (event) => {
      if (event.type !== "notify" && event.type !== "append") return;

      for (const msg of event.messages) {
        try {
          await handleMessage(userId, sock, msg, mods);
        } catch (err) {
          logger.error({ err, userId }, "message handler failed");
        }
      }
    });
  } catch (err) {
    logger.error({ err, userId }, "failed to start socket");
    await patchSession(mods.WhatsAppSession, userId, {
      status: "error",
      lastError: err instanceof Error ? err.message : "failed to start",
    });
    cooldownUntil.set(userId, Date.now() + 5_000);
  } finally {
    starting.delete(userId);
  }
}

function isAllowedSender(
  msg: WAMessage,
  session: {
    allowedFrom?: string | null;
    phoneNumber?: string | null;
  },
  /** When true, fromMe in any 1:1 chat is OK (user typed on same phone into OpenClaw chat). */
  hasFinoraPrefix: boolean
): boolean {
  const candidates = messagePhoneCandidates(msg);
  const allowed = digitsOnly(session.allowedFrom);
  const self = digitsOnly(session.phoneNumber);

  // Hard requirement: allowlist must be configured. Without it, ignore all commands.
  if (!allowed) return false;

  const matchesAllowed = candidates.includes(allowed);
  const matchesSelf = Boolean(self && candidates.includes(self));

  if (msg.key.fromMe) {
    if (!hasFinoraPrefix) return false;
    // Note-to-self on the linked phone, or chat with the allowlisted number
    // (remoteJid may be a LID — match via senderPn / remoteJidAlt).
    return matchesSelf || matchesAllowed;
  }

  // Incoming DM — allowlist must appear in PN candidates (not only LID digits)
  return matchesAllowed;
}

async function handleMessage(
  userId: string,
  sock: WASocket,
  msg: WAMessage,
  mods: AppModules
) {
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us")) return;

  const text = extractText(msg).trim();
  if (!text) return;

  // Ignore Vira's own confirmation replies looping
  if (text.startsWith("Vira ·") || text.startsWith("OK ·")) return;

  const session = await mods.WhatsAppSession.findOne({ userId });
  if (!session || session.status !== "connected") return;

  if (!digitsOnly(session.allowedFrom)) {
    logger.warn({ userId }, "ignoring message — allowedFrom not configured");
    return;
  }

  // Shared number with OpenClaw: only handle messages with Finora prefix (default "finora ").
  const stripped = mods.stripWaPrefix(text);
  if (!stripped.ok) {
    // Silent ignore — let OpenClaw answer non-prefixed chats
    return;
  }

  if (!isAllowedSender(msg, session, true)) {
    logger.info(
      {
        userId,
        fromMe: msg.key.fromMe,
        remote: jidToPhone(jid),
        remoteJid: jid,
        senderPn: (msg.key as { senderPn?: string }).senderPn ?? null,
        candidates: messagePhoneCandidates(msg),
        allowedFrom: session.allowedFrom,
        phone: session.phoneNumber,
      },
      "ignored prefixed message (sender not allowed)"
    );
    return;
  }

  const body = stripped.body;
  if (!body) return;

  logger.info({ userId, body, fromMe: msg.key.fromMe }, "handling Finora command");

  const lower = body.toLowerCase();
  if (
    lower === "help" ||
    lower === "bantuan" ||
    lower === "vira" ||
    lower === "?" ||
    lower === "menu"
  ) {
    await sock.sendMessage(jid, { text: mods.getViraHelpText() });
    return;
  }

  const totalsQuery = mods.parseTotalsQuery(body);
  if (totalsQuery) {
    const reply = await mods.buildTotalsReply(userId, totalsQuery);
    await sock.sendMessage(jid, { text: reply });
    await patchSession(mods.WhatsAppSession, userId, {
      lastMessageAt: new Date(),
    });
    return;
  }

  const parsed = mods.parseMoneyMessage(body);
  if (!parsed) {
    // Prefixed but not understood — guide user (OpenClaw already skipped)
    await sock.sendMessage(jid, {
      text: `Vira · format tidak dikenali. Contoh: ${mods.formatPrefixExamples()}`,
    });
    return;
  }

  if (!session.defaultAccountId) {
    await sock.sendMessage(jid, {
      text: "Vira · set rekening default dulu di menu WhatsApp (Vira) di app.",
    });
    return;
  }

  const account = await mods.Account.findOne({
    _id: session.defaultAccountId,
    userId,
    isActive: true,
  });
  if (!account) {
    await sock.sendMessage(jid, {
      text: "Vira · rekening default tidak ditemukan. Pilih lagi di app.",
    });
    return;
  }

  if (account.currency !== parsed.currency) {
    await sock.sendMessage(jid, {
      text: `Vira · parser IDR, rekening kamu ${account.currency}.`,
    });
    return;
  }

  const categoryId = await mods.resolveCategoryId(
    userId,
    parsed.type,
    parsed.categoryHint
  );
  if (!categoryId) {
    await sock.sendMessage(jid, {
      text: "Vira · kategori tidak ditemukan. Seed kategori dulu lewat app.",
    });
    return;
  }

  const tx = await mods.createTransaction(userId, {
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency,
    accountId: String(account._id),
    categoryId,
    description: parsed.description,
    merchant: parsed.merchant,
    date: new Date().toISOString(),
    notes: "via WhatsApp Vira",
    tags: ["whatsapp", "vira"],
  });

  await patchSession(mods.WhatsAppSession, userId, {
    lastMessageAt: new Date(),
  });

  await sock.sendMessage(jid, {
    text:
      `OK · ${parsed.type === "EXPENSE" ? "Expense" : "Income"} ` +
      `${parsed.categoryHint} ${mods.formatMoney(parsed.amount, parsed.currency)}`,
  });

  logger.info(
    { userId, txId: String(tx._id), amount: parsed.amount },
    "transaction saved from WA"
  );
}

async function tick(mods: AppModules) {
  const runningOrFlagged = await mods.WhatsAppSession.find({
    $or: [{ desiredState: "running" }, { clearAuthRequested: true }],
  });

  const watchedIds = new Set([
    ...runningOrFlagged.map((s) => String(s.userId)),
    ...active.keys(),
  ]);

  for (const userId of watchedIds) {
    const session = await mods.WhatsAppSession.findOne({ userId });
    if (!session) {
      await stopSocket(userId, false);
      continue;
    }

    if (session.clearAuthRequested) {
      await stopSocket(userId, true);
      await clearAuthFolder(userId);
      failCount.delete(userId);
      cooldownUntil.delete(userId);
      session.clearAuthRequested = false;
      session.status = "disconnected";
      session.qrData = null;
      session.phoneNumber = null;
      session.desiredState = "stopped";
      await session.save();
      continue;
    }

    if (session.desiredState === "stopped") {
      if (active.has(userId) || starting.has(userId)) {
        await stopSocket(userId, false);
        session.status = "disconnected";
        session.qrData = null;
        await session.save();
      }
      failCount.delete(userId);
      cooldownUntil.delete(userId);
      continue;
    }

    if (
      session.desiredState === "running" &&
      !active.has(userId) &&
      !starting.has(userId)
    ) {
      if (!digitsOnly(session.allowedFrom)) {
        await patchSession(mods.WhatsAppSession, userId, {
          desiredState: "stopped",
          status: "disconnected",
          qrData: null,
          lastError:
            "allowedFrom wajib diisi sebelum Vira boleh connect.",
        });
        continue;
      }
      await startSocket(userId, mods);
    }

    // Heartbeat while socket is live so the web UI can detect a dead worker.
    if (active.has(userId) && session.desiredState === "running") {
      await patchSession(mods.WhatsAppSession, userId, {
        lastHeartbeatAt: new Date(),
      });
    }
  }
}

async function main() {
  mkdirSync(AUTH_ROOT, { recursive: true });
  await connectMongo();
  const mods = await loadAppModules();
  const prefix = mods.getWaPrefix();
  logger.info(
    {
      prefix: prefix || "(none)",
      example: mods.formatPrefixExamples(),
    },
    "Vira worker online — waiting for desiredState=running"
  );

  for (;;) {
    try {
      await tick(mods);
    } catch (err) {
      logger.error({ err }, "tick failed");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
