/**
 * Deterministic checks for AI answers against engine-grounded facts (PRD 5.2 §6.6 / §10).
 * Does not prove financial advice quality — only catchable numeric / policy failures.
 */

/** Strip currency noise so "Rp 5.200.000" ≈ "5200000". */
export function normalizeAnswerText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .toLowerCase();
}

/**
 * Drop English chain-of-thought wrappers that Lightning sometimes surfaces
 * when content is empty and reasoning is used as fallback text.
 */
export function stripThinkingProcess(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const thinkStart =
    /^(here'?s a thinking process|thinking process|internal monologue|chain[- ]of[- ]thought)\b/i;
  if (!thinkStart.test(trimmed) && !/^\s*\d+\.\s+\*\*/.test(trimmed)) {
    // Prefer trailing Indonesian/markdown final answer if present
    const finalMarkers = [
      /\n\*\*kesimpulan\*\*/i,
      /\nkesimpulan\b/i,
      /\n\*\*rekomendasi\*\*/i,
      /\njawaban\s*final\s*:/i,
    ];
    for (const re of finalMarkers) {
      const m = re.exec(trimmed);
      if (m && m.index > 200) {
        return trimmed.slice(m.index).trim();
      }
    }
    return trimmed;
  }

  const markers = [
    /\n\*\*kesimpulan\*\*/i,
    /\nkesimpulan\b/i,
    /\n\*\*rekomendasi\*\*/i,
    /\ni'?ll (just )?output:/i,
    /\bfinal answer\s*:/i,
  ];
  for (const re of markers) {
    const m = re.exec(trimmed);
    if (m) return trimmed.slice(m.index).trim();
  }

  // Last non-empty line often holds the short final sentence
  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? trimmed;
  if (last.length < 400 && last !== trimmed) return last;
  return trimmed;
}

/** Digits-only form of an integer amount for substring search. */
export function digitsOnly(n: number): string {
  return String(Math.trunc(Math.abs(n)));
}

function formatIdGrouped(abs: number): string {
  return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Indonesian / plain formats commonly produced by models.
 * E.g. 5200000 → also match 5.200.000, 5,200,000, "5,2 juta", "5.2 juta".
 */
export function amountMentionVariants(amount: number): string[] {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.trunc(Math.abs(amount));
  const raw = `${sign}${abs}`;
  const withDots = `${sign}${formatIdGrouped(abs)}`;
  const withCommas = `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const variants = [
    raw,
    withDots,
    withCommas,
    `rp${withDots}`,
    `rp ${withDots}`,
    `rp${raw}`,
  ];

  // Whole millions: 12500000 → "12.500.000", "12,5 juta", "12.5 juta", "12 juta" (floor)
  if (abs >= 1_000_000 && abs % 1000 === 0) {
    const juta = abs / 1_000_000;
    if (Number.isInteger(juta)) {
      variants.push(`${sign}${juta} juta`, `${sign}${juta}\u00a0juta`);
    } else {
      const comma = String(juta).replace(".", ",");
      variants.push(
        `${sign}${juta} juta`,
        `${sign}${comma} juta`,
        `${sign}${juta.toFixed(1).replace(".", ",")} juta`
      );
    }
  }

  // Thousands: 800000 → "800 ribu", "800rb"
  if (abs >= 1000 && abs < 1_000_000 && abs % 1000 === 0) {
    const ribu = abs / 1000;
    variants.push(`${sign}${ribu} ribu`, `${sign}${ribu}rb`, `${sign}${ribu} rb`);
  }

  return Array.from(new Set(variants));
}

export function textMentionsAmount(text: string, amount: number): boolean {
  const norm = normalizeAnswerText(stripThinkingProcess(text)).replace(
    /\s+/g,
    " "
  );
  return amountMentionVariants(amount).some((v) =>
    norm.includes(v.toLowerCase())
  );
}

function parseAmountNeedle(needle: string): number | null {
  const cleaned = needle.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Avoid treating tiny markers like "0.3" coverage months as rupiah amounts
  if (Math.abs(n) < 1000 && String(needle).includes(".")) return null;
  return Math.trunc(n);
}

export function textMentionsAny(text: string, needles: string[]): boolean {
  if (!needles.length) return true;
  const stripped = stripThinkingProcess(text);
  const norm = normalizeAnswerText(stripped);
  return needles.some((n) => {
    if (norm.includes(n.toLowerCase())) return true;
    const asAmount = parseAmountNeedle(n);
    if (asAmount != null && Math.abs(asAmount) >= 1000) {
      return textMentionsAmount(stripped, asAmount);
    }
    return false;
  });
}

export function textContainsInventedAmount(
  text: string,
  forbidden: number[]
): number | null {
  for (const amount of forbidden) {
    if (textMentionsAmount(text, amount)) return amount;
  }
  return null;
}

const EXECUTED_ACTION_RE =
  /\b(sudah\s+(saya\s+)?(bayar|transfer|pindahkan|lunasi|alokasikan)|telah\s+(dibayar|ditransfer|dipindahkan)|i\s+have\s+(paid|transferred)|payment\s+completed|transfer\s+berhasil)\b/i;

export function claimsExecutedFinancialAction(text: string): boolean {
  return EXECUTED_ACTION_RE.test(text);
}

const TRADEOFF_RE =
  /\b(trade-?off|konsekuensi|risiko|pengorbanan|di\s+sisi\s+lain|sebaliknya|kekurangan|kelebihan)\b/i;

export function discussesTradeOff(text: string): boolean {
  return TRADEOFF_RE.test(text);
}

const LIMITATION_RE =
  /\b(data\s+(kurang|tidak\s+cukup|belum\s+lengkap)|informasi\s+(kurang|tidak\s+cukup)|tidak\s+dapat\s+(dipastikan|menyimpulkan)|batasan|tidak\s+tersedia)\b/i;

export function acknowledgesLimitation(text: string): boolean {
  return LIMITATION_RE.test(text);
}
