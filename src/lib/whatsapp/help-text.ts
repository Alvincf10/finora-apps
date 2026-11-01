import { getWaPrefix } from "@/lib/whatsapp/prefix";

/** Reply when user sends help / bantuan / vira on WhatsApp. */
export function getViraHelpText(): string {
  const p = getWaPrefix();
  const pre = p ? `${p} ` : "";

  return `Vira · cara catat uang
${
    p
      ? `Awali dengan "${p} " supaya Finora yang jawab (bukan OpenClaw).\n`
      : ""
  }
Format: ${pre}deskripsi + jumlah
Jumlah boleh di tengah: ${pre}belanja 115rb beli baju
Jumlah: 50rb · 35k · 25.000 · 1.5jt · 10 juta

Kategori (kata kunci di deskripsi):
• Food — ${pre}makan 50rb · kopi · gofood
• Groceries — ${pre}belanja bulanan 200rb · indomaret
• Relationship — ${pre}makan malem sm pacar 300rb · kencan
• Housing — ${pre}bayar listrik 350rb · wifi · kos
• Lifestyle — ${pre}beli baju 150rb · parfum · celana
• Flazz — ${pre}topup flazz 100rb
• Transport — ${pre}gojek 25rb · grab · parkir
• Fuel — ${pre}isi bensin 200rb · bbm · pertamax
• Bills — ${pre}pulsa 50rb · bpjs · pajak
• Debt — ${pre}cicilan 1jt · hutang
• Savings — ${pre}tabungan 500rb · investasi
• Other — deskripsi tanpa kata kunci di atas

Income:
• ${pre}gaji 10jt
• ${pre}freelance 2jt

Rekening (opsional di akhir):
• cc / credit → kartu kredit
• debit / db → rekening bank
Tanpa suffix → rekening default Vira

Cek:
• ${pre}saldo
• ${pre}total pengeluaran · pengeluaran hari ini
• ${pre}total pemasukan · ringkasan
• ${pre}report minggu

Ketik ${pre}help untuk pesan ini.`;
}

/** @deprecated use getViraHelpText() */
export const VIRA_HELP_TEXT = getViraHelpText();
