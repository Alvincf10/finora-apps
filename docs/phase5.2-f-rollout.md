# Phase 5.2-F — Controlled Rollout

**Status:** Implemented  
**Baseline model:** `nvidia/nemotron-3.5-lightning:free` (5.2-C retain)  
**Router:** `AI_ROUTER_ENABLED=false` until Ultra/Xing full scorecard

---

## Flags

| Env | Default | Effect |
|---|---|---|
| `AI_SCENARIO_EXPLAINER_ENABLED` | `true` | Gate `contextType=scenario` + Decision Lab UI |
| `AI_DECISION_ADVISOR_ENABLED` | `true` | Gate `contextType=decision_advisor` + Insights UI |
| `AI_ROUTER_ENABLED` | `false` | Keep Phase 5 single-model path |

Status for UI: `GET /api/ai/status` (auth required, no secrets).

---

## Monitoring

```bash
npm run ai:usage:summary
# or: npm run ai:usage:summary -- /path/to/ledger.jsonl
```

Watch: `contextType` counts, ok/err, latency p50/p95, `fallbackUsed`, error codes.  
Log path: `FINORA_AI_USAGE_LOG_PATH` / `FINORA_COST_LEDGER_PATH` (metadata only).

---

## Rollback

1. Set flag(s) to `false` in env  
2. `systemctl restart finora`  
3. Financial Explainer (`general_summary`, `action_center`, dll.) tetap jalan  
4. Ledger / engine tidak terpengaruh  

Model baseline: pastikan `OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free`.

---

## Acceptance (PRD §14 Tahap E / §15)

- [x] Feature flags for Scenario Explainer + Decision Advisor  
- [x] Baseline model retained; router off  
- [x] Usage monitoring script (latency / errors / fallback)  
- [x] Documented rollback  
- [x] No paid fallback; no ledger write from AI  

**Phase 5.2 complete** for production MVP under free-only Lightning + optional advisor/explainer gates.
