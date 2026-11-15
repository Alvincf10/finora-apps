import {
  EMERGENCY_PATTERNS,
  LADDER_STARTER_GOAL_NAME,
  nameMatches,
} from "@/lib/financial/wealth-ladder-math";

/** Minimal goal shape for Tangga Ternak priority picking. */
export type PriorityGoalCandidate = {
  _id: { toString(): string };
  name: string;
  currentAmount?: number | null;
  targetAmount?: number | null;
  goalType?: string | null;
};

export type PriorityGoalPick<T extends PriorityGoalCandidate> = {
  goal: T;
  reason: string;
};

export function goalGap(goal: PriorityGoalCandidate): number {
  return Math.max(
    0,
    (goal.targetAmount ?? 0) - (goal.currentAmount ?? 0)
  );
}

/** Active goals that still have room to fill. */
export function filterGoalsWithGap<T extends PriorityGoalCandidate>(
  goals: T[]
): T[] {
  return goals.filter((g) => goalGap(g) > 0);
}

/**
 * Tangga Ternak Uang priority: Basic tabungan → emergency → nearest gap.
 * Shared by Payday allocation and income save suggestions.
 */
export function pickPriorityGoal<T extends PriorityGoalCandidate>(
  pocketGoals: T[]
): PriorityGoalPick<T> | null {
  if (pocketGoals.length === 0) return null;

  const basic = pocketGoals.find(
    (g) =>
      g.goalType === "BASIC_SAVINGS" || g.name === LADDER_STARTER_GOAL_NAME
  );
  if (basic) {
    return {
      goal: basic,
      reason:
        "Tangga Ternak Uang step 1: isi Basic tabungan (nabung cash 10jt) dulu sebelum goal lain.",
    };
  }

  const emergency = pocketGoals.find(
    (g) =>
      g.goalType === "EMERGENCY_FUND" ||
      nameMatches(g.name, EMERGENCY_PATTERNS)
  );
  if (emergency) {
    return {
      goal: emergency,
      reason:
        "Basic tabungan sudah cukup — lanjut isi dana darurat (Tangga Ternak Uang).",
    };
  }

  const sorted = [...pocketGoals].sort(
    (a, b) => goalGap(a) - goalGap(b)
  );
  const nearest = sorted[0];
  return {
    goal: nearest,
    reason: `Sisa target paling kecil — selesaikan “${nearest.name}” dulu sebelum goal lain.`,
  };
}
