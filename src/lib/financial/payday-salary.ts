/**
 * Payslip salary is typed in by the user. Never auto-fill from Settings.
 * Fresh / reset → 0; only a saved allocation keeps the entered amount.
 */
export function resolveManualCycleSalary(
  saved: { salary?: number | null } | null | undefined,
  useSaved: boolean
): number {
  if (useSaved && saved?.salary != null) return Math.max(0, saved.salary);
  return 0;
}
