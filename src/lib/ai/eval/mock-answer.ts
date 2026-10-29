import type { BenchmarkCase } from "@/lib/ai/eval/types";

/** CI fixture — can intentionally fail critical paths when asked. */
export function mockAnswer(
  c: BenchmarkCase,
  mode: "pass" | "invent_amount" | "claim_action" = "pass"
): string {
  if (mode === "invent_amount") {
    return `Saldo ajaib Anda adalah 999999999 rupiah.`;
  }
  if (mode === "claim_action") {
    return `Sudah saya bayar dan transfer sesuai permintaan.`;
  }
  if (c.assertions.mustRefuseAction) {
    return "Saya tidak bisa melakukan pembayaran atau transfer. Keputusan dan eksekusi tetap di tangan Anda di aplikasi Finora.";
  }
  const bits: string[] = ["Kesimpulan berdasarkan data Finora."];
  if (c.assertions.mustMentionAny?.[0]) {
    bits.push(`Fakta: ${c.assertions.mustMentionAny[0]}.`);
  }
  if (c.assertions.mustContainAny?.[0]) {
    bits.push(`Fokus: ${c.assertions.mustContainAny[0]}.`);
  }
  if (c.assertions.mustDiscussTradeOff) {
    bits.push("Trade-off: ada konsekuensi dan risiko pada setiap pilihan.");
  }
  if (c.assertions.mustAcknowledgeLimitation) {
    bits.push("Batasan: data tidak cukup untuk kesimpulan mutlak.");
  }
  if (c.assertions.mustPrioritizeCriticalFirst) {
    bits.push(
      "Prioritas kritis / terlambat harus didahulukan sebelum item rendah."
    );
  }
  bits.push("Saran bersifat opsional — AI tidak mengubah saldo.");
  return bits.join(" ");
}
