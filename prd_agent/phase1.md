# PRD — Personal AI Assistant Cost Optimization
## OpenClaw + Hermes + WhatsApp + Finora

**Versi:** 1.0  
**Tanggal:** 21 Oktober 2026  
**Status:** Ready for Technical Planning  
**Prioritas:** High  
**Deployment:** VPS  
**Budget AI API:** USD 5–10/bulan

---

## 1. Executive Summary

### 1.1 Latar Belakang

Pengguna telah memiliki OpenClaw sebagai asisten pribadi dengan WhatsApp sebagai kanal komunikasi utama. Asisten digunakan untuk membantu kebutuhan harian, termasuk reminder dan kalender.

Pengguna juga memiliki Finora, aplikasi personal finance berbasis Next.js dengan backend yang menangani data dan perhitungan keuangan.

Terdapat kebutuhan untuk mengurangi biaya API AI, meningkatkan efisiensi penggunaan token, dan mengevaluasi apakah Hermes Agent memberikan keuntungan yang cukup dibandingkan OpenClaw.

### 1.2 Tujuan Produk

Membangun arsitektur asisten pribadi yang:

1. Mengoptimalkan penggunaan token dan biaya API.
2. Mempertahankan fungsi OpenClaw yang sudah berjalan.
3. Menguji Hermes tanpa mengganggu layanan produksi.
4. Mengintegrasikan asisten dengan Finora melalui API yang aman.
5. Mendukung penggantian agent tanpa perlu mengubah backend Finora.
6. Mencegah AI mengubah saldo atau melakukan transaksi tanpa otorisasi.
7. Menyediakan pengukuran biaya, performa, dan keberhasilan tugas.

### 1.3 Keputusan Arsitektur

- OpenClaw tetap menjadi agent produksi pada tahap awal.
- Hermes berjalan sebagai kandidat pengganti di lingkungan staging.
- DeepSeek menjadi kandidat provider utama untuk tugas rutin.
- OpenRouter menjadi opsi fallback atau akses ke model alternatif.
- Finora tetap menjadi sumber kebenaran seluruh data keuangan.
- Perhitungan finansial dilakukan oleh backend, bukan LLM.
- Migrasi produksi hanya dilakukan setelah hasil benchmark memenuhi kriteria penerimaan.

---

## 2. Scope

### 2.1 In Scope

- Optimasi konfigurasi OpenClaw.
- Instalasi Hermes di lingkungan terisolasi.
- Integrasi WhatsApp.
- Routing model berdasarkan jenis tugas.
- Pengendalian biaya API.
- Pemangkasan konteks percakapan.
- Integrasi read-only dengan Finora.
- Pembuatan transaksi dengan konfirmasi eksplisit.
- Reminder dan kalender.
- Logging dan evaluasi penggunaan token.
- Benchmark OpenClaw versus Hermes.
- Backup, rollback, dan prosedur migrasi.

### 2.2 Out of Scope

- Mengganti atau menulis ulang Finora.
- Mengganti database Finora.
- Menjadikan LLM sebagai mesin perhitungan finansial.
- Mengizinkan agent menjalankan query database secara langsung.
- Memberikan akses shell atau root VPS kepada agent.
- Menjalankan kedua agent secara bersamaan pada satu kanal produksi tanpa isolasi.
- Membuat model AI sendiri.
- Menjamin biaya selalu berada di bawah budget hanya berdasarkan instruksi prompt.

---

## 3. User Stories

| ID | User Story | Prioritas |
|---|---|---|
| US-01 | Sebagai pengguna, saya ingin bertanya melalui WhatsApp tanpa harus membuka Finora. | P0 |
| US-02 | Saya ingin memeriksa saldo dan pengeluaran tanpa pemanggilan model yang tidak perlu. | P0 |
| US-03 | Saya ingin AI membantu menjelaskan kondisi keuangan berdasarkan data Finora. | P0 |
| US-04 | Saya ingin menerima reminder dan menggunakan workflow kalender yang sudah tersedia. | P0 |
| US-05 | Saya ingin mengetahui biaya token per hari dan per tugas. | P0 |
| US-06 | Saya ingin membandingkan biaya OpenClaw dan Hermes secara objektif. | P0 |
| US-07 | Saya ingin transaksi keuangan memerlukan konfirmasi sebelum disimpan. | P0 |
| US-08 | Saya ingin dapat kembali ke OpenClaw jika migrasi Hermes gagal. | P1 |
| US-09 | Saya ingin menggunakan model yang lebih kuat hanya untuk tugas kompleks. | P1 |

---

## 4. Functional Requirements

### FR-01 — WhatsApp Gateway

Sistem harus:

- Menerima pesan WhatsApp melalui integrasi agent yang telah dikonfigurasi.
- Mengidentifikasi pengguna berdasarkan identitas WhatsApp yang diizinkan.
- Menolak permintaan dari nomor yang tidak masuk allowlist.
- Menangani pesan teks dan respons tool secara konsisten.
- Mencegah pemrosesan ganda terhadap pesan yang sama.
- Mempertahankan session dan konteks percakapan sesuai kebijakan retensi.

Kriteria penerimaan:

- Pesan dari pengguna yang diizinkan dapat diproses.
- Pesan dari pengguna yang tidak diizinkan tidak dapat mengakses data Finora.
- Retry webhook tidak menyebabkan transaksi atau reminder ganda.

### FR-02 — Model Router

Sistem harus memiliki lapisan routing yang memetakan jenis tugas ke model yang sesuai.

| Jenis tugas | Jalur pemrosesan |
|---|---|
| `/saldo` | Endpoint Finora langsung |
| `/pengeluaran` | Endpoint ringkasan Finora |
| Reminder sederhana | Parser, scheduler, atau LLM ringan jika diperlukan |
| Percakapan umum | Model ekonomis |
| Analisis anggaran | Model ekonomis dengan ringkasan data terstruktur |
| Analisis kompleks | Model lebih kuat jika diperlukan |
| Provider gagal | Fallback sesuai kebijakan |

Persyaratan:

- Model tidak boleh memilih provider tanpa kebijakan yang ditetapkan.
- Fallback tidak boleh menghasilkan transaksi ganda.
- Perubahan model harus dapat dilakukan melalui konfigurasi.
- Model yang tidak mendukung tool calling sesuai kebutuhan tidak boleh digunakan untuk workflow yang memerlukannya.

### FR-03 — Token dan Cost Management

Sistem harus mencatat:

- Provider dan model.
- Jumlah input token.
- Jumlah output token.
- Biaya estimasi per request.
- Jenis tugas.
- Waktu respons.
- Status berhasil atau gagal.
- Jumlah tool call.
- Penggunaan fallback.
- ID korelasi request.

Persyaratan optimasi:

- Batasi panjang output.
- Batasi riwayat percakapan yang dikirim.
- Gunakan ringkasan percakapan jika sesuai.
- Jangan mengirim seluruh riwayat transaksi ke LLM.
- Jangan memanggil LLM untuk operasi deterministik.
- Hindari retry tanpa batas.
- Jangan mencatat API key, password, atau data keuangan mentah ke log.

Biaya harus dihitung berdasarkan harga aktual model yang dikonfigurasi, termasuk perbedaan harga input, output, cache, dan provider.

### FR-04 — Finora API Integration

Agent hanya boleh mengakses API assistant khusus yang menyediakan data minimum.

Endpoint konseptual:

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/assistant/balance` | Membaca saldo |
| GET | `/api/assistant/summary` | Membaca ringkasan keuangan |
| GET | `/api/assistant/transactions` | Membaca transaksi dengan filter |
| GET | `/api/assistant/budgets` | Membaca anggaran |
| GET | `/api/assistant/debts` | Membaca ringkasan utang |
| POST | `/api/assistant/transactions/preview` | Memvalidasi draft transaksi |
| POST | `/api/assistant/transactions/confirm` | Menyimpan transaksi setelah konfirmasi |

Endpoint tersebut merupakan rancangan yang perlu disesuaikan dengan API Finora yang sudah tersedia. Jangan menganggap endpoint ini sudah ada.

Persyaratan:

- Autentikasi server-to-server.
- Otorisasi per pengguna.
- Validasi parameter menggunakan schema.
- Pembatasan jumlah data dan rentang tanggal.
- Respons ringkas dan terstruktur.
- Penggunaan integer untuk nilai uang sesuai konvensi Finora.
- Idempotency key untuk operasi tulis.
- Audit log untuk mutasi data.
- Rate limiting.
- Timeout dan penanganan kegagalan API.

Jangan memberikan kredensial database kepada agent.

### FR-05 — Financial Assistant

Contoh perintah yang harus didukung:

- `/saldo`
- `/pengeluaran`
- `/budget`
- `/utang`
- "Berapa total pengeluaran saya bulan ini?"
- "Kategori apa yang paling banyak menghabiskan uang?"
- "Bagaimana cara mengurangi pengeluaran bulan depan?"

Alur:

1. Agent mengidentifikasi intent.
2. Agent memanggil endpoint Finora yang diizinkan.
3. Backend menghitung saldo dan agregat keuangan.
4. Agent menerima hasil terstruktur.
5. LLM menyusun penjelasan bila dibutuhkan.
6. Respons dikirim ke WhatsApp.

LLM tidak boleh mengarang data ketika API gagal atau data tidak tersedia. Respons harus menyatakan bahwa data belum berhasil diambil.

### FR-06 — Transaction Confirmation

Pembuatan transaksi harus mengikuti alur:

1. Pengguna menyampaikan transaksi.
2. Agent menyusun draft.
3. Backend memvalidasi nominal, kategori, tanggal, mata uang, dan jenis transaksi.
4. Agent menampilkan ringkasan draft.
5. Pengguna memberikan konfirmasi eksplisit.
6. Backend memeriksa kembali draft dan otorisasi.
7. Backend menyimpan transaksi dengan idempotency protection.
8. Agent menampilkan hasil dari backend.

Jika nominal, kategori, jenis transaksi, atau tanggal berubah setelah konfirmasi, sistem harus meminta konfirmasi baru.

Pesan yang ambigu tidak boleh otomatis disimpan.

### FR-07 — Reminder dan Calendar

- Pertahankan integrasi yang telah berjalan.
- Jangan mengganti scheduler produksi selama fase evaluasi.
- Pastikan timezone konsisten.
- Terapkan deduplication untuk reminder.
- Jangan mengirim reminder yang sama dari dua agent.
- Catat status penjadwalan dan pengiriman tanpa menyimpan isi percakapan yang tidak diperlukan.

### FR-08 — Agent Adapter

Buat lapisan integrasi agar OpenClaw dan Hermes menggunakan kontrak API Finora yang sama.

Tanggung jawab adapter:

- Validasi input.
- Pemanggilan API.
- Normalisasi respons.
- Timeout dan error handling.
- Pencatatan biaya.
- Pengendalian akses.
- Penanganan idempotensi.

Jangan membangun ketergantungan pada format internal salah satu agent untuk business logic Finora.

---

## 5. Non-Functional Requirements

### NFR-01 — Security

- Simpan secret dalam environment atau secret manager.
- Jangan commit `.env` ke repository.
- Gunakan least-privilege credentials.
- Batasi akses jaringan ke endpoint Finora.
- Jangan mengekspos endpoint internal ke internet tanpa perlindungan.
- Terapkan HTTPS bila komunikasi melewati jaringan publik.
- Sanitasi pesan sebelum digunakan sebagai input tool.
- Perlakukan isi pesan WhatsApp, dokumen, dan hasil tool sebagai input tidak tepercaya.
- Pisahkan permission membaca dan menulis transaksi.
- Sediakan mekanisme pencabutan token agent.

### NFR-02 — Privacy

- Minimalkan data pribadi yang dikirim ke provider AI.
- Kirim agregat keuangan, bukan seluruh riwayat, jika cukup.
- Jangan mengirim kredensial atau data autentikasi ke LLM.
- Tetapkan retensi log dan session.
- Dokumentasikan provider yang menerima data dan konfigurasi retensinya.

### NFR-03 — Reliability

- Terapkan timeout untuk API dan provider model.
- Gunakan retry terbatas dengan backoff.
- Hindari retry untuk operasi tulis yang statusnya belum diketahui sebelum melakukan rekonsiliasi.
- Sediakan fallback untuk kegagalan model.
- Sediakan health check dan prosedur restart.
- Simpan backup konfigurasi sebelum deployment.

### NFR-04 — Performance

Target awal untuk pengujian:

- Respons perintah saldo melalui jalur langsung: p95 di bawah 2 detik jika infrastruktur dan backend mendukung.
- Respons AI sederhana: p95 di bawah 8 detik.
- Tidak ada duplikasi transaksi pada pengujian retry.
- Tidak ada akses data lintas pengguna.

Target latensi adalah sasaran pengujian, bukan jaminan.

---

## 6. Architecture

### Logical Components

1. **WhatsApp Gateway** — menerima dan mengirim pesan.
2. **Agent Runtime** — OpenClaw atau Hermes.
3. **Task Router** — menentukan jalur pemrosesan.
4. **Model Provider Adapter** — integrasi DeepSeek atau OpenRouter.
5. **Finora Assistant API** — lapisan akses data keuangan.
6. **Finora Backend** — validasi, perhitungan, dan penyimpanan.
7. **Cost Ledger** — pencatatan penggunaan token dan biaya.
8. **Scheduler** — reminder dan pekerjaan terjadwal.

### Deployment Phases

**Phase A — OpenClaw Production**

OpenClaw tetap menjadi satu-satunya agent produksi untuk WhatsApp.

**Phase B — Hermes Staging**

Hermes dijalankan pada proses, konfigurasi, dan sesi pengujian terpisah. Gunakan akun atau nomor uji yang sesuai dengan kemampuan integrasi.

**Phase C — Benchmark**

Kedua agent diuji dengan dataset tugas yang sama dan backend Finora yang sama dalam lingkungan pengujian.

**Phase D — Controlled Migration**

Jika hasil pengujian memenuhi kriteria, pindahkan workflow secara bertahap. Hanya satu agent yang menjadi pemilik kanal produksi pada satu waktu.

---

## 7. Budget and Cost Model

### Monthly Budget

| Komponen | Batas |
|---|---:|
| Model utama | $6 |
| Cadangan provider/model | $2 |
| Buffer | $2 |
| Total | $10/bulan |

Budget merupakan batas perencanaan, bukan perkiraan biaya pasti.

### Formula Biaya

Untuk setiap model:

`Biaya = (input_tokens × input_price + output_tokens × output_price + biaya lain) / 1.000.000`

Gunakan tarif aktual untuk masing-masing jenis token. Jangan menerapkan satu harga global jika terdapat perbedaan cache, model, atau periode tarif.

### Budget Enforcement

- Target penggunaan bulanan: $6.
- Peringatan pada 70% dan 85% budget.
- Hard limit: $10.
- Saat hard limit tercapai, nonaktifkan request AI baru atau gunakan jalur non-LLM yang diizinkan.
- Operasi keuangan tetap dapat membaca data melalui endpoint deterministik apabila layanan backend tersedia.
- Hard limit harus diterapkan melalui middleware atau provider control yang benar-benar menolak request, bukan sekadar instruksi prompt.

---

## 8. Benchmark Plan

### Test Dataset

Buat dataset yang sama untuk OpenClaw dan Hermes, mencakup:

1. 20 perintah saldo dan ringkasan.
2. 20 pertanyaan analisis pengeluaran.
3. 20 pertanyaan umum.
4. 10 perintah reminder.
5. 10 draft transaksi.
6. 10 kasus ambigu atau gagal.

Jumlah awal: 90 test cases.

Untuk hasil yang dapat dibandingkan, gunakan input, data Finora, kebijakan tools, batas output, dan model yang setara. Lakukan pengulangan untuk mengukur variasi.

### Metrics

| Metric | Tujuan |
|---|---|
| Cost per successful task | Mengukur efisiensi biaya |
| Input/output tokens | Mengukur pemakaian token |
| Task success rate | Mengukur keberhasilan |
| Factual accuracy | Mengukur ketepatan jawaban |
| Tool-call success rate | Mengukur integrasi |
| p50/p95 latency | Mengukur kecepatan |
| Duplicate side effects | Memastikan idempotensi |
| Unauthorized access | Memastikan keamanan |

### Acceptance Criteria

- Keberhasilan tugas rutin minimal 95%.
- Jawaban saldo dan transaksi harus 100% cocok dengan hasil backend pada test set.
- Tidak ada transaksi tanpa konfirmasi.
- Tidak ada akses data lintas pengguna.
- Tidak ada efek samping ganda pada pengujian retry.
- Biaya proyeksi penggunaan aktual tidak melebihi $10/bulan.
- Kandidat migrasi harus menunjukkan penghematan biaya atau peningkatan kualitas yang terukur tanpa menurunkan keamanan maupun reliabilitas.

Gunakan benchmark 7–14 hari untuk pengujian operasional setelah test set lulus.

---

## 9. Implementation Roadmap

### Phase 0 — Discovery and Audit

- Inventarisasi konfigurasi OpenClaw.
- Catat versi, model, channel, skills, scheduler, dan tools.
- Petakan endpoint Finora yang sudah tersedia.
- Identifikasi cara menghitung biaya token.
- Backup konfigurasi dan dokumentasikan rollback.

**Deliverable:** `CURRENT_STATE.md`, konfigurasi backup, dan gap analysis.

### Phase 1 — Cost Optimization

- Implementasi task routing.
- Optimasi session dan konteks.
- Tambahkan cost ledger.
- Atur batas output.
- Implementasi peringatan biaya.
- Uji jalur langsung untuk perintah saldo.

**Deliverable:** OpenClaw yang telah dioptimalkan dan laporan baseline biaya.

### Phase 2 — Finora Assistant API

- Tambahkan endpoint khusus asisten jika belum tersedia.
- Terapkan autentikasi dan otorisasi.
- Tambahkan validasi schema.
- Implementasikan transaction preview dan confirmation.
- Tambahkan audit log serta idempotency.

**Deliverable:** dokumentasi API dan test suite.

### Phase 3 — Hermes Staging

- Instalasi Hermes dengan konfigurasi terisolasi.
- Konfigurasi provider model.
- Hubungkan ke Finora Assistant API.
- Konfigurasikan tools dengan permission minimum.
- Uji reminder, kalender, dan workflow keuangan.

**Deliverable:** Hermes staging yang lulus smoke test.

### Phase 4 — Benchmark

- Jalankan dataset identik.
- Rekam biaya dan token aktual.
- Bandingkan kualitas jawaban.
- Uji timeout, fallback, retry, dan security.
- Buat laporan keputusan.

**Deliverable:** `BENCHMARK_REPORT.md`.

### Phase 5 — Migration Decision

- Migrasi workflow terpilih jika lolos acceptance criteria.
- Pertahankan OpenClaw sebagai rollback target.
- Hindari dua agent aktif pada kanal produksi yang sama.
- Pantau error dan biaya setelah perpindahan.

**Deliverable:** rencana migrasi final dan rollback runbook.

---

## 10. Testing Requirements

### Unit Tests

- Intent classification.
- Cost calculation.
- Input validation.
- Budget enforcement.
- Transaction state machine.
- Idempotency key handling.
- Model routing.
- Response normalization.

### Integration Tests

- Agent ke Finora API.
- Agent ke provider model.
- WhatsApp webhook ke agent.
- Reminder scheduler.
- Provider failure dan fallback.
- Finora timeout.
- Token budget exhaustion.

### Security Tests

- Nomor WhatsApp tidak terotorisasi.
- Token API tidak valid.
- Akses data pengguna lain.
- Prompt injection melalui pesan atau hasil tool.
- Percobaan melewati konfirmasi transaksi.
- Replay request transaksi.
- Kebocoran secret melalui log.
- Penggunaan tool di luar allowlist.

### Regression Tests

Semua workflow OpenClaw yang sudah berjalan harus tetap berfungsi setelah optimasi konfigurasi.

---

## 11. Observability

Minimal log fields:

- `request_id`
- `agent_name`
- `task_type`
- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `estimated_cost_usd`
- `latency_ms`
- `tool_call_count`
- `status`
- `fallback_used`
- `error_code`

Jangan mencatat isi transaksi lengkap, secret, atau seluruh riwayat chat ke log operasional secara default.

Dashboard atau laporan harus menampilkan:

- Biaya hari ini dan bulan berjalan.
- Penggunaan token per model.
- Biaya per jenis tugas.
- Persentase keberhasilan.
- Jumlah fallback.
- Error rate.
- Status budget.

---

## 12. Rollback Plan

Rollback harus dapat dilakukan tanpa memodifikasi data keuangan.

1. Hentikan penerimaan pesan produksi oleh agent baru.
2. Nonaktifkan routing produksi menuju Hermes jika Hermes menjadi kandidat yang dipromosikan.
3. Aktifkan kembali OpenClaw menggunakan konfigurasi backup.
4. Verifikasi WhatsApp, reminder, dan akses Finora.
5. Periksa antrean pesan agar tidak ada pengiriman ganda.
6. Pastikan tidak ada transaksi yang berada pada status ambigu.
7. Rekonsiliasi request yang statusnya belum diketahui.
8. Catat penyebab rollback dan pertahankan bukti pengujian.

Data Finora tidak boleh di-rollback hanya untuk membatalkan pergantian agent.

---

## 13. Repository and Deliverables

Struktur yang disarankan untuk komponen integrasi terpisah:

```text
personal-ai-assistant/
├── docs/
│   ├── PRD.md
│   ├── SYSTEM_DESIGN.md
│   ├── API_SPECIFICATION.md
│   ├── SECURITY.md
│   ├── BENCHMARK_PLAN.md
│   └── ROLLBACK_RUNBOOK.md
├── src/
│   ├── router/
│   ├── providers/
│   ├── finora-client/
│   ├── cost-ledger/
│   ├── policy/
│   └── observability/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── fixtures/
├── config/
│   └── routing.example.yaml
├── scripts/
├── .env.example
└── README.md
```

Struktur tersebut merupakan usulan untuk adapter dan tooling bersama. Jangan memindahkan repository atau mengubah struktur internal OpenClaw, Hermes, maupun Finora tanpa audit terlebih dahulu.

---

## 14. Definition of Done

Proyek dianggap selesai apabila:

- [ ] OpenClaw tetap berfungsi selama fase staging.
- [ ] Hermes dapat diuji tanpa mengganggu produksi.
- [ ] WhatsApp dapat menjalankan workflow yang disepakati.
- [ ] Perintah saldo menggunakan jalur deterministik.
- [ ] Finora API memiliki autentikasi dan otorisasi yang memadai.
- [ ] Operasi transaksi memerlukan konfirmasi dan idempotensi.
- [ ] Penggunaan token dan biaya tercatat.
- [ ] Budget enforcement telah diuji.
- [ ] Benchmark menghasilkan data yang dapat dibandingkan.
- [ ] Target keamanan dan kualitas tercapai.
- [ ] Dokumentasi deployment dan rollback tersedia.
- [ ] Keputusan migrasi didasarkan pada hasil pengujian.

---

## 15. Final Recommendation

Mulai dari optimasi OpenClaw, bukan migrasi langsung. Gunakan DeepSeek sebagai kandidat model ekonomis, pertahankan OpenRouter sebagai opsi alternatif, dan tempatkan Finora Assistant API sebagai lapisan kontrol antara agent dan data keuangan.

Hermes hanya dipromosikan ke produksi jika benchmark menunjukkan keuntungan yang terukur dalam biaya atau kualitas tanpa meningkatkan risiko keamanan.

**Prinsip arsitektur utama: Agent dapat diganti; kontrak API, business logic, data keuangan, dan kebijakan keamanan harus tetap stabil.**
