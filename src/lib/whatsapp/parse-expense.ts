export type ParsedMoneyIntent = {
  type: "INCOME" | "EXPENSE";
  amount: number;
  currency: "IDR" | "EUR";
  description: string;
  categoryHint: string;
  merchant?: string;
};

/** Keyword → category name (must match seeded category names). */
const EXPENSE_KEYWORDS: Array<{ keys: string[]; category: string }> = [
  {
    keys: [
      "makan",
      "makanan",
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
    ],
    category: "Food",
  },
  {
    keys: ["groceries", "belanja bulanan", "supermarket", "indomaret", "alfamart"],
    category: "Groceries",
  },
  {
    keys: ["resto", "restaurant", "warung", "cafe", "kafe"],
    category: "Restaurant",
  },
  {
    keys: [
      "isi bensin",
      "bensin",
      "bbm",
      "spbu",
      "pertamina",
      "shell",
      "fuel",
      "isi solar",
    ],
    category: "Fuel",
  },
  {
    keys: [
      "parkir",
      "parking",
      "bayar parkir",
      "flazz",
      "isi flazz",
      "topup flazz",
      "e-toll",
      "etoll",
      "e toll",
      "isi etoll",
      "tol",
    ],
    category: "Parking",
  },
  {
    keys: [
      "gojek",
      "grab",
      "ojek",
      "taxi",
      "transport",
      "kereta",
      "mrt",
      "bus",
      "angkot",
    ],
    category: "Transport",
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

/**
 * Parse free-text money intents, e.g.:
 * - "makan 50rb"
 * - "gojek 25.000"
 * - "gaji 10jt"
 * - "expense kopi 35k"
 * - "income freelance 2jt"
 */
export function parseMoneyMessage(text: string): ParsedMoneyIntent | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 500) return null;

  const lower = cleaned.toLowerCase();

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

  // Find amount token: last number-like token with optional suffix
  const amountMatch = body.match(
    /(\d+(?:[.,]\d+)?(?:\s*(?:jt|juta|rb|ribu|k))?|\d{1,3}(?:[.\s]\d{3})+)\s*$/i
  );
  if (!amountMatch || amountMatch.index === undefined) return null;

  const amountRaw = amountMatch[0];
  const amount = parseIdrAmount(amountRaw);
  if (amount === null) return null;

  const descPart = body.slice(0, amountMatch.index).trim();
  if (!descPart) return null;

  const incomeHint = matchCategory(lower, INCOME_KEYWORDS, "");
  const expenseHint = matchCategory(lower, EXPENSE_KEYWORDS, "Other");

  let type: "INCOME" | "EXPENSE" =
    forcedType ?? (incomeHint ? "INCOME" : "EXPENSE");
  let categoryHint =
    type === "INCOME" ? incomeHint || "Other Income" : expenseHint;

  if (forcedType === "INCOME" && !incomeHint) categoryHint = "Other Income";
  if (forcedType === "EXPENSE" && expenseHint === "Other") {
    categoryHint = matchCategory(descPart, EXPENSE_KEYWORDS, "Other");
  }

  return {
    type,
    amount,
    currency: "IDR",
    description: descPart,
    categoryHint,
    merchant: descPart.slice(0, 80),
  };
}
