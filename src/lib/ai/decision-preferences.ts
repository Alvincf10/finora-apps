/**
 * Explicit user priorities for Decision Advisor (PRD 5.2 §9.5).
 * Never invent a preference — UNSET means AI must state that constraint.
 */

export const DECISION_PREFERENCES = [
  "UNSET",
  "LIQUIDITY",
  "DEBT_PAYOFF",
  "MAXIMIZE_SAVINGS",
  "SPENDING_STABILITY",
  "ROADMAP_FOCUS",
] as const;

export type DecisionPreference = (typeof DECISION_PREFERENCES)[number];

export const DECISION_PREFERENCE_LABELS: Record<
  DecisionPreference,
  { id: string; en: string }
> = {
  UNSET: {
    id: "Belum dipilih — AI harus menyatakan preferensi belum ditetapkan",
    en: "Not set — AI must say preference is unset",
  },
  LIQUIDITY: {
    id: "Menjaga likuiditas / cash buffer",
    en: "Preserve liquidity / cash buffer",
  },
  DEBT_PAYOFF: {
    id: "Mempercepat pelunasan utang",
    en: "Accelerate debt payoff",
  },
  MAXIMIZE_SAVINGS: {
    id: "Memaksimalkan tabungan",
    en: "Maximize savings",
  },
  SPENDING_STABILITY: {
    id: "Menjaga kestabilan pengeluaran bulanan",
    en: "Keep monthly spending stable",
  },
  ROADMAP_FOCUS: {
    id: "Mengejar fokus roadmap / Tangga Ternak Uang",
    en: "Pursue roadmap / wealth-ladder focus",
  },
};

export function isDecisionPreference(v: unknown): v is DecisionPreference {
  return (
    typeof v === "string" &&
    (DECISION_PREFERENCES as readonly string[]).includes(v)
  );
}
