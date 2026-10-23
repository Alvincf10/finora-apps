/**
 * Shared-number mode (e.g. with OpenClaw): only handle messages that start
 * with the Finora prefix. Set WA_PREFIX="" to disable (Finora-only number).
 *
 * Default prefix: "finora" → "finora makan 50rb", "finora total pengeluaran"
 */
export function getWaPrefix(): string {
  if (process.env.WA_PREFIX === undefined) return "finora";
  return process.env.WA_PREFIX.trim().toLowerCase();
}

export type PrefixStripResult =
  | { ok: true; body: string }
  | { ok: false; reason: "missing_prefix" };

/**
 * Strip leading prefix. Accepts "f …", "f:…", "f.…", "/f …".
 * If prefix is empty, always ok (pass-through).
 */
export function stripWaPrefix(text: string): PrefixStripResult {
  const prefix = getWaPrefix();
  const trimmed = text.trim();
  if (!prefix) return { ok: true, body: trimmed };

  const lower = trimmed.toLowerCase();
  const patterns = [
    new RegExp(`^${escapeRegex(prefix)}\\s+`, "i"),
    new RegExp(`^${escapeRegex(prefix)}[:.]\\s*`, "i"),
    new RegExp(`^/${escapeRegex(prefix)}\\s+`, "i"),
  ];

  for (const re of patterns) {
    if (re.test(trimmed)) {
      return { ok: true, body: trimmed.replace(re, "").trim() };
    }
  }

  // Exact "f help" style already covered by "f " + body.
  // Allow bare prefix alone → empty body (caller can treat as help).
  if (lower === prefix || lower === `/${prefix}`) {
    return { ok: true, body: "help" };
  }

  return { ok: false, reason: "missing_prefix" };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatPrefixExamples(prefix = getWaPrefix()): string {
  if (!prefix) {
    return "makan 50rb";
  }
  return `${prefix} makan 50rb`;
}
