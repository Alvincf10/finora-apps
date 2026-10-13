# Finora

**Finora** = **Fin**ance + **ora** (horizon) — finance yang jelas ke depannya (*finance with a clear horizon*).

Aplikasi personal finance management (Phase 1 + Phase 2).

- **Phase 1** — ledger: accounts, transactions, budget, debts, goals, dashboard
- **Phase 2** — financial intelligence: smart budget, insights, forecast, simulator, monthly review

PRD: `prd/phase1.md`, `prd/phase2.md`

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
| `npm run smoke:money` | Smoke test util uang (minor units) |
| `npm run smoke:phase2` | Smoke test math Phase 2 |

---

## Fitur & halaman

### Phase 1 — Money core

| Route | Isi |
| --- | --- |
| `/dashboard` | KPI, cash flow, budget, recent txs |
| `/transactions` | Income / expense / transfer |
| `/accounts` | Rekening & saldo |
| `/budget` | Budget bulanan per kategori |
| `/debts` | Hutang + pembayaran |
| `/goals` | Target tabungan |
| `/reports` | Ringkasan chart |
| `/settings` | Profil & theme |

### Phase 2 — Intelligence

| Route | Isi |
| --- | --- |
| `/budget/recommendation` | Smart Budget (generate → adjust → accept) |
| `/insights` | Recommendation center + evidence |
| `/reports/monthly` | Monthly review & vs bulan lalu |
| `/simulator` | What-if + debt scenarios + emergency fund |

### API utama

```text
/api/accounts
/api/transactions
/api/budgets
/api/debts
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
```

---

## Aturan penting (uang & AI)

- Jumlah disimpan sebagai **integer minor units** (IDR = rupiah utuh, EUR = cents).
- Transfer **bukan** expense.
- Semua angka finansial dihitung **backend (deterministic)**.
- AI / OpenRouter **tidak boleh** menulis transaksi, saldo, budget, atau hutang.
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
  lib/financial/       # engine Phase 1 & Phase 2
  lib/ai/              # OpenRouter provider
  models/              # Mongoose schemas
prd/
  phase1.md
  phase2.md
scripts/
  smoke-money.mjs
  smoke-phase2.mjs
```
