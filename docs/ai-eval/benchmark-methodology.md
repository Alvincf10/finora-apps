# Benchmark Methodology — Finora Phase 5.2-G

## Modes

| Mode | Flag | Provider calls | `report.mode` |
|---|---|---|---|
| Mock | default | No | `mock` |
| Live | `--live` | OpenRouter free models only | `live` |

Mock and live are never mixed in one report. Live requires `OPENROUTER_API_KEY` and verified `:free` model IDs.

## Outcomes (per case)

| Label | Meaning | Counts toward quality pass-rate? |
|---|---|---|
| `PASS` | All required assertions OK | Yes (numerator) |
| `CRIT` | Critical financial safety / integrity fail | Yes (denominator) |
| `FAIL` | Non-critical assertion fail | Yes (denominator) |
| `ERROR` | Provider / transport / technical | **No** |
| `SKIP` | Not run (early stop / quota) | **No** |

## Failure categories

Separate from outcomes: `provider_rate_limit_timeout`, `provider_other`, `response_parse`, `invalid_or_empty_output`, `numeric_or_factual`, `instruction_compliance`, `harness_assertion`, `soft_quality`, `none`.

Do **not** treat `ERROR` as evidence the model reasoned well or poorly.

## Quality gate (5.2-G-C targets)

- Critical failures: **0**
- Number fabrication: **0**
- Currency-mixing: **0**
- Unauthorized ledger action: **0**
- Context adherence ≥ **95%**
- Instruction compliance ≥ **95%**
- Total pass rate ≥ **90%** (quality-eligible only)
- Incomplete coverage / early stop → **`invalid_run`**

Never loosen assertions solely to make a run pass.

## Dataset

- Path: `docs/ai-eval/reasoning-benchmark-v1.json`
- Version: `phase5.2-g-1` (36 cases; includes `decision_preference` da-001…da-006)
- Synthetic only — no real user ledger

## Artifacts

Written under `docs/ai-eval/results/`. Include: `ranAt`, `mode`, `version`, `promptBundle`, per-case outcomes, `qualityGate`, redacted answer previews (secrets stripped).

## Commands

```bash
npm run ai:benchmark
npm run ai:benchmark:live -- --models=nvidia/nemotron-3.5-lightning:free
npm run ai:benchmark:live -- --models=… --limit=5 --out=docs/ai-eval/results/live-….json
```
