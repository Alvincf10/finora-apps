# Benchmark Results Index

## Latest harness proof (mock)

| Field | Value |
|---|---|
| Artifact | `docs/ai-eval/results/mock-phase5.2-g-1.json` |
| Dataset | `phase5.2-g-1` (36 cases) |
| Mode | **mock** (no provider) |
| Outcomes | PASS=36, CRIT=0, FAIL=0, ERROR=0, SKIP=0 |
| qualityGate | `pass` |
| Decision | Harness/assertions OK — **not** a live model promotion |

## Live smoke (5.2-G harness verification)

| Field | Value |
|---|---|
| Artifact | `docs/ai-eval/results/live-lightning-g1-smoke-2026-10-28.json` |
| Mode | **live** (OpenRouter) |
| Cases | 3 (limit) |
| Outcomes | ERROR=3 (provider rate-limit/timeout) |
| qualityGate | `invalid_run` |
| Note | Proves live path + ERROR ≠ quality fail. Not a promotion run. |

## Historical live (pre–5.2-G dataset)

See `docs/ai-eval/phase5.2-benchmark-analysis-2026-10-28.md` and `results/live-lightning-2026-10-28.json`.  
Those runs used earlier scorer/prompt fixes; they do **not** automatically clear the g-1 gate.

## Promotion rule

A candidate is promotion-eligible only if a **complete live** artifact on the same dataset + prompt bundle meets `evaluateQualityGate` → `decision: "pass"` with 0 CRIT and no early stop.
