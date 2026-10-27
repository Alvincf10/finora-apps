import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const USAGE_LOG =
  process.env.FINORA_AI_USAGE_LOG_PATH ??
  process.env.FINORA_COST_LEDGER_PATH ??
  "/var/lib/openclaw-cost/ledger.jsonl";

export type AIUsageLogEntry = {
  requestId: string;
  userIdHash: string;
  contextType: string;
  model: string | null;
  status: "ok" | "error";
  errorCode?: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  ts: string;
};

/** Pseudonymize user id for logs (not reversible without secret). */
export function hashUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `u${h.toString(16)}`;
}

/**
 * Append usage metadata only — never prompt, context, or API keys.
 */
export function appendAIUsageLog(entry: AIUsageLogEntry) {
  try {
    const dir = dirname(USAGE_LOG);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      USAGE_LOG,
      `${JSON.stringify({
        ...entry,
        agent_name: "finora",
        task_type: "ai_explain",
        month_key: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
        })
          .format(new Date())
          .slice(0, 7),
      })}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
  } catch {
    // Never fail the user-facing call because of log I/O
  }
}
