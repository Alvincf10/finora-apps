# Finora

**Finora** = **Fin**ance + **ora** (horizon) — finance yang jelas ke depannya (*finance with a clear horizon*).

Aplikasi personal finance management (Phase 1 + Phase 2 + Finora 2.0).

- **Phase 1** — ledger: accounts, transactions, budget, debts, goals, dashboard
- **Phase 2** — financial intelligence: smart budget, insights, forecast, simulator, monthly review
- **Finora 2.0** — deterministic decision system: financial health, horizon cash-flow, Decision Lab, Action Center, Command Center (tanpa AI/LLM di engine)

PRD: `prd/phase1.md`, `prd/phase2.md`, `prd/phase4.md` · Audit: `docs/phase0-audit.md`

---

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router), React, TypeScript, Tailwind, shadcn/ui, Recharts |
| Backend | Next.js Route Handlers, Zod |
| Database | MongoDB + Mongoose |
| Auth | Auth.js (credentials / email + password) |
| AI (opsional) | OpenRouter abstraction — penjelasan saja, tidak mengubah data uang |

---

## Prerequisites

- **Node.js** 20+ (disarankan LTS)
- **MongoDB** lokal atau MongoDB Atlas
- npm

Cek MongoDB lokal:

```bash
# Homebrew (macOS)
brew services start mongodb-community

# atau pastikan port 27017 terbuka
nc -z 127.0.0.1 27017 && echo "Mongo OK"
```

---

## Cara running (local)

### 1. Install dependencies

```bash
cd finora
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Isi minimal di `.env.local`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/finora
AUTH_SECRET=ganti-dengan-string-acak-minimal-32-karakter
AUTH_URL=http://localhost:3010
AUTH_TRUST_HOST=true
NEXT_PUBLIC_APP_NAME=Finora

# Opsional — tombol "AI explain" di dashboard
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Generate `AUTH_SECRET` cepat:

```bash
openssl rand -base64 32
```

### 3. Jalankan development server

```bash
npm run dev
```

Buka:

- [http://localhost:3010](http://localhost:3010)

### 3b. WhatsApp Vira (opsional)

Vira memakai Baileys di **proses terpisah** (bukan di dalam `next dev`).

```bash
# terminal 1
npm run dev

# terminal 2
npm run wa:vira
```

Lalu di app: menu **WhatsApp (Vira)** → pilih rekening default → **Connect** → scan QR dari HP.

Auth session tersimpan di `.wa-auth/` (diabaikan Git). QR yang expired diganti otomatis di halaman yang sama.

#### Cara ngetik di WhatsApp

Kirim ke chat diri sendiri (atau nomor yang diizinkan). Format: **deskripsi + jumlah** (jumlah di akhir).

**Satu nomor dengan OpenClaw:** selalu awali perintah Finora dengan `finora ` (kata + spasi). Pesan tanpa prefix itu diabaikan Vira (biar OpenClaw yang jawab). Ubah/matikan lewat `WA_PREFIX` di `.env.local` (`WA_PREFIX=` = tanpa prefix).

| Contoh | Arti |
| --- | --- |
| `finora makan 50rb` | Expense Food Rp50.000 |
| `finora makan di soto belok 50rb` | Deskripsi lengkap + Food |
| `finora kopi 35k` | Expense Food Rp35.000 |
| `finora gojek 25.000` | Expense Transport Rp25.000 |
| `finora isi bensin 200rb` | Expense Fuel Rp200.000 |
| `finora bayar parkir 5rb` | Expense Parking Rp5.000 |
| `finora isi flazz 100rb` | Expense Parking (Flazz/e-toll) |
| `finora gaji 10jt` | Income Salary |
| `finora total pengeluaran` | Total expense bulan ini |
| `finora pengeluaran hari ini` | Total expense hari ini |
| `finora ringkasan` | Pengeluaran + pemasukan |
| `finora help` | Daftar contoh di WA |

Juga diterima: `finora:makan 50rb`, `finora.makan 50rb`. Jumlah: `50rb`, `35k`, `25.000`, `1.5jt`, `10 juta`.

**OpenClaw (sisi lain):** biar tidak dobel jawab, ajarin / set OpenClaw agar **tidak membalas** pesan yang diawali `finora` (case-insensitive). Contoh instruksi sistem OpenClaw:

```text
Jika pesan user diawali "finora" (atau "finora:" / "finora."), JANGAN balas sama sekali.
Pesan itu ditangani aplikasi Finora, bukan kamu.
```

Kalau OpenClaw punya filter/ignore-prefix di config, tambahkan `finora` di sana.

> Port default app ini **3010** (3000 biasanya Umami; 3001–3003 sering bentrok).
> `127.0.0.1:3010` juga bisa.

### 4. Akun pertama

1. Buka `/register`
2. Buat akun (email + password min. 8 karakter)
3. Login → buat **Account** → catat **Transaction**
4. Baru pakai Budget / Smart Budget / Insights

> Insight & smart budget lebih berguna kalau ada data history (idealnya ≥ 2–3 bulan transaksi).

---

## Production build (local)

```bash
npm run build
npm run start
```

App listen di port `3010`.

Hasil build (`.next/`, `out/`, `build/`, `dist/`) diabaikan Git — jangan di-commit.

---

## Scripts

| Command | Fungsi |
| --- | --- |
| `npm run dev` | Development (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Jalankan hasil build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest — regresi engine Finora 2.0 (metrics, forecast, scenarios, …) |
| `npm run test:watch` | Vitest watch mode |
| `npm run smoke:money` | Smoke test util uang (minor units) |
| `npm run smoke:phase2` | Smoke test math Phase 2 |
| `npm run smoke:wa-parse` | Smoke test parser nominal WA |
| `npm run wa:vira` | Worker Baileys (asisten WhatsApp Vira) |

---

## Fitur & halaman

### Phase 1 — Money core

| Route | Isi |
| --- | --- |
| `/dashboard` | Financial Command Center (health, forecast, actions, roadmap) |
| `/transactions` | Income / expense / transfer |
| `/accounts` | Rekening & saldo |
| `/budget` | Budget bulanan per kategori |
| `/debts` | Hutang + pembayaran + preview tenor |
| `/goals` | Target tabungan / Tangga Ternak Uang |
| `/reports` | Ringkasan chart |
| `/settings` | Profil & theme |
| `/whatsapp` | Vira: status WA, QR scan, rekening default |

### Phase 2 — Intelligence

| Route | Isi |
| --- | --- |
| `/budget/recommendation` | Smart Budget (generate → adjust → accept) |
| `/insights` | Action Center + evidence (dedup prioritas) |
| `/reports/monthly` | Monthly review & vs bulan lalu |
| `/simulator` | Decision Lab — what-if, debt, emergency, skenario tersimpan |

### Finora 2.0 — Deterministic decision system

| Kapabilitas | Isi |
| --- | --- |
| Financial Health | Status (Stable / Tight / At Risk / Critical), runway, free cash, debt burden |
| Cash-flow forecast | Horizon 30/60/90 hari — events, projected balance, risk windows |
| Decision Lab | Bandingkan skenario (extra payment, delay, allocate) tanpa write ledger |
| Action Center | Rekomendasi terprioritas + issue key (hindari duplikat) |
| Command Center | Satu payload untuk dashboard: health + forecast + actions + payday + roadmap |
| Roadmap | Provenance Tangga Ternak Uang (progress, gap, next step) |

### API utama

```text
/api/accounts
/api/transactions
/api/budgets
/api/debts
/api/debts/preview-tenor
/api/goals
/api/dashboard

/api/analytics
/api/budget/recommendation
/api/insights
/api/forecast
/api/simulator
/api/reports/monthly
/api/financial-context
/api/ai/chat
/api/whatsapp

# Finora 2.0
/api/financial-health
/api/cash-flow-forecast
/api/scenarios
/api/scenarios/[id]
/api/action-center
/api/command-center
/api/roadmap/ensure-starter
```

---

## Aturan penting (uang & AI)

- Jumlah disimpan sebagai **integer minor units** (IDR = rupiah utuh, EUR = cents).
- Transfer **bukan** expense.
- Semua angka finansial dihitung **backend (deterministic)** — metrik pay-cycle-aware.
- Finora 2.0 **tidak memakai AI/LLM** untuk health, forecast, skenario, atau Action Center.
- AI / OpenRouter **tidak boleh** menulis transaksi, saldo, budget, atau hutang (opsional: penjelasan teks saja).
- Tidak ada silent write ke ledger: skenario Decision Lab & rekomendasi butuh aksi user.
- WhatsApp Vira menulis transaksi lewat **parser deterministik** → `createTransaction` (bukan OpenRouter).
- Smart Budget **tidak** menimpa budget sebelum user klik Accept.

---

## Troubleshooting

**Tidak bisa login / tombol Sign in tidak bereaksi**

- Pakai `http://localhost:3010` atau `http://127.0.0.1:3010` secara konsisten.
- Hard refresh browser.
- Pastikan `AUTH_SECRET` dan `AUTH_URL` di `.env.local` terisi, lalu restart `npm run dev`.

**Error Mongo / register gagal**

- Pastikan MongoDB running dan `MONGODB_URI` benar.
- Untuk Atlas, pakai connection string lengkap + user/password.

**Port 3010 sudah dipakai**

```bash
lsof -ti:3010 | xargs kill -9
npm run dev
```

**OpenRouter / AI explain gagal**

- Normal jika `OPENROUTER_API_KEY` kosong. Fitur ledger tetap jalan tanpa AI.

---

## Struktur singkat

```text
src/
  app/                 # pages + API routes
  components/          # UI + app shell
  lib/financial/       # engine Phase 1, Phase 2, Finora 2.0
    metrics/           # summary + financial health
    forecast/          # horizon cash-flow
    decision/          # Decision Lab scenarios
    recommendations/   # Action Center
  lib/ai/              # OpenRouter provider (opsional)
  models/              # Mongoose schemas (incl. Scenario)
prd/
  phase1.md
  phase2.md
  phase4.md            # Finora 2.0 PRD
docs/
  phase0-audit.md
scripts/
  smoke-money.mjs
  smoke-phase2.mjs
vitest.config.ts
```
