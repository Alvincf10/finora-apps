/**
 * Single source of truth for WhatsAppOutbound.kind.
 * Producers (Next.js) and the long-lived Vira worker must agree —
 * a missing enum value + document.save() left status=pending and
 * re-sent the same CC limit warning every poll (~2s) → WA spam.
 */
export const WHATSAPP_OUTBOUND_KINDS = [
  "WEEKLY_REPORT",
  "FIXED_COST_DUE",
  "BUDGET_OVERFLOW",
  "BUDGET_WARNING",
  "CC_LIMIT_OVERFLOW",
  "CC_LIMIT_WARNING",
  "MANUAL",
] as const;

export type WhatsAppOutboundKind = (typeof WHATSAPP_OUTBOUND_KINDS)[number];

/** Alert kinds written by budget / CC enqueue paths. */
export const WHATSAPP_ALERT_KINDS = [
  "BUDGET_OVERFLOW",
  "BUDGET_WARNING",
  "CC_LIMIT_OVERFLOW",
  "CC_LIMIT_WARNING",
] as const satisfies readonly WhatsAppOutboundKind[];

export type WhatsAppAlertKind = (typeof WHATSAPP_ALERT_KINDS)[number];
