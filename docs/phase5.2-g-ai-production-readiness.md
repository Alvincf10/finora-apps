# Phase 5.2-G — AI Production Readiness & Quality Hardening

**Status:** Implemented (hardening + evidence harness)  
**Baseline model:** `nvidia/nemotron-3.5-lightning:free`  
**Router:** `AI_ROUTER_ENABLED=false`  
**Dataset:** `phase5.2-g-1` (36 cases)

---

## Delivered

| ID | Item | Evidence |
|---|---|---|
| G-A | Live/mock separation, PASS/CRIT/FAIL/ERROR/SKIP, artifacts + redaction | `scripts/ai-benchmark.ts`, `src/lib/ai/eval/outcome.ts` |
| G-B | Dataset audit + DA preference cases | `docs/ai-eval/reasoning-benchmark-v1.json` v`phase5.2-g-1` |
| G-C | Quality gate evaluator | `src/lib/ai/eval/quality-gate.ts` |
| G-D | Feature-flag matrix unit tests + status defaults | `feature-flags.matrix.test.ts`, `/api/ai/status` |
| G-E | Decision Advisor scenarios da-001…da-006 | dataset + preference tests |
| G-F | Usage summary: cost/tokens `unavailable` (not fake 0) | `scripts/ai-usage-summary.ts` |

Docs: `docs/ai-eval/benchmark-methodology.md`, this file, results under `docs/ai-eval/results/`.

---

## Mock gate (CI harness)

```text
npm run ai:benchmark -- --models=nvidia/nemotron-3.5-lightning:free \
  --out=docs/ai-eval/results/mock-phase5.2-g-1.json
→ PASS=36 · qualityGate=pass · mode=mock
```

Mock proves scorer/assertions/fixtures — **not** live model quality.

---

## Feature flags (server-side)

| Scenario | Advisor | Expected |
|---|---|---|
| OFF/OFF | explain `scenario` & `decision_advisor` → 503 `AI_NOT_CONFIGURED` |
| ON/OFF | scenario OK; decision_advisor 503 |
| OFF/ON | inverse |
| ON/ON (default if unset) | both OK |

UI reads `/api/ai/status` but **API gate is authoritative**.

---

## Rollback

1. `AI_SCENARIO_EXPLAINER_ENABLED=false` and/or `AI_DECISION_ADVISOR_ENABLED=false`
2. Restart `finora.service`
3. Confirm `/api/ai/status` + direct `POST /api/ai/explain`
4. Do **not** auto-enable router or paid fallback

---

## Go / No-Go (production model)

| Option | When |
|---|---|
| **GO** | Full live Lightning run meets G-C with 0 CRIT, complete coverage |
| **CONDITIONAL GO** | Explainer OK; keep Advisor OFF if DA live CRIT |
| **NO-GO / retain** | Incomplete live evidence or CRIT remains |

**Current decision: CONDITIONAL GO (retain baseline).**  
- Production stays on Lightning free; router off.  
- Scenario Explainer + Decision Advisor flags default ON (rollback via env).  
- **No model promotion** until a complete live `phase5.2-g-1` artifact meets the gate.  
- Live smoke 2026-10-28 (3 cases): all `ERROR` (rate-limit) → `invalid_run` — harness correct; quality not scored.  
- Prior Lightning live runs (5.2-B/C) are historical; re-run full live against g-1 when quota allows.

---

## Definition of Done checklist

- [x] Live vs mock explicitly separated in artifacts  
- [x] Provider / parsing / reasoning outcomes distinguished  
- [x] Dataset audited + versioned (`phase5.2-g-1`, ≥30 cases)  
- [x] Quality gate coded (not loosened)  
- [x] Flag matrix tested (unit)  
- [x] API rejects disabled features  
- [x] DA critical scenarios in dataset  
- [x] Usage summary does not fake $0 cost  
- [x] Status API has no secrets  
- [x] Rollback documented  
- [ ] Full live Lightning g-1 promotion run (operator; not auto-promoted here)
