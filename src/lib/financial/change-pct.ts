import { percent } from "@/lib/money";

/** Cap displayed % so “prev = 0” never shows millions. */
const CHANGE_PCT_CAP = 999;

/** % change vs previous; null when no baseline (prev ≤ 0). Capped ±999. */
export function changePercent(
  current: number,
  previous: number
): number | null {
  if (previous <= 0) return null;
  const raw = percent(current - previous, previous);
  return Math.max(-CHANGE_PCT_CAP, Math.min(CHANGE_PCT_CAP, Math.round(raw)));
}

/** Human label: "+12%", "-5%", or "baru". */
export function formatChangePct(pct: number | null): string {
  if (pct == null) return "baru";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
