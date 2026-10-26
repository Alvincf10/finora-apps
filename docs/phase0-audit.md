# Phase 0 Audit — Finora 2.0 Baseline Gap Matrix

**Status:** Complete (awaiting approval before Phase 1 / schema changes)  
**Date:** 2026-10-24  
**Source PRD:** `prd/phase4.md`  
**Codebase:** `/root/.openclaw/finora-apps`

---

## 1. Executive verdict

Finora already has a usable **deterministic financial core** (ledger, pay-cycle, payday envelopes, wealth ladder, Phase 2 insights/simulator, alerts). It does **not** yet have a unified Financial Health engine, 30/60/90-day cash-flow forecast, Decision Lab with snapshots, or Action Center.

Largest risks before any redesign:

1. **Mixed-currency aggregation** in summary/dashboard/survival (IDR + EUR minor units summed).
2. **Duplicate metric definitions** (liquid cash, emergency coverage, cash flow, budget utilization).
3. **GET side effects** on `/api/insights` (mutates system goal + persists recommendations).
4. **Three overlapping recommendation engines** without stable issue keys.
5. **Almost no production-importing automated tests** for financial formulas.

**Recommendation:** Do not start UX consolidation or new models until Phase 1 unifies metrics + currency isolation, and P0 regression tests land.

---

## 2. Existing building blocks (reuse first)

| Area | Primary files | Reuse stance |
|---|---|---|
| Money precision | `src/lib/money.ts` | Keep; fix callers; zero-denominator → unavailable where needed |
| Pay cycle | `pay-cycle.ts`, `payday.ts` | Keep as single source of period boundaries |
| Ledger | `transactions.ts`, `balances.ts`, `credit-cards.ts` | Keep; add regression tests |
| Summary KPIs | `summary.ts` | Evolve into Financial Health service |
| Survival / buffer | `survival.ts`, `survival-math.ts`, `pay-cycle.ts` | Fold into liquidity helpers; do not fork |
| Wealth ladder | `wealth-ladder.ts`, `wealth-ladder-math.ts` | Evolve into Roadmap (FR-03); stop GET mutation |
| Phase 2 math | `phase2-math.ts`, `phase2-service.ts`, `phase2-types.ts` | Split: forecast vs insights vs what-if |
| Payday allocation | `payday-allocation.ts` + settle routes | Evolve for planned vs actual (FR-06) |
| Alerts | `alerts.ts` + local dismiss | Merge later into Action Center |
| Recommendations | `recommendations.ts` + `FinancialRecommendation` model | Reuse model; add issue key / provenance |
| Simulator | `/api/simulator`, `runWhatIf` | Stateless baseline for Decision Lab |
| Debt planner | `debt-repayment.ts` | Keep math; isolate from live Debt writes |
| Goal pacing | `goal-simulation.ts` | Wire into Roadmap timelines later |
| Weekly review | `weekly-review.ts` | Keep; align period semantics later |

**Models (14):** User, Account, Transaction, Category, Budget, Debt, DebtPayment, SavingsGoal, FixedCost, PaydayAllocation, FinancialRecommendation, MonthlySnapshot, WhatsAppSession, WhatsAppOutbound.

**Missing models (PRD §9.3):** `Scenario`, `RoadmapEvaluation`.

---

## 3. Requirement → existing → gap → proposed change

### FR-01 Financial Health Engine — P0

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| Canonical metrics set | Split across `summary`, dashboard, survival, phase2, payday | No single contract / metadata | New `metrics/financial-health.ts` orchestrating existing helpers; deprecate duplicate aggregations gradually |
| Metric definition + source + period | Implicit | No provenance object | Return `{ value, unit, period, sources[], assumptions[], quality }` |
| Pay cycle / calendar / custom | Pay cycle strong; budget calendar; weekly calendar | No first-class period mode | Add period selector; keep pay-cycle default |
| Net worth | `summary.ts` assets − liabilities | Mixed currency; OTHER accounts as assets; null→0 silent | Currency-scoped aggregates; separate unconverted buckets; quality flags |
| Savings rate | `percent(savings, income)` → **0 if income 0** | PRD: unavailable | Return `null` / `UNAVAILABLE` when income ≤ 0 |
| Liquid assets | 3+ definitions (summary / ladder / survival / dashboard pockets) | Inconsistent | One `eligibleLiquidAssets(rules)` shared by health, ladder, survival |
| Emergency coverage | `phase2-math` + `wealth-ladder-math` | Duplicate; name-based goal detect; allocated cash not excluded | Single coverage fn; prefer `goalType`; document reserve eligibility |
| Budget utilization | Per-category OK; overall = unweighted mean of % | Distorts totals | Prefer `sum(spent)/sum(budget)` with currency scope |
| Available / allocated cash | Payday remaining + dashboard pockets | Not FR-01 canonical | Derive from active PaydayAllocation + balances; document definitions |
| Data quality flags | Partial (`INSUFFICIENT_DATA`, forecast confidence) | Not on health metrics | Add flags: mixedCurrency, missingBalance, shortHistory, uncategorized |

### FR-02 Cash Flow Forecast — P0

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| 30/60/90 day horizon | One-cycle aggregate in `forecastMonthlyCashflow` | No timeline | New `forecast/cash-flow-forecast.ts` event timeline |
| Scheduled vs historical vs assumed income | `max(salary, history, current)` often | Salary treated as certain | Explicit income sources; never silent max |
| Risk periods + obligation lineage | Ending balance only | No shortfall windows | Project dated events (fixed costs, debts, payday) |
| Use active PaydayAllocation | Not consumed | Missing | Optional input from ACTIVE allocation |
| No double-count debt | History expenses + separate debt payment | Likely double-count | Document expense basis; exclude debt-linked txs when projecting debt |
| Actual vs projected | Absent | Missing | Compare to cycle actuals when available |
| Read-only | Yes | OK | Keep |

### FR-03 Financial Roadmap — P1

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| 7 steps + sequential gate | Implemented | Status vocab ≠ PRD (`FOCUS`/`LOCKED`/`UNKNOWN`) | Map or rename carefully with UI aliases |
| Explicit criteria / formula / sources | Reasons + progress | Not structured fields | Extend step result shape |
| `NOT_APPLICABLE` prefs | Math supports education only | **Not persisted; API never passes prefs** | User prefs field or settings; wire API |
| Timeline estimates | Absent | Missing | Reuse goal/debt simulation assumptions |
| No fake completion | Step 5 = goal exists; name inference for debt/invest | Weak evidence | Prefer typed `goalType` / `debt.kind` |
| Evaluation side effects | `ensureStarterCashGoal` on evaluate | GET mutates goals | Separate ensure endpoint / first-run setup |
| Persisted evaluation | None | No `RoadmapEvaluation` | Optional later for reproducibility; not blocking P1 UI |

### FR-04 Decision Lab — P1

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| Baseline snapshot | Live period only | No immutable snapshot | Add `Scenario` model when approved |
| Multiple alternatives + compare | Single in-memory what-if | No comparison view | Extend UI + store scenarios |
| Metrics (EF, goals, shortfall) | Partial cash flow / debt months | Incomplete | Expand `runWhatIf` outputs |
| No silent execution | Simulator APIs read-only | Debts page tenor “sim” PATCHes Debt | Preview then confirm |
| Currency | Client currency not always sent | Cross-currency bug risk | Require currency on POST |
| Goal simulation | Exists on goals page | Not in Decision Lab | Integrate later |

### FR-05 Action Center — P2

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| Unified actions | 3 engines: `alerts`, Phase2 insights, legacy `recommendations` | Duplication | Registry + single query API |
| Stable issue key | Alert IDs deterministic; recommendations re-insert | Dupes on refresh | `issueKey` unique index; upsert |
| Lifecycle | Model has NEW…EXPIRED | EXPIRED unused; VIEWED unused; ACCEPTED still shown | Enforce transitions + expiry job |
| Priority explainable | Phase2 HIGH/MED/LOW | Lexical Mongo sort; no component score | Documented rank + sort by severity then deadline |
| Dedup across alerts/insights | None | Same budget/debt issues thrice | Shared issue keys |
| Alert dismiss | localStorage 45d | Not cross-device | Optional server dismiss later |

### FR-06 Execution Plan — P2

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| Planned vs actual | `envelope.amount` overwritten on settle | Plan lost | Separate `plannedAmount` / `actualAmount` |
| Allocated ≠ free cash | UI remaining exists | Not enforced on balances | Display-level first; no silent ledger reserve |
| Lifecycle DRAFT/ACTIVE/COMPLETED | Schema only | No state machine; settle forces ACTIVE | Explicit transitions |
| Atomic settle | Partial; fixed-cost sync best-effort | Split-brain risk | Widen transactions; idempotency keys |
| Reallocation preview | Direct POST overwrite | Trace erased (`paidAt` dropped) | Preserve execution fields; preview diff |
| CC payment double expense | Possible | Analytics inflation | Document + fix accounting path |

### FR-07 / FR-08 UX + Review — P2

| Requirement | Existing | Gap | Proposed change |
|---|---|---|---|
| Command Center | Dashboard + scattered modules | Not unified | After P0–P1 engines stable |
| Planned vs actual in review | Weekly review calendar-based | Period mismatch with pay cycle | Align after metrics SSOT |

---

## 4. Open product decisions (block final formulas)

From PRD §17 — coding agent must **not** invent answers:

1. Sequential roadmap vs flexible applicability (beyond education).
2. Final definitions: available / allocated / emergency reserve.
3. Forecast: fixed assumptions vs historical average vs both.
4. Priority between debt payoff, cash buffer, savings goals.
5. User-editable priority rules?
6. Scenario retention period.
7. Command Center metric density.

Until decided, implement **documented defaults** behind named constants and quality flags.

---

## 5. Change risks

| Risk | Severity | Mitigation |
|---|---|---|
| Unifying metrics changes dashboard numbers users trust | High | Snapshot old vs new fixtures; feature-flag new health API |
| Currency isolation changes net worth for multi-currency users | High | Show per-currency first; never silent FX |
| Stopping insights GET mutation may break onboarding of starter goal | Medium | Explicit setup call / migration once |
| Recommendation upsert changes UX of dismiss/accept | Medium | Preserve ACCEPTED/DISMISSED by issueKey |
| Payday plannedAmount schema change | Medium | Backward-compatible: treat missing planned = amount |
| Test harness introduction | Low | Prefer Vitest importing production modules over mirrored smoke scripts |

---

## 6. Proposed implementation order

### Phase 0b — Regression harness (before Phase 1 code)

1. Add Vitest (or extend tsx smoke that **imports** production modules).
2. Port/fix: money, pay-cycle edges, transfer neutrality, wealth-ladder gates, emergency coverage, savings rate zero-income.
3. Add fixtures for mixed-currency (must not sum).
4. Document known buggy-but-current behaviors as “baseline snapshot” tests where needed.

### Phase 1 — Financial Health (FR-01)

1. `financial-health.ts` + types with quality flags.
2. Currency-scoped aggregations in `summary` / callers.
3. Fix savings-rate unavailable.
4. Single liquid-assets + emergency-coverage helpers.
5. Wire `/api/financial-summary` (and later dashboard) to new service.
6. Do **not** move UI Command Center yet.

### Phase 2 — Forecast (FR-02)

1. Event-based projection module.
2. Income source tagging.
3. Shortfall detection + lineage.
4. Tests for double-count invariants.

### Phase 3 — Roadmap (FR-03)

1. Stop evaluate-time goal mutation.
2. Persist applicability prefs.
3. Structured step provenance.
4. Prefer typed goal/debt fields over name regex.

### Phase 4 — Decision Lab (FR-04)

1. Approve `Scenario` schema.
2. Snapshot baseline + compare view.
3. Isolate debt tenor preview from PATCH.

### Phase 5 — Action Center (FR-05)

1. Issue key + upsert on `FinancialRecommendation`.
2. Registry merging alert types.
3. Lifecycle + expiry.

### Phase 6 — Execution + UX (FR-06/07/08)

1. Payday planned vs actual fields.
2. Settlement atomicity / idempotency.
3. Command Center composition.

---

## 7. Test coverage priority (Phase 0b → 1)

**P0 now**

- Money minor units; `percent` / unavailable savings rate
- Transfer does not affect income/expense/net worth (same currency)
- Pay-cycle weekend + month/year edges
- Mixed currency never summed in health metrics
- Wealth ladder sequential gate + NOT_APPLICABLE skip
- Emergency coverage denominator fallbacks
- Forecast / what-if do not write ledger

**P1 next**

- Credit-card purchase + statement payment expense semantics
- Payday settle idempotency
- Recommendation refresh vs ACCEPTED/DISMISSED
- User isolation on APIs

---

## 8. File change map (Phase 1 tentative)

| Action | Path |
|---|---|
| Add | `src/lib/financial/metrics/financial-health.ts` |
| Add | `src/lib/financial/metrics/types.ts` |
| Add | `src/lib/financial/shared/liquid-assets.ts` |
| Add | `src/lib/financial/shared/emergency-coverage.ts` |
| Edit | `src/lib/financial/summary.ts` (delegate / currency scope) |
| Edit | `src/lib/money.ts` or callers (unavailable rate) |
| Edit | `src/app/api/financial-summary/route.ts` |
| Add tests | `src/lib/financial/__tests__/*` (or `tests/financial/*`) |
| Avoid moving | Entire tree into PRD sample layout unless needed |

---

## 9. Exit criteria checklist

- [x] Financial engine + models audited
- [x] Duplicate formulas identified
- [x] Pay-cycle + currency semantics audited
- [x] Wealth ladder + simulator audited
- [x] Alerts / recommendations / lifecycle audited
- [x] Gap matrix documented (this file)
- [x] Regression tests for valid existing behavior (Phase 0b — Vitest suite)
- [x] Documented defaults for §17.2 liquid/emergency reserve (goal → liquid fallback)
- [x] Phase 1 started: currency-scoped summary + Financial Health API
- [x] Phase 2: horizon cash-flow forecast (30/60/90) + shortfall lineage API
- [x] Phase 3: roadmap read-only evaluate, applicability prefs, provenance, typed goals
- [x] Phase 4: Decision Lab scenarios + comparison + debt tenor preview isolation
- [x] Phase 5: Action Center issue keys, upsert, cross-engine dedup
- [x] Phase 6: Command Center composition + dashboard UX + nav rename
- [ ] Product answers for remaining §17 open decisions (documented defaults in use)

---

## 10. Approval ask

Please confirm:

1. **Proceed with Phase 0b** — Vitest + import-based regression tests for money / pay-cycle / ladder / currency isolation?
2. **Proceed with Phase 1** — Financial Health SSOT + currency-scoped metrics (no UX Command Center yet)?
3. Any interim product defaults for open decisions §17 (especially liquid/emergency reserve definitions)?
