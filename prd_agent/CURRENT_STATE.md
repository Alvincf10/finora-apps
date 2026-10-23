# CURRENT_STATE — Phase 0 Discovery & Audit

**Tanggal audit:** 21 Oktober 2026  
**PRD acuan:** `prd_agent/phase1.md`  
**Host:** VPS (`srv844796` / 31.97.37.38)  
**Status:** Discovery complete — siap Phase 1 (cost optimization)

---

## 1. Ringkasan eksekutif

Lingkungan produksi sudah berjalan dengan **tiga jalur WhatsApp/asisten** yang berbagi nomor atau webhook:

| Komponen | Peran | Status |
|---|---|---|
| **OpenClaw gateway** | Asisten pribadi (WA DM/group), model Gemini Flash + OpenRouter free fallback | Aktif, WA linked/healthy |
| **Finora + Vira** | Personal finance Next.js + worker Baileys (prefix `finora`) | Aktif (`finora.service`, `finora-vira.service`) |
| **Daily Planner** | Reminder/task via webhook OpenClaw → Postgres, cron Asia/Jakarta | Aktif (`daily-planner.service`) |
| **Hermes** | Kandidat agent pengganti (PRD) | **Belum terpasang** |

Tidak ada `/api/assistant/*`, tidak ada cost ledger, dan transaksi Vira **langsung tersimpan tanpa konfirmasi eksplisit**.

---

## 2. OpenClaw inventory

### 2.1 Versi & runtime

| Item | Nilai |
|---|---|
| Versi | OpenClaw **2026.6.11** (`e085fa1`) |
| Node | v24.18.0 |
| Binary | `/root/.nvm/versions/node/v24.18.0/bin/openclaw` |
| State dir | `/root/.openclaw` |
| Workspace | `/root/.openclaw/workspace` |
| Gateway | port **18789**, auth token, service user systemd `openclaw-gateway` |
| Heartbeat | 30 menit (template `HEARTBEAT.md` kosong → skip API call) |
| Agent | 1 (`main`), ~4 session aktif, ~470 file session historis |
| Tools profile | `coding` |
| Session DM scope | `per-channel-peer` |

### 2.2 Model & provider

**Default (produksi):**

- Primary: `google/gemini-2.5-flash` (alias `gemini-flash`)
- Fallbacks: OpenRouter free (`qwen3-coder`, `gpt-oss-120b`, `llama-3.3-70b`)
- Memory search embeddings: Gemini `gemini-embedding-001`
- Auth profile: `google:default` (API key)

**Alias terdaftar (belum jadi primary):** `pro` → `google/gemini-3.1-pro-preview`

**Plugin model routing:** `diskusi-router` — sticky per session ke Gemini 3.1 Pro bila prompt mengandung trigger (`diskusi`, `brainstorm`, `bahas`, …); kembali ke Flash pada stop trigger (`selesai`, `cukup`, …). State in-memory (reset saat restart gateway).

**Belum ada:** DeepSeek, hard budget middleware, task-type router sesuai PRD FR-02.

### 2.3 Channel & akses

| Channel | Enabled | Catatan |
|---|---|---|
| WhatsApp | Ya | Linked, connected, `dmPolicy: pairing`, last in ~4h |
| Telegram | Plugin enabled | Tidak diverifikasi sebagai kanal produksi aktif |
| Google | Plugin enabled | Credentials di `credentials/google/` (Calendar setup docs ada) |
| OpenRouter | Plugin enabled | Digunakan sebagai fallback model |

- `commands.ownerAllowFrom`: WhatsApp owner allowlist terkonfigurasi
- Gateway `nodes.denyCommands` memblokir beberapa aksi sensitif (camera, calendar.add, reminders.add, sms, …) di **node** — bukan pengganti kebijakan Finora

### 2.4 Skills & ekstensi

**Skills enabled (subset):** `github`, `gog` (Google), custom `bca-reward`  
**Skills disabled (banyak):** coding-agent, summarize, session-logs, trello, obsidian, whisper, dll.  
**Plugin skills:** `wacli` → symlink ke extension WhatsApp  
**Extensions:** `whatsapp`, `diskusi-router`  
**Hooks internal:** session-memory, boot-md, compaction-notifier  
**Hook eksternal:** `beforeSubmitPrompt` → `hooks/forward-wa.sh` meneruskan pesan WA ke Daily Planner `POST http://localhost:3001/api/webhook`

### 2.5 Scheduler / reminder (OpenClaw side)

- Commitments store: **0 pending**
- Cron session terlihat di status (`agent:main:cron:…`)
- Reminder produksi utama untuk daily plan: **daily-planner** (bukan Hermes), timezone `Asia/Jakarta` (07:00 / 13:00 / 21:00)
- `gog` skill tersedia untuk Google Calendar/workflow terkait

### 2.6 Observability token (saat ini)

`openclaw status` menampilkan token context per session secara kasar (mis. `0/1.0m`, `26k/1.0m`), **bukan** cost ledger USD per request/task. Tidak ada dashboard budget $6/$10.

---

## 3. Finora inventory

### 3.1 Stack & deploy

| Item | Nilai |
|---|---|
| App | Next.js **16.3.8**, React 19, Mongoose 9, Auth.js v5 |
| Path | `/root/.openclaw/finora-apps` |
| Port | **3010** (`127.0.0.1`) |
| DB | MongoDB (`MONGODB_URI`) |
| AI in-app | OpenRouter (`OPENROUTER_MODEL=openai/gpt-4o-mini`), maxTokens default 400–500 |
| Money | Integer minor units (`src/lib/money.ts`); IDR scale = 1 |

### 3.2 WhatsApp Vira (Baileys)

- Proses terpisah: `npm run wa:vira` → `finora-vira.service`
- **Shared number dengan OpenClaw:** hanya memproses pesan ber-prefix `WA_PREFIX=finora`
- Allowlist `allowedFrom` wajib; group diabaikan
- Perintah deterministik: help, total/pengeluaran/pemasukan/ringkasan (hari ini / bulan)
- **Write path:** parse pesan uang → `createTransaction` **langsung** (tanpa preview/confirm, tanpa idempotency key)
- Catatan: `notes: "via WhatsApp Vira"`, tags `whatsapp`, `vira`

### 3.3 API map (yang sudah ada)

Semua route di bawah memakai **`requireUser()` = session NextAuth** (cookie browser). **Tidak ada** autentikasi server-to-server / API token agent.

| Method | Endpoint | Relevansi PRD |
|---|---|---|
| GET | `/api/accounts` | Saldo rekening (bukan endpoint assistant) |
| GET | `/api/financial-summary` | Ringkasan bulanan |
| GET | `/api/dashboard` | Agregat kaya (banyak data) |
| GET | `/api/financial-context` | Konteks untuk AI |
| GET/POST | `/api/transactions` | Baca/tulis transaksi |
| GET/POST | `/api/budgets` | Anggaran |
| GET/POST | `/api/debts` | Utang |
| POST | `/api/ai/chat` | Penjelasan AI (rate limit 10/menit), **tidak log token/cost** |
| GET/POST/PATCH | `/api/whatsapp` | Kontrol session Vira (bukan chat) |
| … | goals, recurring, fixed-costs, forecast, simulator, reports, alerts, insights, categories, settings | Fitur app |

### 3.4 Endpoint PRD yang **belum ada**

| PRD | Status |
|---|---|
| `GET /api/assistant/balance` | Missing |
| `GET /api/assistant/summary` | Missing (ada `/financial-summary` session-bound) |
| `GET /api/assistant/transactions` | Missing |
| `GET /api/assistant/budgets` | Missing |
| `GET /api/assistant/debts` | Missing |
| `POST /api/assistant/transactions/preview` | Missing |
| `POST /api/assistant/transactions/confirm` | Missing |
| S2S auth + rate limit + audit + idempotency | Missing |

---

## 4. Daily Planner

| Item | Nilai |
|---|---|
| Path | `/root/.openclaw/daily-planner` |
| Port | 3001 |
| DB | PostgreSQL |
| Ingress | `POST /api/webhook` `{ from, text }` dari `forward-wa.sh` |
| Perintah | `add task`, `today`, `done …`, `daily review`, … |
| Outbound | `OpenClawService.sendMessage` kembali ke WA |

Ini adalah jalur reminder/kalender harian yang sudah produksi. **Jangan diganti selama evaluasi Hermes** (sesuai PRD FR-07).

---

## 5. Cost model — kemampuan hari ini

| Sumber biaya | Tracking | Enforcement |
|---|---|---|
| OpenClaw → Google Gemini | Session token rough only | Tidak ada hard limit USD |
| OpenClaw → OpenRouter free fallback | Minimal | Tidak ada |
| Finora `/api/ai/chat` → OpenRouter | Response model name saja; **tidak** catat input/output tokens / USD | Rate limit request saja |
| Diskusi-router → Gemini Pro | Tidak terpisah di cost ledger | Sticky session bisa naikkan biaya tanpa alert |

**Kesimpulan:** belum memenuhi FR-03 / NFR budget ($6 target, $10 hard stop). Harga aktual per model belum di-wire ke ledger.

---

## 6. Backup & rollback (Phase 0)

### 6.1 Artefak backup

| Lokasi | Isi |
|---|---|
| `/var/backups/openclaw-phase0/openclaw-config-only.tar.gz` | Archive resmi OpenClaw config (**verified**); berisi secret — **jangan commit** |
| `/var/backups/openclaw-phase0/openclaw.json.bak` | Salinan `openclaw.json.bak` |
| `/var/backups/openclaw-phase0/openclaw.json.last-good` | Last-good config |
| `prd_agent/phase0-backup/20261021T080026Z/` | Salinan non-secret: config redacted, hooks, diskusi-router, systemd units, Finora env **keys**, daily-planner `src` |

**Catatan:** `openclaw backup create --no-include-workspace` menggantung / menghasilkan temp multi-GB (session/sqlite/media). Ditunda; jalankan ulang di luar jam sibuk jika perlu restore penuh.

### 6.2 Rollback cepat (agent / config saja)

1. Hentikan perubahan routing/plugin baru.  
2. Restore config: salin kembali dari `/var/backups/openclaw-phase0/openclaw.json.last-good` → `/root/.openclaw/openclaw.json` (izin `600`).  
3. `systemctl --user restart openclaw-gateway`  
4. Verifikasi: `openclaw channels status`, `openclaw status`  
5. Pastikan `finora-vira` masih hanya memproses prefix `finora` (hindari double reply).  
6. **Jangan** rollback data MongoDB Finora hanya karena gagal ganti agent.

Detail prosedur lebih lengkap: `prd_agent/ROLLBACK_NOTES.md`.

---

## 7. Gap analysis vs PRD

| ID | Requirement | Gap | Prioritas |
|---|---|---|---|
| G-01 | Task router deterministik (`/saldo` tanpa LLM) | Belum ada di OpenClaw; Vira punya totals via prefix tapi bukan `/saldo` balance account | P0 Phase 1 |
| G-02 | Cost ledger + budget hard limit $10 | Tidak ada | P0 Phase 1 |
| G-03 | Optimasi konteks/session/output | Diskusi-router bisa naik ke Pro; heartbeat OK kosong; belum ada batas output terpusat | P0 Phase 1 |
| G-04 | Finora Assistant API + S2S auth | Endpoint assistant belum ada; auth hanya session cookie | P0 Phase 2 |
| G-05 | Transaction preview + confirm + idempotency | Vira write-immediate | P0 Phase 2 (risiko keamanan/keuangan) |
| G-06 | Agent adapter kontrak stabil | Belum ada lapisan adapter bersama | Phase 2–3 |
| G-07 | Hermes staging terisolasi | Hermes tidak terpasang | Phase 3 |
| G-08 | Benchmark dataset 90 cases | Belum ada | Phase 4 |
| G-09 | DeepSeek sebagai model ekonomis utama | Saat ini Gemini Flash primary | Phase 1 config candidate |
| G-10 | Satu agent pemilik kanal produksi | OpenClaw + Vira + Daily Planner sudah berbagi nomor dengan isolasi prefix/webhook — migrasi Hermes harus hormati pola ini | P0 arsitektur |
| G-11 | Jangan beri shell/root/DB ke agent | OpenClaw tools profile `coding` — perlu review least-privilege sebelum perluasan Finora tools | P1 security |
| G-12 | Observability fields PRD §11 | Belum standar `request_id` / `estimated_cost_usd` / dll. | Phase 1–2 |

---

## 8. Risiko yang perlu diingat sebelum Phase 1

1. **Dua client WhatsApp pada nomor yang sama** (OpenClaw multi-device + Baileys Vira) — fragile; perubahan channel policy harus diuji smoke.  
2. **Vira write tanpa konfirmasi** bertentangan dengan FR-06; Phase 1 jangan memperluas write path OpenClaw ke Finora sebelum Phase 2 API.  
3. **forward-wa.sh** mem-forward semua teks WA ke daily-planner (fire-and-forget) — potensi noise/token di jalur planner.  
4. **diskusi-router** mudah naik ke model mahal via kata pemicu; relevan untuk cost baseline.  
5. Backup state penuh belum berhasil dalam audit ini.

---

## 9. Rekomendasi masuk Phase 1

Urutan kerja yang selaras PRD + state aktual:

1. Baseline biaya OpenClaw (log provider/model/tokens bila tersedia; sampling 7 hari).  
2. Task routing ringan di sisi OpenClaw **tanpa** menyentuh write Finora: perintah read-only keuangan tetap lewat Vira prefix atau (nanti) Assistant API.  
3. Cost ledger + alert 70%/85% + hard stop request LLM (bukan prompt).  
4. Batasi/ kompaksi konteks; review `diskusi-router` vs budget.  
5. Evaluasi DeepSeek sebagai primary kandidat **setelah** baseline Gemini tercatat.  
6. Jangan instal Hermes sampai Phase 2 API + Phase 1 ledger siap.

**Prinsip tetap:** Agent bisa diganti; kontrak API Finora, business logic, dan data keuangan harus stabil.

---

## 10. Deliverable checklist Phase 0

- [x] Inventarisasi konfigurasi OpenClaw (versi, model, channel, skills, hooks, tools)
- [x] Pemetaan endpoint Finora yang tersedia
- [x] Identifikasi cara hitung biaya token (kemampuan & gap)
- [x] Backup konfigurasi (config-only verified + redacted snapshot + systemd)
- [x] Dokumentasi rollback ringkas
- [x] Gap analysis → file ini
- [ ] Full state backup OpenClaw (ditunda — timeout/size)

**Phase 1:** selesai — lihat `prd_agent/PHASE1_BASELINE.md`.

**Next:** observasi baseline biaya 7 hari, lalu Phase 2 — Finora Assistant API.
