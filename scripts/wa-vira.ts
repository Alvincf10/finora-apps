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
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import mongoose from "mongoose";
import {
  bindGetMessage,
  createRecentMessageStore,
  type RecentMessageStore,
} from "../src/lib/whatsapp/recent-message-store";

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
  /** Outbound content for Baileys retry / "Waiting for this message" fix. */
  recentMessages: RecentMessageStore;
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

/** Unwrap text like Spidernet — covers ephemeral / view-once / captions. */
function extractText(msg: WAMessage): string {
  return unwrapWaText(msg.message);
}

function unwrapWaText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const m = payload as Record<string, unknown>;

  if (typeof m.conversation === "string" && m.conversation.trim()) {
    return m.conversation.trim();
  }

  const extended = m.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text?.trim()) return extended.text.trim();

  const image = m.imageMessage as { caption?: string } | undefined;
  if (image?.caption?.trim()) return image.caption.trim();

  const video = m.videoMessage as { caption?: string } | undefined;
  if (video?.caption?.trim()) return video.caption.trim();

  const doc = m.documentMessage as { caption?: string } | undefined;
  if (doc?.caption?.trim()) return doc.caption.trim();

  for (const key of [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
  ]) {
    const nested = m[key] as { message?: unknown } | undefined;
    if (nested?.message) {
      const inner = unwrapWaText(nested.message);
      if (inner) return inner;
    }
  }

  return "";
}

/**
 * sendMessage + remember content so Baileys can answer retry requests
 * (same role as Spidernet Baileys 7 enableRecentMessageCache).
 */
async function sendTracked(
  sock: WASocket,
  store: RecentMessageStore,
  jid: string,
  content: AnyMessageContent,
  options?: MiscMessageGenerationOptions
) {
  const sent = await sock.sendMessage(jid, content, options);
  store.remember(sent?.key?.id, sent?.message as Record<string, unknown> | undefined);
  return sent;
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
  const outboundMod = await import("../src/models/WhatsAppOutbound");
  const accountMod = await import("../src/models/Account");
  const parseMod = await import("../src/lib/whatsapp/parse-expense");
  const catMod = await import("../src/lib/whatsapp/resolve-category");
  const accountResolveMod = await import("../src/lib/whatsapp/resolve-account");
  const txMod = await import("../src/lib/financial/transactions");
  const incomeSaveMod = await import(
    "../src/lib/financial/income-save-suggest"
  );
  const moneyMod = await import("../src/lib/money");
  const helpMod = await import("../src/lib/whatsapp/help-text");
  const totalsMod = await import("../src/lib/whatsapp/query-totals");
  const balanceMod = await import("../src/lib/whatsapp/query-balance");
  const prefixMod = await import("../src/lib/whatsapp/prefix");
  const weeklyMod = await import("../src/lib/financial/weekly-review");
  const fixedReminderMod = await import(
    "../src/lib/financial/fixed-cost-reminders"
  );
  const enqueueMod = await import("../src/lib/whatsapp/outbound");
  const echoGuardMod = await import("../src/lib/whatsapp/echo-guard");
  return {
    WhatsAppSession: sessionMod.WhatsAppSession,
    WhatsAppOutbound: outboundMod.WhatsAppOutbound,
    Account: accountMod.Account,
    parseMoneyMessage: parseMod.parseMoneyMessage,
    resolveCategoryId: catMod.resolveCategoryId,
    resolveWaAccount: accountResolveMod.resolveWaAccount,
    createTransaction: txMod.createTransaction,
    loadIncomeSaveSuggestion: incomeSaveMod.loadIncomeSaveSuggestion,
    formatMoney: moneyMod.formatMoney,
    getViraHelpText: helpMod.getViraHelpText,
    parseTotalsQuery: totalsMod.parseTotalsQuery,
    buildTotalsReply: totalsMod.buildTotalsReply,
    parseBalanceQuery: balanceMod.parseBalanceQuery,
    buildBalanceReply: balanceMod.buildBalanceReply,
    stripWaPrefix: prefixMod.stripWaPrefix,
    getWaPrefix: prefixMod.getWaPrefix,
    formatPrefixExamples: prefixMod.formatPrefixExamples,
    parseWeeklyReportQuery: weeklyMod.parseWeeklyReportQuery,
    getWeeklyReview: weeklyMod.getWeeklyReview,
    formatWeeklyReportWaText: weeklyMod.formatWeeklyReportWaText,
    isWeeklyReportCronWindow: weeklyMod.isWeeklyReportCronWindow,
    weeklyReportWeekKey: weeklyMod.weeklyReportWeekKey,
    enqueueWeeklyReport: enqueueMod.enqueueWeeklyReport,
    isFixedCostReminderCronWindow:
      fixedReminderMod.isFixedCostReminderCronWindow,
    fixedCostReminderDayKey: fixedReminderMod.fixedCostReminderDayKey,
    enqueueFixedCostDueReminder: enqueueMod.enqueueFixedCostDueReminder,
    shouldIgnoreWaEcho: echoGuardMod.shouldIgnoreWaEcho,
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
    // Match Spidernet endSocket: drop listeners before close to avoid double-fire.
    entry.sock.ev.removeAllListeners("connection.update");
    entry.sock.ev.removeAllListeners("creds.update");
    entry.sock.ev.removeAllListeners("messages.upsert");
    if (logout) {
      await entry.sock.logout();
    } else {
      entry.sock.end(undefined);
    }
  } catch (err) {
    logger.warn({ err, userId }, "error while stopping socket");
  }
  entry.recentMessages.clear();
  active.delete(userId);
  starting.delete(userId);
}

/**
 * Hard logout from WhatsApp — auth is definitely unusable, wipe immediately.
 * Do NOT include badSession (500): Baileys defaults many unknown stream/WS
 * failures to 500, which previously forced a daily QR re-scan.
 */
function isHardLogout(code: number | undefined): boolean {
  if (code === undefined) return false;
  return (
    code === DisconnectReason.loggedOut ||
    code === DisconnectReason.multideviceMismatch ||
    code === DisconnectReason.forbidden ||
    // WhatsApp often returns 405 when session/creds are unusable
    code === 405
  );
}

/** Soft “session suspect” — retry with same auth before wiping. */
function isSoftSessionSuspect(code: number | undefined): boolean {
  return code === DisconnectReason.badSession;
}

/** Consecutive soft 500s before clearing auth (was 1 — too aggressive). */
const SOFT_SESSION_CLEAR_AFTER = 3;
/** Any reconnect loop this long → give up and ask for QR. */
const MAX_RECONNECT_FAILS = 8;

async function startSocket(userId: string, mods: AppModules) {
  if (active.has(userId) || starting.has(userId)) return;
  const until = cooldownUntil.get(userId) ?? 0;
  if (Date.now() < until) return;

  starting.add(userId);
  try {
    mkdirSync(authDir(userId), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authDir(userId));
    const { version } = await fetchLatestBaileysVersion();
    const recentMessages = createRecentMessageStore({ maxEntries: 200 });

    // Socket options aligned with Spidernet (whatsapp.service.ts): no history
    // sync + getMessage store so peers do not stick on "Waiting for this message".
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      // Match this VPS (Ubuntu 22.04) — WhatsApp Linked Devices shows "Finora" on Ubuntu
      browser: Browsers.ubuntu("Finora"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: bindGetMessage(recentMessages),
    });

    const entry: Active = { userId, sock, stopping: false, recentMessages };
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

        const wipeAuth =
          isHardLogout(code) ||
          (isSoftSessionSuspect(code) && fails >= SOFT_SESSION_CLEAR_AFTER) ||
          fails >= MAX_RECONNECT_FAILS;

        if (wipeAuth) {
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
            { userId, code, fails, msg },
            "cleared auth — next connect will show new QR"
          );
          return;
        }

        // Soft 500 / transient close: keep .wa-auth and reconnect.
        // Exponential backoff: 3s, 6s, 12s… max 30s. Do NOT startSocket here —
        // tick() owns starts so we never open duplicate sockets.
        const delay = Math.min(30_000, 3_000 * 2 ** (fails - 1));
        cooldownUntil.set(userId, Date.now() + delay);
        await patchSession(mods.WhatsAppSession, userId, {
          status: "connecting",
          lastError: `${msg} (code ${code ?? "?"}) · retry in ${Math.round(delay / 1000)}s`,
        });
        logger.info(
          { userId, code, fails, delay, msg },
          isSoftSessionSuspect(code)
            ? "soft badSession — keeping auth, will reconnect"
            : "will reconnect after backoff"
        );
      }
    });

    sock.ev.on("messages.upsert", async (event) => {
      // Spidernet only handles notify — skip append/history echoes.
      if (event.type !== "notify") return;

      for (const msg of event.messages) {
        try {
          await handleMessage(userId, sock, msg, mods, recentMessages);
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
  mods: AppModules,
  recentMessages: RecentMessageStore
) {
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us")) return;

  const text = extractText(msg).trim();
  if (!text) return;

  if (mods.shouldIgnoreWaEcho(text, Boolean(msg.key.fromMe))) {
    return;
  }

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
    await sendTracked(sock, recentMessages, jid, {
      text: mods.getViraHelpText(),
    });
    return;
  }

  // Deterministic /saldo — no LLM (Phase 1)
  if (mods.parseBalanceQuery(body)) {
    const reply = await mods.buildBalanceReply(userId);
    await sendTracked(sock, recentMessages, jid, { text: reply });
    await patchSession(mods.WhatsAppSession, userId, {
      lastMessageAt: new Date(),
    });
    return;
  }

  if (mods.parseWeeklyReportQuery(body)) {
    const review = await mods.getWeeklyReview(userId, 0);
    const reply = mods.formatWeeklyReportWaText(review);
    await sendTracked(sock, recentMessages, jid, { text: reply });
    await patchSession(mods.WhatsAppSession, userId, {
      lastMessageAt: new Date(),
    });
    return;
  }

  const totalsQuery = mods.parseTotalsQuery(body);
  if (totalsQuery) {
    const reply = await mods.buildTotalsReply(userId, totalsQuery);
    await sendTracked(sock, recentMessages, jid, { text: reply });
    await patchSession(mods.WhatsAppSession, userId, {
      lastMessageAt: new Date(),
    });
    return;
  }

  const parsed = mods.parseMoneyMessage(body);
  if (!parsed) {
    // Prefixed but not understood — guide user (OpenClaw already skipped)
    await sendTracked(sock, recentMessages, jid, {
      text: `Vira · format tidak dikenali. Contoh: ${mods.formatPrefixExamples()}`,
    });
    return;
  }

  const resolved = await mods.resolveWaAccount(
    userId,
    session.defaultAccountId ? String(session.defaultAccountId) : null,
    parsed.accountHint ?? null
  );
  if (!resolved.ok) {
    await sendTracked(sock, recentMessages, jid, { text: resolved.error });
    return;
  }
  const account = resolved.account;

  if (account.currency !== parsed.currency) {
    await sendTracked(sock, recentMessages, jid, {
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
    await sendTracked(sock, recentMessages, jid, {
      text: "Vira · kategori tidak ditemukan. Seed kategori dulu lewat app.",
    });
    return;
  }

  const payTag = parsed.accountHint
    ? parsed.accountHint === "cc"
      ? "cc"
      : "debit"
    : null;

  const tx = await mods.createTransaction(userId, {
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency,
    accountId: String(account._id),
    categoryId,
    description: parsed.description,
    merchant: parsed.merchant,
    date: new Date().toISOString(),
    notes: payTag
      ? `via WhatsApp Vira (${payTag})`
      : "via WhatsApp Vira",
    tags: payTag
      ? ["whatsapp", "vira", payTag]
      : ["whatsapp", "vira"],
  });

  await patchSession(mods.WhatsAppSession, userId, {
    lastMessageAt: new Date(),
  });

  let reply =
    `OK · ${parsed.type === "EXPENSE" ? "Expense" : "Income"} ` +
    `${parsed.categoryHint} ${mods.formatMoney(parsed.amount, parsed.currency)}` +
    ` · ${account.name}`;

  if (parsed.type === "INCOME") {
    const tip = await mods.loadIncomeSaveSuggestion(userId, {
      type: "INCOME",
      amount: parsed.amount,
      currency: parsed.currency,
      categoryName: parsed.categoryHint,
    });
    if (tip) {
      const pct = Math.round(tip.rate * 100);
      reply +=
        `\nVira · saran tabung ${mods.formatMoney(tip.suggestAmount, tip.currency)}` +
        ` ke ${tip.goalName} (${pct}%, tanpa auto-debit)`;
    }
  }

  await sendTracked(sock, recentMessages, jid, { text: reply });

  logger.info(
    { userId, txId: String(tx._id), amount: parsed.amount },
    "transaction saved from WA"
  );
}

async function flushOutbound(
  userId: string,
  sock: WASocket,
  mods: AppModules,
  recentMessages: RecentMessageStore
) {
  const pending = await mods.WhatsAppOutbound.find({
    userId,
    status: "pending",
  })
    .sort({ createdAt: 1 })
    .limit(5);

  const { markOutboundSent, markOutboundFailed } = await import(
    "../src/lib/whatsapp/outbound-flush"
  );

  for (const msg of pending) {
    const phone = digitsOnly(msg.toPhone);
    if (!phone) {
      await markOutboundFailed(
        mods.WhatsAppOutbound,
        msg._id,
        "invalid toPhone"
      );
      continue;
    }
    try {
      await sendTracked(sock, recentMessages, `${phone}@s.whatsapp.net`, {
        text: msg.body,
      });
      // updateOne status only — never msg.save() (stale kind enum → pending loop)
      await markOutboundSent(mods.WhatsAppOutbound, msg._id);
      logger.info(
        { userId, outboundId: String(msg._id), kind: msg.kind },
        "outbound WhatsApp message sent"
      );
    } catch (err) {
      await markOutboundFailed(
        mods.WhatsAppOutbound,
        msg._id,
        err instanceof Error ? err.message : String(err)
      );
      logger.warn(
        { err, userId, outboundId: String(msg._id) },
        "outbound WhatsApp send failed"
      );
    }
  }
}

async function maybeEnqueueWeeklyReports(mods: AppModules) {
  if (!mods.isWeeklyReportCronWindow()) return;
  const weekKey = mods.weeklyReportWeekKey();
  const sessions = await mods.WhatsAppSession.find({
    desiredState: "running",
    status: "connected",
    weeklyReportEnabled: { $ne: false },
    lastWeeklyReportWeekKey: { $ne: weekKey },
  });

  for (const session of sessions) {
    const userId = String(session.userId);
    if (!digitsOnly(session.allowedFrom)) continue;
    try {
      // Sunday evening → wrap up the week that is ending (before Monday)
      await mods.enqueueWeeklyReport(userId, {
        weekOffset: 0,
        kind: "WEEKLY_REPORT",
      });
      session.lastWeeklyReportWeekKey = weekKey;
      await session.save();
      logger.info({ userId, weekKey }, "queued scheduled weekly report");
    } catch (err) {
      logger.warn({ err, userId }, "failed to enqueue weekly report");
    }
  }
}

async function maybeEnqueueFixedCostReminders(mods: AppModules) {
  if (!mods.isFixedCostReminderCronWindow()) return;
  const dayKey = mods.fixedCostReminderDayKey();
  const sessions = await mods.WhatsAppSession.find({
    desiredState: "running",
    status: "connected",
    fixedCostReminderEnabled: { $ne: false },
    lastFixedCostReminderDayKey: { $ne: dayKey },
  });

  for (const session of sessions) {
    const userId = String(session.userId);
    if (!digitsOnly(session.allowedFrom)) continue;
    try {
      const queued = await mods.enqueueFixedCostDueReminder(userId);
      // Mark day even when empty so the 08:00 window does not re-query every tick
      session.lastFixedCostReminderDayKey = dayKey;
      await session.save();
      if (queued) {
        logger.info(
          { userId, dayKey, itemCount: queued.itemCount },
          "queued scheduled fixed-cost due reminder"
        );
      } else {
        logger.info(
          { userId, dayKey },
          "no unpaid fixed costs due today — skipped WA"
        );
      }
    } catch (err) {
      logger.warn({ err, userId }, "failed to enqueue fixed-cost reminder");
    }
  }
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
      const entry = active.get(userId);
      if (entry && !entry.stopping) {
        await flushOutbound(userId, entry.sock, mods, entry.recentMessages);
      }
    }
  }

  await maybeEnqueueWeeklyReports(mods);
  await maybeEnqueueFixedCostReminders(mods);
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
