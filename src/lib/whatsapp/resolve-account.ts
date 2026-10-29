import type { AccountHint } from "@/lib/whatsapp/parse-expense";
import { Account, type AccountDocument } from "@/models/Account";
import type { AccountType } from "@/types";

export type ResolveAccountResult =
  | { ok: true; account: AccountDocument }
  | { ok: false; error: string };

function typesForHint(hint: AccountHint): AccountType[] {
  return hint === "cc" ? ["CREDIT_CARD"] : ["BANK"];
}

function labelForHint(hint: AccountHint): string {
  return hint === "cc" ? "kartu kredit (cc)" : "debit/bank";
}

/**
 * Pick the spend/income account for a WA money message.
 * - no hint → WhatsApp default account
 * - `cc` → active CREDIT_CARD (prefer default if it is one)
 * - `debit` → active BANK (prefer default if it is one)
 */
export async function resolveWaAccount(
  userId: string,
  defaultAccountId: string | null | undefined,
  hint: AccountHint | null | undefined
): Promise<ResolveAccountResult> {
  if (!hint) {
    if (!defaultAccountId) {
      return {
        ok: false,
        error:
          "Vira · set rekening default dulu di menu WhatsApp (Vira) di app.",
      };
    }
    const account = await Account.findOne({
      _id: defaultAccountId,
      userId,
      isActive: true,
    });
    if (!account) {
      return {
        ok: false,
        error: "Vira · rekening default tidak ditemukan. Pilih lagi di app.",
      };
    }
    return { ok: true, account };
  }

  const types = typesForHint(hint);
  const matches = await Account.find({
    userId,
    isActive: true,
    type: { $in: types },
  }).sort({ name: 1 });

  if (matches.length === 0) {
    return {
      ok: false,
      error: `Vira · belum ada rekening ${labelForHint(hint)}. Tambah di app dulu.`,
    };
  }

  if (defaultAccountId) {
    const preferred = matches.find(
      (a) => String(a._id) === String(defaultAccountId)
    );
    if (preferred) return { ok: true, account: preferred };
  }

  if (matches.length === 1) {
    return { ok: true, account: matches[0]! };
  }

  const names = matches.map((a) => a.name).join(", ");
  return {
    ok: false,
    error:
      `Vira · ada ${matches.length} rekening ${labelForHint(hint)}: ${names}. ` +
      `Set salah satunya sebagai default di app, atau pastikan hanya satu yang aktif.`,
  };
}
