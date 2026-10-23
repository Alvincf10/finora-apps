import { stripWaPrefix } from "@/lib/whatsapp/prefix";
import { parseWeeklyReportQuery } from "@/lib/financial/weekly-review";

/** Bot reply signatures — fromMe echoes of these must never be re-handled. */
const BOT_REPLY_PREFIXES = ["Vira ·", "OK ·", "Finora ·"] as const;

/**
 * Max body length (after prefix strip) allowed for fromMe commands.
 * Bot-generated weekly reports are much longer; user commands are short.
 */
export const FROM_ME_COMMAND_MAX_BODY = 80;

export function isBotReplyText(text: string): boolean {
  const trimmed = text.trim();
  return BOT_REPLY_PREFIXES.some((p) => trimmed.startsWith(p));
}

/**
 * Whether an inbound WA message should be ignored to prevent echo loops.
 *
 * Critical regression: weekly report used to start with "Finora · Report minggu…".
 * Baileys delivered it as fromMe; stripWaPrefix treated "Finora " as the command
 * prefix; parseWeeklyReportQuery matched → send again → infinite spam.
 */
export function shouldIgnoreWaEcho(
  text: string,
  fromMe: boolean
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  if (isBotReplyText(trimmed)) return true;

  if (!fromMe) return false;

  // fromMe is only for explicit short user commands on the linked phone
  // (e.g. "finora report minggu"). Never for long bot bodies.
  const stripped = stripWaPrefix(trimmed);
  if (!stripped.ok) return true;
  if (stripped.body.length > FROM_ME_COMMAND_MAX_BODY) return true;
  return false;
}

/**
 * True if sending `outboundBody` would be re-interpreted as a Finora command
 * that pulls another weekly report — the spam-loop condition.
 */
export function wouldEchoLoopAsWeeklyReport(outboundBody: string): boolean {
  if (shouldIgnoreWaEcho(outboundBody, true)) return false;

  const stripped = stripWaPrefix(outboundBody.trim());
  if (!stripped.ok) return false;
  return parseWeeklyReportQuery(stripped.body);
}
