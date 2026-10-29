# Phase 5.2-B — Reasoning Benchmark Runner

**Status:** Implemented  
**Dataset:** `docs/ai-eval/reasoning-benchmark-v1.json` (30 cases · PRD §6.3)  
**Candidates:** `docs/ai-eval/verified-candidates-2026-10-28.json`  
**Audit:** `docs/phase5.2-a-audit.md`

---

## Apa yang diukur

| Metrik | Cara |
|---|---|
| Numeric integrity | Assertion deterministik (mention wajib / larangan invent angka) |
| Instruction compliance | Tolak klaim “sudah bayar/transfer” |
| Trade-off / uncertainty | Heuristik frasa (soft) |
| Latency / reliability | Hanya pada `--live` |
| Free-route compliance | Runner menolak model non-`:free` |

Skor otomatis **bukan** bukti kebenaran finansial penuh — kasus ambigu tetap perlu review manual (PRD §6.5).

---

## Perintah

```bash
# CI / lokal — mock answers, tidak memanggil OpenRouter
npm run ai:benchmark

# Regenerate dataset (setelah edit generator)
npm run ai:eval:dataset

# Live (manual, berkuota) — default 3 kandidat gratis terverifikasi
npm run ai:benchmark:live

# Live sempit (hemat kuota)
npx tsx --tsconfig tsconfig.json scripts/ai-benchmark.ts --live \
  --models=nvidia/nemotron-3.5-lightning:free \
  --limit=5 \
  --delay-ms=1200
```

Hasil tertulis ke `docs/ai-eval/results/benchmark-*.json` (folder di-ignore Git jika perlu — saat ini boleh di-commit sampel mock).

---

## Distribusi kasus (30)

| Kategori | Jumlah |
|---|---:|
| debt_vs_emergency | 6 |
| cashflow_liquidity | 5 |
| scenario_compare | 6 |
| budget_priority | 4 |
| roadmap_savings | 4 |
| incomplete_data | 3 |
| out_of_policy | 2 |

---

## Promotion gate → 5.2-C

Model kandidat boleh jadi default **hanya jika** laporan `--live`:

1. Tidak ada critical numeric / action-claim fail pada kasus wajib  
2. Pass rate ≥ baseline Lightning pada dataset yang sama  
3. Model ID + free status di-reverify hari itu  
4. Regression `npm run test -- src/lib/ai src/lib/financial` hijau  
5. Rollback ke Lightning sudah diuji (`OPENROUTER_MODEL=…lightning:free`)

Jika tidak ada pemenang: **tetap Lightning**; jangan aktifkan Decision Advisor (5.2-E).

---

## Next

- **5.2-C** — pilih model dari hasil live + tulis keputusan di docs  
- **5.2-D** — Scenario Explainer UI + opsional validator di explain path
