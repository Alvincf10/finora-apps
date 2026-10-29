# Phase 5.2-A — Audit & Baseline (Reasoning Benchmark / Decision Advisor)

**Tanggal:** 28 Oktober 2026  
**Repo:** `/root/.openclaw/finora-apps`  
**PRD:** `prd/phase5.2.md`  
**Dependensi:** Phase 5 Explainer · Phase 5.1 Router (`docs/phase5.1-a-audit.md`)  
**Status:** Complete — siap **5.2-B** (benchmark runner + dataset 30)  
**Larangan audit:** tidak ada refactor besar pada tahap ini.

---

## 1. Ringkasan eksekutif

Fondasi AI Finora **sudah cukup** untuk mulai benchmark reasoning:

| Kapabilitas | Status |
|---|---|
| `POST /api/ai/explain` + Zod + auth + rate limit | Live |
| Context builder 6 `contextType` dari financial engine | Live |
| Free Model Router (`AI_ROUTER_ENABLED`, default **off**) | Implemented (5.1-B) |
| Scenario model + Decision Lab engine | Live |
| Scenario Explainer UI di `/simulator` | **Belum** |
| Multi-scenario `scenarioIds[]` | **Belum** (hanya `scenarioId`) |
| Deterministic response validator (PRD §10) | **Belum** |
| Decision Advisor format 7 bagian | **Belum** |
| Dataset ≥30 kasus reasoning | **12** case di baseline 5.1-A |
| Model ID Ultra / Xing / Lightning diverifikasi katalog | **Ya** (lihat §5) |

**Baseline produksi saat ini:** `nvidia/nemotron-3.5-lightning:free`  
**Jangan promote Ultra/Xing ke produksi** sebelum 5.2-B/C lulus promotion criteria.

---

## 2. Inventaris Phase 5 + 5.1 (aktual)

### 2.1 Stack file

| Area | Path | Catatan |
|---|---|---|
| Explain API | `src/app/api/ai/explain/route.ts` | Router jika flag on; else Phase 5 path |
| Legacy chat | `src/app/api/ai/chat/route.ts` | `general_summary` |
| Provider | `src/lib/ai/provider.ts` | `generateText` cascade · `generateTextOnModel` single |
| Router | `src/lib/ai/model-router.ts` | 1 + `AI_MAX_RETRIES` free fallback |
| Registry | `src/lib/ai/model-registry.ts` | Tolak non-`:free` / non-allowlist |
| Task map | `src/lib/ai/task-types.ts` | context → task |
| Guard | `src/lib/ai/model-guard.ts` | Block content-safety |
| Context | `src/lib/ai/context-builder.ts` | Engine-sourced payloads |
| UI | `src/components/ai-explainer.tsx` | Dashboard `general_summary`, Insights `action_center` |
| Usage log | `src/lib/ai/usage-log.ts` | Metadata only |

### 2.2 Router — sudah diimplementasikan, belum diaktifkan produksi

- `AI_ROUTER_ENABLED` default `false` → jalur Phase 5 utuh.  
- Env per task + `OPENROUTER_FALLBACK_MODELS` (CSV `:free` saja).  
- Response boleh berisi `metadata` opsional (`taskType`, `fallbackUsed`, `attempts`) — UI lama mengabaikannya.

### 2.3 Kontrak yang **tidak boleh rusak**

**Request explain (Zod):**

```ts
{
  question: string; // 1–1000
  contextType: financial_health | cash_flow_forecast | scenario |
                action_center | roadmap | general_summary;
  contextRef?: {
    periodDays?: 30 | 60 | 90;
    scenarioId?: string; // tunggal — bukan scenarioIds[]
    year?: number;
    month?: number;
  };
}
```

**Success fields yang dipakai UI:** `explanation`, `model?`, `disclaimer?`  
Tambahan opsional OK; rename/hapus field di atas = breaking.

**Errors aman:** `AI_NOT_CONFIGURED`, `RATE_LIMITED`, `INSUFFICIENT_CONTEXT`, `AI_TIMEOUT`, `AI_PROVIDER_UNAVAILABLE`, `AI_RESPONSE_INVALID`.

**Rate limit baseline:** 3/menit · 20/hari (env override).

### 2.4 Context builder ↔ task type

| contextType | Engine source | taskType (5.1) | UI sekarang |
|---|---|---|---|
| `financial_health` | `getFinancialHealth` | `financial_explainer` | — |
| `cash_flow_forecast` | `getHorizonCashFlowForecast` | `financial_explainer` | — |
| `scenario` | `getScenario` (ownership check) | `financial_reasoning` | — (siap API) |
| `action_center` | `getActionCenter` | `action_advisor` | Insights |
| `roadmap` | `evaluateWealthLadder` | `financial_explainer` | — |
| `general_summary` | `getCommandCenter` | `general_explainer` | Dashboard |

`simple_summary` hanya via opt-in eksplisit — belum ada endpoint khusus.

---

## 3. Decision Lab / Scenario — apa yang bisa dipakai Advisor

### 3.1 Persistensi

`src/models/Scenario.ts`: `baselineSnapshot` (immutable), `assumptions`, `results`, `currency`, `rulesVersion`, `userId`.

### 3.2 Tipe evaluasi engine

`ScenarioEvaluation` (`decision/types.ts`) menyediakan:

- `cashFlow`, `endingBalance`, `debtPayoffMonths`, `emergencyCoverageMonths`, `cashShortfall`
- `deltas.*` vs baseline  
- `tradeOffs[]`, `positives[]`, `unavailable[]`, `assumptions[]`

Ini **cukup** untuk Scenario Explainer tanpa mengirim ledger transaksi penuh.

### 3.3 Gap API untuk perbandingan multi-skenario (PRD §11)

| PRD usulan | Aktual | Implikasi 5.2-D |
|---|---|---|
| `contextRef.scenarioIds: string[]` | Hanya `scenarioId` | Perlu perluasan Zod + context-builder (load N skenario, ownership tiap id, currency/periode konsisten) |
| Bandingkan A vs B di satu explain | Satu skenario + baseline di dalamnya | Bisa MVP dengan 1 skenario dulu; multi-id = P1 |

Service: `listScenarios`, `getScenario` ada; **belum** ada helper “load many + compare payload” untuk AI.

### 3.4 UI Decision Lab

`/simulator` **tidak** memasang `AiExplainer`.  
5.2-D harus menambah CTA “Jelaskan dengan AI” setelah hasil simulasi tersedia (+ `contextType: "scenario"`, `scenarioId`).

---

## 4. Baseline kualitas & dataset

### 4.1 Dataset saat ini

File: `docs/ai-eval/baseline-dataset.json` (v `phase5.1-a-1`)

- **12** kasus sintetis  
- Rubrik: factual / numeric / context / recommendation / ID / refuse-write  
- **Belum** memenuhi target PRD 5.2 (§6.3 = **30** kasus)  

Kekurangan distribusi vs target:

| Kategori PRD | Target | Ada ≈ |
|---|---:|---:|
| Debt vs emergency | 6 | 1 |
| Cash flow negatif / likuiditas | 5 | 2 |
| Bandingkan ≥2 skenario | 6 | 1 (single) |
| Budget / prioritas belanja | 4 | 0 |
| Roadmap / tabungan | 4 | 1 |
| Data tidak lengkap | 3 | 2 |
| Out-of-policy actions | 2 | 1 |
| **Total** | **30** | **12** |

### 4.2 Baseline model quality (pra-benchmark)

Belum ada skor formal Ultra/Xing. Yang diketahui operasional:

- Lightning dipakai produksi lokal + pin default di `config.ts`.  
- Guard menolak output “User Safety: *”.  
- Fallback hard-coded: Lightning → Nano Omni → Gemma free.  
- Unit AI + financial: **92 tests passed** (28 Okt 2026).

**Baseline skor 5.2-B:** jalankan 30 kasus × Lightning dulu sebagai reference, baru Ultra & Xing pada input identik.

### 4.3 Validator deterministik (PRD §10) — gap

Belum ada modul yang:

- Mengekstrak klaim nominal dari jawaban AI  
- Membandingkan ke set angka yang diizinkan dari konteks  
- Menolak / memperingatkan klaim “sudah bayar / transfer”  

Ini **blocker soft** untuk Decision Advisor production; boleh di-scaffold di 5.2-B (assertion harness) lalu di-wire ke explain path di 5.2-D/E.

---

## 5. Model kandidat — verifikasi katalog OpenRouter

Sumber: `GET /api/v1/models` (28 Okt 2026, 464 models).  
Detail: [`docs/ai-eval/verified-candidates-2026-10-28.json`](./ai-eval/verified-candidates-2026-10-28.json)

| Peran | Display | **Model ID API** | Free ($0/$0) |
|---|---|---|---|
| Baseline / efisiensi | Nemotron 3.5 Lightning | `nvidia/nemotron-3.5-lightning:free` | Ya |
| Reasoning utama (kandidat) | Nemotron 3 Ultra | `nvidia/nemotron-3-ultra-550b-a55b:free` | Ya |
| Reasoning pembanding | Xing4.0 29B A4B | `xingchen-agi/xing4.0-29b-a4b:free` | Ya |
| Ringkas opsional | LFM2.5-2.6B | `liquid/lfm-2.5-2.6b:free` | Ya |
| Fallback existing | Nano Omni | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | Ya |
| **Jangan pakai** | Content Safety | `nvidia/nemotron-3.5-content-safety:free` | Ya (classifier) |

**Catatan:** status gratis bisa berubah — re-verify sebelum 5.2-C promotion. `$0.00` historis ≠ jaminan ketersediaan.

---

## 6. Regression inventory

```bash
npm run test -- src/lib/ai src/lib/financial
# 16 files · 92 tests · passed (2026-10-28)
```

| Suite | Fokus |
|---|---|
| `src/lib/ai/*` | provider, router, registry, guard, config, context schema |
| `metrics` / `forecast` / `decision` / `action-center` / `wealth-ladder` / `pay-cycle` / `balances` | engine Finora 2.0 |

CI harus tetap **mock provider** — jangan wajibkan OpenRouter live.

---

## 7. Gap list sebelum / untuk 5.2-B+

### Wajib sebelum promote model (5.2-B/C)

1. Perluas dataset → **≥30** kasus sesuai distribusi PRD §6.3  
2. Benchmark runner (script/job manual): input sama × model kandidat; catat latency/error/tokens  
3. Assertion numeric integrity deterministic  
4. Laporan skor + keputusan promote / remain-on-Lightning  
5. Re-verify free pricing pada hari promotion  

### Untuk Scenario Explainer (5.2-D)

6. `AiExplainer` di `/simulator` dengan `scenarioId`  
7. Opsional: `scenarioIds[]` + compare payload (currency/periode guard)  
8. Wire validator klaim sebelum response ke UI (atau warning banner)  

### Untuk Decision Advisor (5.2-E)

9. Prompt/struktur 7 bagian (rekomendasi → batasan)  
10. Preferensi pengguna eksplisit (jika belum ada di settings — jangan asumsikan)  
11. Feature flag terpisah dari router jika perlu (`AI_DECISION_ADVISOR_ENABLED`)  

### Non-goals tetap

- Tidak ada write ledger dari AI  
- Tidak multi-model critique setiap request  
- Tidak fallback berbayar  
- Tidak benchmark otomatis per request user  

---

## 8. Acceptance checklist 5.2-A

- [x] Audit Phase 5 explain / provider / context builder  
- [x] Audit Phase 5.1 router (implemented, flag off)  
- [x] Audit Scenario schema + evaluation fields  
- [x] Kontrak API/UI yang frozen  
- [x] Model ID kandidat diverifikasi dari katalog OpenRouter  
- [x] Baseline dataset & gap ke 30 kasus dicatat  
- [x] Regression tests dijalankan (92 pass)  
- [x] Tidak ada refactor besar  

**Output:** audit ini + `verified-candidates-2026-10-28.json`.  

**Next:** **Phase 5.2-B** — dataset 30 + benchmark runner (Lightning / Ultra / Xing) dengan mock-first di CI dan job manual berkuota.

### Update — 5.2-B complete

- Dataset: `docs/ai-eval/reasoning-benchmark-v1.json` (30 / distribusi PRD)  
- Runner: `npm run ai:benchmark` (mock) · `npm run ai:benchmark:live`  
- Scorer + tests: `src/lib/ai/eval/*`  
- Docs: `docs/phase5.2-b-benchmark.md`  
- **Belum:** live scorecard untuk promotion (5.2-C)

### Update — 5.2-C complete

- Keputusan: **retain** `nvidia/nemotron-3.5-lightning:free`  
- Dokumen: `docs/phase5.2-c-model-selection.md`  
- Provider fix + max_tokens 1200 + prompt/scorer harden  
- Ultra/Xing **tidak** dipromosikan (sampel/reliability kurang)  
- Next: **5.2-D** Scenario Explainer

---

## 9. Keamanan dokumen

- Tidak menyertakan nilai `OPENROUTER_API_KEY`.  
- Dataset & kandidat tidak berisi PII / ledger pengguna nyata.
