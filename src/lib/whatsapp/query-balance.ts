import { Account } from "@/models/Account";
import { User } from "@/models/User";
import { formatMoney } from "@/lib/money";
import { isLiabilityAccount } from "@/lib/financial/balances";
import type { AccountType, Currency } from "@/types";

/** Detect balance queries: saldo, /saldo, cek saldo, balance. */
export function parseBalanceQuery(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return false;
  if (/^(?:\/)?saldo\b/.test(t)) return true;
  if (/^(?:\/)?balance\b/.test(t)) return true;
  if (/^cek\s+saldo\b/.test(t)) return true;
  if (t === "saldo" || t === "/saldo") return true;
  return false;
}

/**
 * Deterministic balance reply — no LLM.
 * Uses stored account.currentBalance (backend source of truth).
 */
export async function buildBalanceReply(userId: string): Promise<string> {
  const user = await User.findById(userId).lean();
  const baseCurrency = (user?.baseCurrency ?? "IDR") as Currency;

  const accounts = await Account.find({ userId, isActive: true })
    .sort({ name: 1 })
    .lean();

  if (accounts.length === 0) {
    return "Vira · belum ada rekening aktif. Tambah dulu di app Finora.";
  }

  const lines: string[] = ["Vira · saldo"];
  let assets = 0;
  let liabilities = 0;

  for (const account of accounts) {
    const currency = (account.currency as Currency) ?? baseCurrency;
    const bal = account.currentBalance ?? 0;
    const liability = isLiabilityAccount(account.type as AccountType);
    if (liability) {
      liabilities += Math.max(0, bal);
      lines.push(
        `• ${account.name} (utang): ${formatMoney(Math.max(0, bal), currency)}`
      );
    } else {
      assets += bal;
      lines.push(`• ${account.name}: ${formatMoney(bal, currency)}`);
    }
  }

  // Net only when all accounts share base currency (avoid FX inventing)
  const sameCurrency = accounts.every(
    (a) => (a.currency as Currency) === baseCurrency
  );
  if (sameCurrency) {
    const net = assets - liabilities;
    lines.push(`Net (kas − utang CC): ${formatMoney(net, baseCurrency)}`);
  }

  return lines.join("\n");
}
