# Checkpoint — 27 Oktober 2026

**Repo:** `/root/.openclaw/finora-apps`  
**Branch:** `main`  
**Host:** `finora.spidernet.web.id` · service `finora.service` / `finora-vira.service`  
**Prinsip:** Finora menghitung · AI menjelaskan · pengguna memutuskan

---

## 1. Ringkasan

Checkpoint ini menutup pekerjaan sesi 26–27 Okt 2026 di atas fondasi Finora 2.0:

1. Alur bayar fixed cost wajib pilih rekening sumber + bisa ganti sumber setelah lunas.
2. Phase 5 Financial Explainer (OpenRouter Free) — MVP P0.
3. Isolasi WhatsApp Finora Vira vs OpenClaw (prefix `finora`).
4. Perbaikan ops: permission `chdir` systemd + rebuild production.

---

## 2. Commit terkait

| Commit | Isi |
|---|---|
| `0a698b0` | Ship Finora 2.0 deterministic stack (health, forecast, Decision Lab, Action/Command Center) |
| `85e9020` | Clarify Finora 2.0 UI copy (ID/EN) + README |
| `8f10f89` | Fixed cost: wajib funding account + ganti sumber setelah bayar |
| `378e408` | Phase 5 Financial Explainer (OpenRouter Free) |

Tag saran (opsional): `checkpoint-2026-10-27`.

---

## 3. Fixed costs — sumber pembayaran

**Masalah:** bayar fixed cost bisa tanpa sadar potong rekening yang salah; item sudah “Paid this cycle” tidak bisa dipindah.

**Selesai:**

- Dialog bayar wajib pilih rekening (tampil saldo).
- Default prefer rekening nama mengandung `fixed` (mis. **ATM Fixed cost**).
- Setelah bayar: saldo rekening terpotong; toast menampilkan sisa.
- Item sudah lunas: tombol **Ganti sumber** + teks “Dibayar dari …”.
- API `PATCH /api/fixed-costs/[id]/pay` memindah transaksi cycle ini + recalc kedua saldo.
- Payday settle juga wajib `accountId`; FIXED default ke pocket fixed.
- Data koreksi: pembayaran **netflix diana** dipindah BCA → ATM Fixed cost.

**File utama:**  
`src/app/(app)/fixed-costs/page.tsx`, `src/lib/financial/record-fixed-cost-payment.ts`,  
`src/app/api/fixed-costs/[id]/pay/route.ts`, `src/app/(app)/payday/page.tsx`

---

## 4. Finora 2.0 — status engine (sudah di ship sebelumnya)

| Kapabilitas | Status | UI / API |
|---|---|---|
| Financial Health | ✅ | Dashboard / `/api/financial-health` |
| Cash-flow 30/60/90 | ✅ | Dashboard / `/api/cash-flow-forecast` |
| Decision Lab + Scenario | ✅ | `/simulator` / `/api/scenarios` |
| Action Center (issue key) | ✅ | `/alerts`, `/insights` |
| Command Center | ✅ | Dashboard / `/api/command-center` |
| Roadmap (Tangga Ternak Uang) | ✅ | Insights + ensure-starter |
| Vitest regresi | ✅ | metrics, forecast, scenarios, action-center |
| Tanpa AI di engine angka | ✅ | Deterministic only |

PRD: `prd/phase4.md` · Audit: `docs/phase0-audit.md`

---

## 5. Phase 5 — Financial Explainer (MVP P0)

PRD: `prd/phase5.md`

**Selesai:**

- `POST /api/ai/explain` — auth, Zod, `contextType`, rate limit (3/menit + 20/hari), timeout.
- Context builder dari engine 2.0 (bukan angka dari browser):  
  `financial_health` · `cash_flow_forecast` · `scenario` · `action_center` · `roadmap` · `general_summary`
- OpenRouter default `openrouter/free` — **tanpa** fallback berbayar.
- Provider error mapping aman (tidak bocorkan body/key).
- UI `AiExplainer` di **Dashboard** + **Insights** (on-demand saja).
- Legacy `/api/ai/chat` dialihkan ke konteks `general_summary`.
- Unit tests: `src/lib/ai/*.test.ts` (12 tests).
- README env docs diperbarui.

**Belum (P1 PRD):**

- Scenario Explainer khusus di halaman Decision Lab.
- Action Advisor UI khusus.
- Dashboard monitoring usage AI.

**Ops AI:** isi `OPENROUTER_API_KEY` di `.env.local` (jangan commit). Model: `openrouter/free`.

---

## 6. WhatsApp — tidak bentrok OpenClaw

| Komponen | Perilaku |
|---|---|
| Finora Vira | Hanya jawab prefix `finora` / `finora:` / `finora.` — selain itu diam |
| OpenClaw | `workspace/AGENTS.md`: jangan balas pesan prefix `finora` |
| Phase 5 AI | Web only — tidak masuk jalur WA |
| Nomor | Shared `6287785365476` (by design) |

**Tambahan di luar repo Finora:**  
`~/.openclaw/hooks/forward-wa.sh` — pesan prefix `finora` **tidak** di-forward ke Daily Planner (cegah balasan “perintah tidak dikenali”).

`WA_PREFIX=finora` via `.env.local` + `finora-vira.service`.

---

## 7. Ops / production

- **Bug:** setelah restart, `finora.service` crash `CHDIR Permission denied` karena `/root/.openclaw` mode `700`.
- **Fix:** `chmod 711 /root/.openclaw` agar user `finora` bisa traverse ke `finora-apps`.
- Rebuild + restart: `finora.service` + `finora-vira.service` aktif; login HTTPS 200.

---

## 8. Acceptance singkat (checklist)

### Fixed cost
- [x] Bayar wajib pilih sumber
- [x] Saldo terpotong dari sumber yang dipilih
- [x] Ganti sumber untuk yang sudah paid cycle ini
- [x] Default ke pocket fixed

### Phase 5 MVP
- [x] Key hanya di server
- [x] Endpoint auth + Zod
- [x] Konteks dari backend engine
- [x] Model free, no paid fallback
- [x] UI on-demand (Dashboard / Insights)
- [x] AI tidak menulis ledger
- [x] Rate limit + timeout
- [x] Regression / unit AI tests hijau
- [x] Engine non-AI tetap jalan tanpa key

### WA
- [x] Prefix `finora` aktif di Vira
- [x] OpenClaw instruksi ignore prefix
- [x] Hook planner skip prefix `finora`

---

## 9. Risiko & tindak lanjut

| Item | Catatan |
|---|---|
| OpenClaw ignore `finora` | Masih berbasis `AGENTS.md` (prompt) — bukan hard filter gateway |
| Hook `forward-wa.sh` | Di luar git Finora — backup/dokumentasikan di host OpenClaw |
| Payday planned vs actual | Belum (PRD phase4 open item) |
| Phase 5 P1 | Scenario/Action explainer UI + usage monitoring |
| Permission `.openclaw` | Jangan kembalikan ke `700` atau service user `finora` gagal start lagi |

---

## 10. Cara verifikasi cepat

```bash
systemctl is-active finora.service finora-vira.service
curl -sI https://finora.spidernet.web.id/login | head -5
# WA: "finora help" → Vira; chat biasa tanpa prefix → OpenClaw
# Web: Dashboard / Insights → panel "Jelaskan dengan AI"
```

---

**Definition of done untuk checkpoint ini:** fitur di atas sudah di-build, di-deploy di VPS, dan di-commit di `main` (Phase 5: `378e408`; fixed-cost source: `8f10f89`).
