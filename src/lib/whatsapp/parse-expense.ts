/** Trailing payment source on WA messages: `… 50rb cc` / `… 50rb debit`. */
export type AccountHint = "cc" | "debit";

export type ParsedMoneyIntent = {
  type: "INCOME" | "EXPENSE";
  amount: number;
  currency: "IDR" | "EUR";
  description: string;
  categoryHint: string;
  merchant?: string;
  accountHint?: AccountHint;
};

/** Strip trailing `cc` / `debit` (and aliases) after the amount. */
export function stripAccountHint(text: string): {
  body: string;
  hint: AccountHint | null;
} {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const m = cleaned.match(/\s+(cc|credit|kartu\s+kredit|debit|db)$/i);
  if (!m || m.index === undefined) return { body: cleaned, hint: null };

  const raw = m[1].toLowerCase().replace(/\s+/g, " ");
  const hint: AccountHint =
    raw === "debit" || raw === "db" ? "debit" : "cc";
  return { body: cleaned.slice(0, m.index).trim(), hint };
}

/** Keyword → category name (must match seeded category names). */
const EXPENSE_KEYWORDS: Array<{ keys: string[]; category: string }> = [
  {
    keys: [
      "makan",
      "makanan",
      "jajan",
      "food",
      "nasi",
      "ayam",
      "kopi",
      "coffee",
      "makan siang",
      "sarapan",
      "delivery",
      "gofood",
      "grabfood",
      "shopeefood",
      "resto",
      "restaurant",
      "warung",
      "cafe",
      "kafe",
    ],
    category: "Food",
  },
  {
    keys: ["groceries", "belanja bulanan", "supermarket", "indomaret", "alfamart"],
    category: "Groceries",
  },
  {
    keys: [
      "pacar",
      "pasangan",
      "relationship",
      "kencan",
      "date night",
      "anniversary",
      "jalan sama",
      "jalan bareng",
    ],
    category: "Relationship",
  },
  {
    keys: ["listrik", "pln", "internet", "wifi", "sewa", "rent", "kos", "air"],
    category: "Housing",
  },
  {
    keys: [
      "belanja",
      "shopping",
      "baju",
      "celana",
      "parfum",
      "perfume",
      "sepatu",
      "tas",
      "skincare",
      "hiburan",
      "nonton",
      "netflix",
      "spotify",
      "langganan",
      "subscription",
    ],
    category: "Lifestyle",
  },
  {
    keys: [
      "flazz",
      "topup flazz",
      "isi flazz",
      "isi saldo flazz",
    ],
    category: "Flazz",
  },
  {
    keys: [
      "gojek",
      "grab",
      "ojek",
      "parkir",
      "tol",
      "mrt",
      "krl",
      "transjakarta",
      "transport",
      "taksi",
      "taxi",
      "uber",
    ],
    category: "Transport",
  },
  {
    keys: ["bensin", "bbm", "pertalite", "pertamax", "solar", "fuel", "isi bensin"],
    category: "Fuel",
  },
  {
    keys: ["tagihan", "bill", "pulsa", "kuota", "bpjs", "pajak"],
    category: "Bills",
  },
  {
    keys: ["hutang", "cicilan", "debt", "kredit"],
    category: "Debt Payment",
  },
  {
    keys: ["tabungan", "saving", "savings", "investasi"],
    category: "Savings",
  },
];

const INCOME_KEYWORDS: Array<{ keys: string[]; category: string }> = [
  { keys: ["gaji", "salary", "payroll"], category: "Salary" },
  { keys: ["freelance", "project", "client"], category: "Freelance" },
  { keys: ["income", "pemasukan", "transfer masuk", "terima"], category: "Other Income" },
];

/**
 * Parse Indonesian shorthand amounts into minor units (IDR = whole rupiah).
 * Supports: 50rb, 50 ribu, 1.5jt, 1,5 juta, 25000, 25.000, 25k
 */
export function parseIdrAmount(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  // 1.5jt / 1,5 juta / 2jt
  let m = text.match(/^(\d+(?:[.,]\d+)?)\s*(jt|juta)$/);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000_000);
  }

  // 50rb / 50 ribu / 50k
  m = text.match(/^(\d+(?:[.,]\d+)?)\s*(rb|ribu|k)$/);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000);
  }

  // 25.000 or 25,000 or 25000
  const digits = text.replace(/[.\s]/g, "").replace(",", "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function matchCategory(
  haystack: string,
  table: Array<{ keys: string[]; category: string }>,
  fallback: string
): string {
  const lower = haystack.toLowerCase();
  let best: { category: string; len: number } | null = null;
  for (const row of table) {
    for (const key of row.keys) {
      if (lower.includes(key) && (!best || key.length > best.len)) {
        best = { category: row.category, len: key.length };
      }
    }
  }
  return best?.category ?? fallback;
}

const RELATIONSHIP_KEYS =
  EXPENSE_KEYWORDS.find((r) => r.category === "Relationship")?.keys ?? [];

/** Date / partner context wins over Food when both match (e.g. makan + pacar). */
function resolveExpenseCategory(haystack: string): string {
  const lower = haystack.toLowerCase();
  const hasRelationship = RELATIONSHIP_KEYS.some((k) => lower.includes(k));
  if (hasRelationship) return "Relationship";
  return matchCategory(haystack, EXPENSE_KEYWORDS, "Other");
}

const AMOUNT_TOKEN_RE =
  /(\d+(?:[.,]\d+)?\s*(?:jt|juta|rb|ribu|k)|\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)/gi;

/**
 * Locate amount: prefer trailing token (legacy), else first clear money token
 * with suffix / thousand separators (allows `belanja 115rb beli baju`).
 */
function locateAmount(body: string): { raw: string; index: number } | null {
  const endMatch = body.match(
    /(\d+(?:[.,]\d+)?(?:\s*(?:jt|juta|rb|ribu|k))?|\d{1,3}(?:[.\s]\d{3})+)\s*$/i
  );
  if (endMatch && endMatch.index !== undefined) {
    const raw = endMatch[0].trim();
    if (parseIdrAmount(raw) !== null) {
      return { raw, index: endMatch.index };
    }
  }

  AMOUNT_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_TOKEN_RE.exec(body)) !== null) {
    const raw = m[0].trim();
    // Mid-message bare integers are ambiguous (`beli 2 baju`) — require money cue
    const hasMoneyCue =
      /(?:jt|juta|rb|ribu|k)$/i.test(raw) ||
      /\d{1,3}(?:[.\s]\d{3})+/.test(raw);
    if (!hasMoneyCue) continue;
    if (parseIdrAmount(raw) === null) continue;
    return { raw, index: m.index };
  }
  return null;
}

/**
 * Parse free-text money intents, e.g.:
 * - "makan 50rb"
 * - "belanja 115rb beli baju running"
 * - "gojek 25.000"
 * - "gaji 10jt"
 * - "expense kopi 35k"
 * - "income freelance 2jt"
 * - "pengeluaran beli recheese 50rb cc"
 * - "pengeluaran beli recheese 50rb debit"
 */
export function parseMoneyMessage(text: string): ParsedMoneyIntent | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 500) return null;

  // Explicit type prefix
  let forcedType: "INCOME" | "EXPENSE" | null = null;
  let body = cleaned;
  if (/^(expense|pengeluaran|keluar)\b/i.test(cleaned)) {
    forcedType = "EXPENSE";
    body = cleaned.replace(/^(expense|pengeluaran|keluar)\s+/i, "");
  } else if (/^(income|pemasukan|masuk|in)\b/i.test(cleaned)) {
    forcedType = "INCOME";
    body = cleaned.replace(/^(income|pemasukan|masuk|in)\s+/i, "");
  }

  const { body: withoutAccount, hint: accountHint } = stripAccountHint(body);
  body = withoutAccount;

  const located = locateAmount(body);
  if (!located) return null;

  const amount = parseIdrAmount(located.raw);
  if (amount === null) return null;

  const before = body.slice(0, located.index).trim();
  const after = body.slice(located.index + located.raw.length).trim();
  const descPart = [before, after].filter(Boolean).join(" ");
  if (!descPart) return null;

  const categoryHaystack = `${descPart} ${located.raw}`.toLowerCase();
  const incomeHint = matchCategory(categoryHaystack, INCOME_KEYWORDS, "");
  const expenseHint = resolveExpenseCategory(categoryHaystack);

  let type: "INCOME" | "EXPENSE" =
    forcedType ?? (incomeHint ? "INCOME" : "EXPENSE");
  let categoryHint =
    type === "INCOME" ? incomeHint || "Other Income" : expenseHint;

  if (forcedType === "INCOME" && !incomeHint) categoryHint = "Other Income";
  if (forcedType === "EXPENSE" && expenseHint === "Other") {
    categoryHint = resolveExpenseCategory(descPart);
  }

  return {
    type,
    amount,
    currency: "IDR",
    description: descPart,
    categoryHint,
    merchant: descPart.slice(0, 80),
    ...(accountHint ? { accountHint } : {}),
  };
}
