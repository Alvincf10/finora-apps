# Phase 5.1-A — Audit & Baseline (Free Model Router)

**Tanggal:** 28 Oktober 2026  
**Repo:** `/root/.openclaw/finora-apps`  
**Branch:** `main`  
**Status:** Complete — siap lanjut 5.1-B  
**PRD:** `prd/phase5.1.md` · dependensi `prd/phase5.md`

---

## 1. Ringkasan eksekutif

Phase 5 (Financial Explainer) **sudah live** di codebase: endpoint explain, context builder dari financial engine, UI `AiExplainer`, rate limit, timeout, usage log, dan guard model gratis (hindari safety classifier + rantai fallback hard-coded).

Phase 5.1 menambahkan **routing per task type** + registry konfigurasi + evaluasi model. Saat ini **belum ada** `model-router.ts`, flag `AI_ROUTER_ENABLED`, env per task, atau dataset evaluasi formal — kecuali file baseline yang dihasilkan audit ini.

**Keputusan baseline produksi (jangan diganti sebelum 5.1-C):**

| Item | Nilai aktual |
|---|---|
| Default model | `nvidia/nemotron-3.5-lightning:free` (via `OPENROUTER_MODEL` / pin di `config.ts`) |
| Fallback chain | Hard-coded di `FREE_CHAT_MODEL_FALLBACKS` (`model-guard.ts`) |
| Feature flag router | **Tidak ada** (`AI_ROUTER_ENABLED` belum ada) |
| Task typing | **Tidak ada** — semua explain memakai satu system prompt + satu model chain |

---

## 2. Inventaris implementasi Phase 5

### 2.1 File inti

| Path | Peran |
|---|---|
| `src/app/api/ai/explain/route.ts` | Endpoint utama Financial Explainer |
| `src/app/api/ai/chat/route.ts` | Legacy alias → `general_summary` |
| `src/lib/ai/provider.ts` | OpenRouter adapter + rate limit + fallback loop |
| `src/lib/ai/config.ts` | Env: key, model, tokens, timeout, daily/min limits |
| `src/lib/ai/model-guard.ts` | Pin free chat model; tolak safety classifier |
| `src/lib/ai/context-builder.ts` | Konteks dari engine (6 `contextType`) |
| `src/lib/ai/system-prompt.ts` | Instruksi explainer (ID) |
| `src/lib/ai/usage-log.ts` | Metadata JSONL (tanpa prompt/context) |
| `src/lib/ai/errors.ts` | Kode error aman |
| `src/components/ai-explainer.tsx` | UI Dashboard / Insights |
| `src/lib/validations.ts` → `aiExplainSchema` | Zod input |

### 2.2 Context types → task type (usulan 5.1)

Sesuai PRD §7.2 — **belum diimplementasikan**; mapping target:

| `contextType` (Phase 5) | Task type (Phase 5.1) | UI saat ini |
|---|---|---|
| `financial_health` | `financial_explainer` | Belum dipasang langsung |
| `cash_flow_forecast` | `financial_explainer` | Belum dipasang langsung |
| `scenario` | `financial_reasoning` | Belum dipasang (butuh `scenarioId`) |
| `action_center` | `action_advisor` | Insights (`AiExplainer`) |
| `roadmap` | `financial_explainer` | Belum dipasang langsung |
| `general_summary` | `general_explainer` | Dashboard (`AiExplainer`) |

`simple_summary` belum punya endpoint/UI eksplisit.

### 2.3 Kontrak request / response (UI-facing)

**Request** `POST /api/ai/explain` (auth session wajib):

```json
{
  "question": "string 1–1000",
  "contextType": "financial_health | cash_flow_forecast | scenario | action_center | roadmap | general_summary",
  "contextRef": {
    "periodDays": 30 | 60 | 90,
    "scenarioId": "string",
    "year": 2000–2100,
    "month": 1–12
  }
}
```

**Success** (`ok()` wrapper — bentuk envelope mengikuti `lib/api`):

```json
{
  "explanation": "...",
  "model": "nvidia/nemotron-3.5-lightning:free",
  "contextType": "general_summary",
  "disclaimer": "Jawaban dibuat AI berdasarkan data Finora. ..."
}
```

UI (`ai-explainer.tsx`) memakai: `explanation`, `model?`, `disclaimer?`.  
**Breaking change pada field tersebut dilarang** di 5.1. Metadata routing (`taskType`, `fallbackUsed`) boleh ditambah sebagai **opsional** di dalam envelope tanpa merusak UI lama.

**Legacy** `POST /api/ai/chat`: body `aiChatSchema`; selalu `general_summary`; response mirip (explanation + model).

### 2.4 Error behavior (aman untuk UI)

| Kode | HTTP tipikal | Pemicu | Fallback model? |
|---|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | Key kosong / 401–403 provider | Tidak |
| `RATE_LIMITED` | 429 | Finora per-minute / daily | Tidak |
| `INSUFFICIENT_CONTEXT` | 400/404 | Skenario hilang / bukan milik user | Tidak |
| `AI_TIMEOUT` | 504 | Abort / timeout per call | **Ya** (model berikutnya di chain) |
| `AI_PROVIDER_UNAVAILABLE` | 503 | 429 provider, network, 5xx | **Ya** |
| `AI_RESPONSE_INVALID` | 502 | Kosong / safety-only output | **Ya** |

Pesan error tidak membocorkan body provider. Rate limit Finora: default **3/menit**, **20/hari** (env `AI_PER_MINUTE_LIMIT`, `AI_DAILY_REQUEST_LIMIT`).

### 2.5 Fallback saat ini vs PRD 5.1

| Aspek | Phase 5 (aktual) | PRD 5.1 (target) |
|---|---|---|
| Pemilihan model | Satu primary + daftar hard-coded | Per **task type** dari registry/env |
| Max attempts | Seluruh `freeChatFallbackModels` (bisa >2) | Baseline: **1 primary + 1 fallback** |
| Validasi gratis | Suffix/heuristik safety; **tidak** cek pricing API | Verifikasi katalog + tolak berbayar |
| Feature flag | — | `AI_ROUTER_ENABLED` (off = jalur Phase 5) |
| Env per task | — | `OPENROUTER_MODEL_*` + `OPENROUTER_FALLBACK_MODELS` |
| Logging task type | `task_type: "ai_explain"` tetap | Perlu `taskType` + `fallbackUsed` + attempts |

**Gap kritis:** fallback chain saat ini bisa mencoba beberapa model berurutan pada 429/timeout — PRD §8.5 meminta **tidak** menghabiskan kuota dengan cascade agresif. 5.1-B harus merapikan batas percobaan.

### 2.6 Observability

`appendAIUsageLog` menulis JSONL ke `FINORA_AI_USAGE_LOG_PATH` / default `/var/lib/openclaw-cost/ledger.jsonl`:

- `requestId`, `userIdHash`, `contextType`, `model`, `status`, `errorCode`, `latencyMs`, tokens  
- **Tidak** menyimpan prompt, context, atau API key  

Belum ada: `taskType`, `requestedModel`, `fallbackUsed`, `attempts`.

### 2.7 Integritas finansial (tetap wajib)

- Angka hanya dari `buildAIExplainContext` → financial engine  
- AI tidak punya jalur write ke ledger / payday / debts  
- Transfer tidak di-agregasi sebagai income/expense di context builder  
- Auth: `requireUser()`; skenario dicek ownership  

### 2.8 Tes otomatis (baseline regresi AI)

`npm run test -- src/lib/ai` → **21 passed** (provider, config, model-guard, extract-text, context-builder schema).  
Financial engine regressions tetap terpisah (`src/lib/financial/**/*.test.ts`).

---

## 3. Konfigurasi environment (produksi lokal)

Dari dokumentasi / pola deploy (nilai secret **tidak** dicatat di dokumen ini):

```bash
OPENROUTER_API_KEY=          # wajib untuk AI
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
OPENROUTER_MAX_OUTPUT_TOKENS=800
AI_REQUEST_TIMEOUT_MS=20000
AI_DAILY_REQUEST_LIMIT=20
AI_PER_MINUTE_LIMIT=3
```

Belum ada: `AI_ROUTER_ENABLED`, `OPENROUTER_MODEL_SIMPLE_SUMMARY`, `OPENROUTER_MODEL_FINANCIAL_EXPLAINER`, `OPENROUTER_MODEL_FINANCIAL_REASONING`, `OPENROUTER_MODEL_ACTION_ADVISOR`, `OPENROUTER_FALLBACK_MODELS`, `AI_MAX_RETRIES`.

`README.md` sudah mendokumentasikan env Phase 5; perlu diperbarui di 5.1-D.

---

## 4. Kandidat model (evaluasi — belum dipromosikan)

Dari PRD + guard existing. **Semua ID harus diverifikasi di katalog OpenRouter sebelum masuk registry produksi.**

| Peran evaluasi | Kandidat (nama produk) | Status audit |
|---|---|---|
| Baseline / primary | `nvidia/nemotron-3.5-lightning:free` | **Aktif di produksi lokal** |
| Fallback hard-coded | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, Gemma free | Ada di `FREE_CHAT_MODEL_FALLBACKS` |
| Reasoning kandidat | Xing4.0 29B A4B (free) | Model ID API **belum diverifikasi** di repo |
| Ringkasan ringan | LFM2.5-2.6B | Model ID API **belum diverifikasi** |
| Pembanding | Nemotron 3 Ultra, Flint, Dots3-Note, Laguna S 2.1, North Mini Code | **Belum** — coding model tidak diprioritaskan untuk explainer |

**Aturan 5.1-A:** jangan ganti `OPENROUTER_MODEL` produksi hanya karena kandidat baru muncul di dashboard OpenRouter.

---

## 5. Baseline dataset evaluasi

File: [`docs/ai-eval/baseline-dataset.json`](./ai-eval/baseline-dataset.json)

Isi:

- Konteks **sintetis / anonim** (bukan data pengguna nyata)
- Pertanyaan per kategori PRD §13.1
- Assertion deterministik untuk **numeric integrity** (angka yang boleh / tidak boleh muncul)
- Flag `mustRefuseAction` untuk pertanyaan di luar izin AI
- Field `expectedTaskType` untuk menguji router di 5.1-B/C

Cara pakai (5.1-C):

1. Bangun prompt dengan system prompt Phase 5 + `context.payload` dari case  
2. Kirim ke tiap model kandidat (mock di CI; live hanya di lingkungan evaluasi)  
3. Skor: factual consistency, numeric integrity (regex/assert), latency, reliability  
4. Promosi model hanya jika lulus criteria PRD §13.4  

---

## 6. Gap list → 5.1-B

1. **`src/lib/ai/model-router.ts`** — pilih route by `taskType`, fallback policy, metadata  
2. **Registry + env** — per task; validasi hanya model `:free` / allowlist; tolak berbayar  
3. **`AI_ROUTER_ENABLED=false` default** — jalur Phase 5 tetap  
4. **Map `contextType` → `taskType`** di explain route  
5. **Batasi attempts** (1+1) + timeout total  
6. **Perkaya usage log** (`taskType`, `fallbackUsed`, `attempts`) tanpa prompt  
7. **Unit tests** mock provider sesuai PRD §16  
8. **Jangan** benchmark live sebagai dependensi CI  

---

## 7. Acceptance checklist 5.1-A

- [x] Baca PRD Phase 5 + implementasi adapter  
- [x] Identifikasi kontrak endpoint yang dipakai UI  
- [x] Catat model default + perilaku error  
- [x] Baseline dataset evaluasi  
- [x] Dokumen audit ini  

**Output:** audit + baseline siap. Lanjut **Phase 5.1-B — Router implementation**.

---

## 8. Phase 5.1-B status (implemented)

| Item | Status |
|---|---|
| `src/lib/ai/task-types.ts` | Done — context → task map |
| `src/lib/ai/model-registry.ts` | Done — free-only validation + env routes |
| `src/lib/ai/model-router.ts` | Done — 1 primary + `AI_MAX_RETRIES` fallback |
| `AI_ROUTER_ENABLED` default `false` | Done — Phase 5 path retained |
| Explain/chat wiring + optional `metadata` | Done |
| Usage log: taskType / fallback / attempts | Done |
| Unit tests (registry + router + task map) | Done — `npm run test -- src/lib/ai` |

**Belum (5.1-C / 5.1-D):** live OpenRouter catalog verification, benchmark promotion, production flag on, README/env rollout notes.

---

## 9. Catatan keamanan audit

- API key OpenRouter hanya di environment server; **jangan** commit `.env.local`.  
- Dokumen ini sengaja tidak menyertakan nilai secret.  
- Dataset evaluasi tidak mengandung PII atau ledger pengguna nyata.
