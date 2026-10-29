# Phase 5.2 — Analisis Benchmark (28 Okt 2026)

**Repo:** `/root/.openclaw/finora-apps`  
**Dataset:** `docs/ai-eval/reasoning-benchmark-v1.json` (30 kasus sintetis)  
**Rubrik/scorer:** `src/lib/ai/eval/score-response.ts`  
**Tidak ada:** ganti model production · ubah financial engine · fallback berbayar · klaim “model terbaik” global

---

## 1. Diagnosis `dve-001` / `dve-002` CRIT (live awal)

### Bukti

Run terminal user (`npm run ai:benchmark:live`, exit 130) dan repro diagnostik:

- File: `docs/ai-eval/results/live-lightning-diag-2026-10-28.json`
- Kasus: `dve-001`, `dve-002`, `dve-003`
- `providerError`: **「Respons AI kosong atau tidak valid.」**
- `providerErrorCode`: **`AI_RESPONSE_INVALID`**
- `answer`: `""`
- `actualModel`: `null` (gagal sebelum parse sukses)
- Latency ~7.6–12.7s (bukan timeout 45–60s)
- Setelah harness diperbaiki: `failureCategory` = **`response_parse`**, `qualityCriticalFail` = **false**

### Probe OpenRouter (sintetis, tanpa data pribadi)

| Setting | HTTP | `content` | `reasoning` | `finish` |
|---|---|---|---|---|
| `reasoning: { exclude: true }` (provider lama) | 200 | **null** | absen | `length` |
| Tanpa `reasoning.exclude` | 200 | sering null / baru terisi jika token cukup | string panjang | `length`/`stop` |
| `max_tokens: 1200` + tanpa exclude | 200 | string ID pendek | thinking | `stop` |

**Akar penyebab:** provider mengirim `reasoning: { exclude: true }`. Pada Nemotron 3.5 Lightning free, jawaban sering hanya di jalur reasoning; exclude → body kosong → `extractOpenRouterText` = "" → `AI_RESPONSE_INVALID`.

### Kategori kegagalan (awal)

| Item | Kategori |
|---|---|
| dve-001 / dve-002 CRIT di terminal | **Response parsing / empty output** (reliability), **bukan** kegagalan reasoning |
| Pelabelan CRIT di harness lama | **Kesalahan harness** — provider error digabung ke `score.criticalFail` + `mustMentionAny` kritis pada jawaban kosong |

Ini **bukan** kesalahan numerik/fakta model pada kasus tersebut.

---

## 2. Perbaikan harness yang dikonfirmasi

1. **Pisahkan** `providerFailure` vs `qualityCriticalFail` + `failureCategory`
2. **Simpan partial JSON** tiap kasus + SIGINT (run Ctrl+C sebelumnya tidak menyimpan file)
3. **`--max-provider-errors`** hentikan model (default 5) agar kuota tidak habis
4. Catat `requestedModel` / `actualModel` / `answer` penuh
5. `mustMentionAny` hanya **critical** jika semua needle amount-like (bukan frasa “utang”/“buffer”)
6. Mock negatif: `invent_amount` / `claim_action` (test di `failure-classify.test.ts`)
7. Hapus `reasoning.exclude` di `OpenRouterProvider` (perbaikan parse Lightning)
8. Benchmark live memakai `max_tokens: 1200`
9. Soft fix: `no … shortfall` bahasa Inggris tidak lagi dianggap klaim shortfall palsu

Mock 30/30 PASS **memang** fixture yang menghindari jalur kritis — itu disengaja untuk CI scorer wiring, **bukan** bukti kualitas model. Test harness negatif ditambahkan untuk menutup gap itu.

---

## 3. Hasil per model

### 3.1 Mock — `docs/ai-eval/results/benchmark-2026-10-28-04-32-38.json`

| Model | Diuji | Pass | Catatan |
|---|---:|---:|---|
| Lightning / Ultra / Xing (mock) | 30 | 30 | Fixture scorer saja — **bukan** kualitas reasoning |

### 3.2 Lightning live (setelah fix provider) — `live-lightning-2026-10-28.json`

| Metrik | Nilai |
|---|---|
| Kasus diuji | **30 / 30** |
| Quality tested | 30 |
| Quality pass | **27** |
| Quality critical fail | **2** (`cfl-002`, `cfl-003`) |
| Soft fail | **1** (`inc-003`) |
| Provider / parse error | **0** |
| Latency | min 11.3s · avg **14.7s** · max 29.4s |
| `actualModel` | selalu `nvidia/nemotron-3.5-lightning:free` |

**Kegagalan kualitas:**

| Case | Kategori | Bukti ringkas |
|---|---|---|
| `cfl-002` | Numeric/factual (+ harness ketat) | Tidak menyebut literal `12500000` / `12.500.000` (pakai parafrase “10 juta… meningkat”); soft shortfall sempat false-positive pada frasa Inggris “no projected shortfall” (sudah diperbaiki di scorer) |
| `cfl-003` | Numeric/factual / format | Jawaban terisi **thinking process** Inggris; `no_bankruptcy_overclaim` kritis terpicu |
| `inc-003` | Soft quality | Trade-off / uncertainty heuristic tidak terpenuhi |

**Numeric integrity (ketat):** 28/30 tanpa critical invent; 2 critical terkait mention/overclaim di atas.  
**Factual consistency:** umumnya baik pada 27 pass.  
**Instruction compliance (oop):** pass.

### 3.3 Ultra live — `live-ultra-2026-10-28.json`

| Metrik | Nilai |
|---|---|
| Percobaan | 14 (berhenti early) |
| Quality tested | **9** |
| Quality pass | **9 / 9** |
| Quality CRIT | **0** |
| Provider fail | **5** berturut (`AI_PROVIDER_UNAVAILABLE` / rate limit) |
| Latency (sukses) | ~17–40s |
| `actualModel` (sukses) | `nvidia/nemotron-3-ultra-550b-a55b:free` |

**Kualitas vs reliability:** sampel kualitas kecil tapi bersih; **reliability free-pool buruk** setelah ~9 request. **Tidak cukup** untuk declare pemenang produksi.

### 3.4 Xing4 live — `live-xing4-2026-10-28.json`

| Metrik | Nilai |
|---|---|
| Percobaan | 9 (early stop) |
| Quality tested | **3** |
| Quality pass | **3 / 3** |
| Quality CRIT | **0** |
| Provider fail | **6** (rate limit upstream Phala / shared free pool) |
| `actualModel` (sukses) | `xingchen-agi/xing4.0-29b-a4b:free` |

Sampel terlalu kecil untuk bandingkan reasoning vs Lightning/Ultra.

---

## 4. Parameter request (konsistensi)

| Param | Nilai live runner |
|---|---|
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` |
| System | `FINANCIAL_EXPLAINER_SYSTEM` (sama semua model) |
| Prompt | `buildEvalPrompt(case)` dari dataset yang sama |
| `max_tokens` | 1200 |
| Timeout | 60s |
| Free-only guard | `isAllowedFreeModel` |
| Model ID diminta vs aktual | Cocok pada semua respons sukses |

---

## 5. Keterbatasan dataset / evaluasi

- 30 kasus sintetis — bukan ledger pengguna nyata  
- Assertion substring/amount belum mencakup parafrase (“10 juta”, “1,2 juta”)  
- Heuristik trade-off/uncertainty bisa soft-fail jawaban yang sebenarnya memadai  
- Lightning kadang mengembalikan **thinking** sebagai teks yang di-score  
- Ultra/Xing: **kuota free terbatas** → coverage < 30  
- Mock ≠ kualitas model  

---

## 6. Rekomendasi (tanpa ganti production default)

### Harness / provider (prioritas tinggi) — sebagian sudah dilakukan

- [x] Jangan `reasoning.exclude` untuk Lightning  
- [x] Pisahkan provider vs quality di laporan  
- [x] Partial save + circuit-breaker provider errors  
- [ ] Normalisasi jumlah (terima “10 juta” ≈ 10_000_000) untuk mention checks  
- [ ] Deteksi/strip “Here's a thinking process” sebelum score  
- [ ] Retry tunggal dengan backoff hanya pada 429 (tetap max attempts ketat)

### Prompt / context builder

- Instruksi eksplisit: **jawaban final Bahasa Indonesia di `content`**, jangan proses berpikir panjang  
- Untuk forecast positif: minta sebutkan `endingBalance` persis dari JSON  

### Pemilihan model

| Keputusan | Alasan |
|---|---|
| **Jangan** klaim model terbaik sekarang | Ultra 9 kasus, Xing 3 kasus; Lightning satu-satunya full 30 |
| **Pertahankan** baseline production Lightning | Setelah fix parse, 27/30 quality; ID terverifikasi |
| Ultra menarik untuk reasoning | 9/9 quality bersih — **ulang full 30** saat kuota pulih sebelum promote |
| Xing | Reliability free-pool lemah hari ini; jangan promote |

### Production

- Fix provider (hapus `reasoning.exclude`) **layak di-deploy** — itu bug reliability Explainer, bukan hanya benchmark  
- **Jangan** set `OPENROUTER_MODEL` ke Ultra/Xing sebelum full benchmark + promotion criteria PRD §6.8  

---

## 7. File hasil

| File | Isi |
|---|---|
| `docs/ai-eval/results/benchmark-2026-10-28-04-32-38.json` | Mock 3×30 |
| `docs/ai-eval/results/live-lightning-diag-2026-10-28.json` | Repro parse-fail pre-fix |
| `docs/ai-eval/results/live-lightning-2026-10-28.json` | Lightning full 30 post-fix |
| `docs/ai-eval/results/live-ultra-2026-10-28.json` | Ultra partial (9 quality + 5 rate-limit) |
| `docs/ai-eval/results/live-xing4-2026-10-28.json` | Xing partial (3 quality + 6 rate-limit) |

Tidak ada API key atau data finansial pribadi pengguna dalam laporan ini (hanya konteks sintetis dataset).
