import { getWaPrefix } from "@/lib/whatsapp/prefix";

/** Reply when user sends help / bantuan / vira on WhatsApp. */
export function getViraHelpText(): string {
  const p = getWaPrefix();
  const pre = p ? `${p} ` : "";

  return `Vira · cara catat uang
${
  p
    ? `Satu nomor dengan OpenClaw: selalu awali dengan "${p} " supaya Finora yang jawab.\n`
    : ""
}
Format: ${pre}deskripsi + jumlah

Expense:
• ${pre}makan 50rb
• ${pre}kopi 35k
• ${pre}gojek 25.000
• ${pre}isi bensin 200rb
• ${pre}bayar parkir 5rb
• ${pre}isi flazz 100rb
• ${pre}belanja 150rb

Income:
• ${pre}gaji 10jt
• ${pre}freelance 2 juta

Cek total:
• ${pre}total pengeluaran
• ${pre}pengeluaran hari ini
• ${pre}total pemasukan
• ${pre}ringkasan

Jumlah: 50rb / 35k / 25.000 / 1.5jt / 10 juta

Ketik ${pre}help untuk pesan ini.`;
}

/** @deprecated use getViraHelpText() */
export const VIRA_HELP_TEXT = getViraHelpText();
