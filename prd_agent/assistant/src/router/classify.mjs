/**
 * Lightweight intent classification for task routing (no LLM).
 */

const FINANCE_DETERMINISTIC = [
  { task: "saldo", re: /^(?:\/)?(?:saldo|balance)\b|^(?:cek\s+)?saldo\b/i },
  {
    task: "pengeluaran",
    re: /\b(?:total\s+)?pengeluaran\b|\b(?:total\s+)?pemasukan\b|\bringkas(?:an)?\b|\brekap\b|\btotal\b(?!\s*\d)/i,
  },
  { task: "budget", re: /^(?:\/)?budget\b|^anggaran\b/i },
  { task: "utang", re: /^(?:\/)?utang\b|^debt\b/i },
];

const PLANNER = [
  { task: "reminder", re: /^(?:add task|done|today|daily review)\b/i },
];

const DISCUSSION = [
  "diskusi",
  "brainstorm",
  "bahas",
  "berdebat",
  "discuss",
];

/**
 * @param {string} text
 * @returns {{ task_type: string, path: 'deterministic_finora'|'deterministic_planner'|'llm', model_tier: 'none'|'economy'|'strong', llm: boolean }}
 */
export function classifyTask(text) {
  const t = (text ?? "").trim();
  if (!t) {
    return { task_type: "empty", path: "llm", model_tier: "economy", llm: true };
  }

  for (const rule of FINANCE_DETERMINISTIC) {
    if (rule.re.test(t)) {
      return {
        task_type: rule.task,
        path: "deterministic_finora",
        model_tier: "none",
        llm: false,
      };
    }
  }

  for (const rule of PLANNER) {
    if (rule.re.test(t)) {
      return {
        task_type: rule.task,
        path: "deterministic_planner",
        model_tier: "none",
        llm: false,
      };
    }
  }

  const lower = t.toLowerCase();
  if (DISCUSSION.some((w) => lower.includes(w))) {
    return {
      task_type: "analysis_complex",
      path: "llm",
      model_tier: "strong",
      llm: true,
    };
  }

  return {
    task_type: "chat",
    path: "llm",
    model_tier: "economy",
    llm: true,
  };
}
