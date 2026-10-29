# Phase 5.2-C — Model Selection Decision

**Tanggal:** 28 Oktober 2026  
**Status:** Decided — **retain baseline**  
**Evidence:** `docs/ai-eval/phase5.2-benchmark-analysis-2026-10-28.md`  
**PRD gate:** phase5.2 §6.8 / §7

---

## Keputusan

| Peran | Model ID | Status |
|---|---|---|
| **Production default** | `nvidia/nemotron-3.5-lightning:free` | **Tetap** |
| Reasoning candidate | `nvidia/nemotron-3-ultra-550b-a55b:free` | Hold — full 30 belum; rate-limit free pool |
| Reasoning comparator | `xingchen-agi/xing4.0-29b-a4b:free` | Hold — sampel 3 + 429 frequent |
| Router feature flag | `AI_ROUTER_ENABLED` | **Tetap `false`** di production sampai full Ultra/Xing scorecard |

Tidak ada fallback berbayar. Tidak ada promosi model hanya karena nama/parameter lebih besar.

---

## Bukti singkat (promotion criteria)

| Kriteria PRD §6.8 | Lightning | Ultra | Xing |
|---|---|---|---|
| Full dataset quality run | 27/30 pass (2 CRIT harness/format) | 9/9 lalu stopped | 3/3 lalu stopped |
| Critical numeric invent (clear) | Tidak dominan | 0 pada sampel | 0 pada sampel |
| Klaim eksekusi pembayaran | Pass (oop) | n/a sampel kecil | n/a |
| Free ID verified | Ya | Ya | Ya |
| Reliability free-pool | Baik (0 provider fail / 30) | Buruk setelah ~9 req | Buruk |
| Rollback ke Lightning | N/A (sudah baseline) | — | — |

**Kesimpulan:** hanya Lightning yang memenuhi “dievaluasi pada dataset penuh + reliability cukup” hari ini. Ultra menarik untuk `financial_reasoning` **setelah** full 30 tanpa rate-limit storm.

---

## Konfigurasi yang disetujui

```bash
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
OPENROUTER_MAX_OUTPUT_TOKENS=1200
AI_REQUEST_TIMEOUT_MS=20000   # atau 60000 jika latency Lightning sering >20s
AI_ROUTER_ENABLED=false

# Jangan isi sampai 5.2-C re-run lulus:
# OPENROUTER_MODEL_FINANCIAL_REASONING=nvidia/nemotron-3-ultra-550b-a55b:free
```

Fallback gratis tetap dari `FREE_CHAT_MODEL_FALLBACKS` / `OPENROUTER_FALLBACK_MODELS` (hanya `:free`).

---

## Perbaikan ikut 5.2-C (reliability, bukan ganti model)

1. Provider: **tanpa** `reasoning.exclude` (cegah content kosong Lightning)  
2. Default `max_tokens` → **1200**  
3. System prompt: jawaban final ID, kutip angka JSON, tanpa thinking panjang  
4. Scorer: parafrase juta/ribu + strip thinking  

---

## Next

- **5.2-D** — Scenario Explainer di `/simulator`  
- Opsional: ulang `npm run ai:benchmark:live -- --models=nvidia/nemotron-3-ultra-550b-a55b:free` saat kuota pulih → baru pertimbangkan router task `financial_reasoning`

**Definition check:** Phase 5.2-C selesai dengan keputusan berbasis bukti untuk **retain Lightning**, bukan dengan memaksakan kandidat yang belum diverifikasi penuh.
