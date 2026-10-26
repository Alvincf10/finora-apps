# PRD — Finora 2.0: Deterministic Financial Intelligence

**Status:** Draft v1.0  
**Produk:** Finora Personal Finance  
**Jenis:** Product Redesign & Financial Intelligence Enhancement  
**Prioritas:** P0 — Financial Engine & Health; P1 — Roadmap & Decision Lab; P2 — Action Center & UX Consolidation  
**Pendekatan:** Deterministic-first, no AI  
**Target implementasi:** Bertahap, setelah audit codebase

---

## 1. Executive Summary

Finora adalah aplikasi personal finance untuk mengelola transaksi, rekening, budget, utang, biaya tetap, target tabungan, dan perencanaan alokasi gaji.

Finora saat ini juga memiliki financial intelligence berupa Tangga Ternak Uang, insights, alerts, weekly review, serta simulator. Namun, fitur-fitur tersebut masih tersebar dalam beberapa modul.

Finora 2.0 bertujuan mengembangkan aplikasi menjadi **Personal Financial Decision System** yang membantu pengguna:

1. Memahami kondisi keuangan aktual secara menyeluruh.
2. Menentukan prioritas keuangan berdasarkan aturan yang eksplisit.
3. Membandingkan beberapa pilihan keputusan sebelum bertindak.
4. Menyusun roadmap untuk mencapai tujuan keuangan jangka panjang.
5. Menjalankan rencana dan mengevaluasi hasilnya secara berkala.

### Prinsip utama

- Tidak menggunakan AI, LLM, atau model machine learning untuk menghasilkan perhitungan dan rekomendasi pada fase ini.
- Seluruh perhitungan finansial dilakukan melalui deterministic financial engine.
- Setiap rekomendasi harus memiliki alasan, input, formula atau rule yang dapat ditelusuri.
- Tidak ada perubahan transaksi, saldo, budget, atau alokasi uang secara otomatis tanpa tindakan pengguna.
- Memaksimalkan reuse terhadap codebase dan financial engine yang sudah ada.
- Tidak melakukan migrasi teknologi atau rewrite aplikasi tanpa justifikasi teknis.

## 2. Baseline Produk Saat Ini

Berdasarkan dokumen inventaris codebase Finora, fitur berikut sudah tersedia atau tercatat sebagai implementasi saat ini.

| Area | Kondisi baseline |
|---|---|
| Ledger | Transaksi income, expense, transfer, rekening, kategori |
| Planning | Budget, utang, fixed costs, goals |
| Payday Allocation | Waterfall envelope, draft/active/completed, settle |
| Financial intelligence | Insights, Tangga Ternak Uang, recommendations |
| Monitoring | Dashboard, alerts, weekly review |
| Simulation | What-if, skenario pelunasan utang, emergency fund |
| Analytics | Reports dan ringkasan historis |
| WhatsApp | Vira untuk pencatatan dan query deterministik |
| Technology | Next.js 16, React 19, TypeScript, Tailwind 4, MongoDB, Mongoose |
| Financial rules | Minor units, transfer bukan expense, pay-cycle-aware metrics |
| AI | Endpoint OpenRouter opsional sudah tercatat; tidak menjadi bagian dari scope PRD ini |

Dokumen ini tidak menganggap semua implementasi sudah benar atau bebas bug. Coding agent wajib memverifikasi implementasi aktual sebelum mengubahnya.

## 3. Problem Statement

### 3.1 Informasi finansial tersebar

Pengguna harus menggabungkan informasi dari dashboard, utang, goals, insights, payday, dan simulator untuk mengambil keputusan yang melibatkan beberapa aspek keuangan.

### 3.2 Rekomendasi belum terpusat

Alerts, insights, dan recommendations mempunyai fungsi yang saling berhubungan. Tanpa pengelolaan prioritas yang konsisten, rekomendasi berisiko duplikatif atau tidak menjelaskan tindakan yang paling penting.

### 3.3 Proyeksi belum menjadi pusat keputusan

Simulator sudah menyediakan perhitungan skenario tertentu, tetapi perbandingan alternatif keputusan jangka panjang belum terdokumentasi sebagai kapabilitas terintegrasi.

### 3.4 Roadmap keuangan membutuhkan transparansi

Tangga Ternak Uang memiliki tahapan berurutan. Pengguna perlu memahami dasar perhitungan progres, kriteria penyelesaian, kekurangan yang tersisa, dan konsekuensi terhadap target berikutnya.

### 3.5 Rencana dan realisasi perlu saling terhubung

Payday Allocation menyusun alokasi dana. Finora perlu membantu pengguna membandingkan rencana tersebut dengan kondisi aktual tanpa menghitung uang yang sama sebagai dana bebas dan dana yang sudah dialokasikan.

## 4. Product Vision

Finora menjadi aplikasi yang menghubungkan empat aktivitas utama:

**Understand → Decide → Execute → Review**

- **Understand:** mengetahui posisi finansial dan risiko saat ini.
- **Decide:** memilih prioritas berdasarkan data, aturan, dan tujuan.
- **Execute:** menjalankan keputusan melalui rencana alokasi yang terkontrol.
- **Review:** mengevaluasi hasil dan memperbarui rencana berdasarkan kondisi terbaru.

Finora tidak mengambil keputusan atas nama pengguna. Finora menyediakan perhitungan, opsi, konsekuensi, dan alasan yang transparan agar pengguna dapat mengambil keputusan dengan lebih baik.

## 5. Goals dan Non-Goals

### 5.1 Product goals

1. Menyediakan satu pusat informasi untuk kondisi dan prioritas keuangan.
2. Memiliki definisi metrik finansial yang konsisten di seluruh modul.
3. Mengembangkan Tangga Ternak Uang menjadi roadmap yang transparan dan dapat disesuaikan.
4. Mengembangkan simulator menjadi alat perbandingan keputusan.
5. Mengurangi duplikasi alerts dan recommendations.
6. Menghubungkan rencana alokasi dengan realisasi transaksi.
7. Menjaga semua hasil perhitungan tetap deterministic dan testable.

### 5.2 Non-goals

Tidak termasuk dalam fase ini:

- AI financial advisor, LLM, OpenRouter, atau agent reasoning.
- Automatic trading atau rekomendasi investasi berbasis prediksi pasar.
- Integrasi bank langsung atau open banking.
- Integrasi keuangan bisnis ke dalam ledger personal.
- Multi-user household finance atau shared accounts.
- Rewrite seluruh aplikasi.
- Penggantian MongoDB, Next.js, atau stack utama.
- Eksekusi transaksi keuangan otomatis.
- Prediksi return investasi yang dianggap pasti.

---

# 6. Proposed Information Architecture

## 6.1 Navigasi baru

### A. Financial Command Center

Halaman utama yang menggabungkan kondisi finansial, risiko, prioritas tindakan, dan progres target.

Komponen:
- Financial Health summary.
- Proyeksi cash flow dan risiko likuiditas.
- Prioritas tindakan.
- Progress Financial Roadmap.
- Ringkasan rencana payday aktif.
- Snapshot perubahan dari periode sebelumnya.

### B. Financial Roadmap

Pengembangan dari `/insights` dan Tangga Ternak Uang.

Komponen:
- Tahap finansial saat ini.
- Kriteria setiap tahap.
- Bukti dan perhitungan status.
- Gap menuju target berikutnya.
- Estimasi waktu berdasarkan asumsi yang dinyatakan.
- Riwayat progres dan perubahan status.

### C. Decision Lab

Pengembangan dari `/simulator`.

Komponen:
- Baseline finansial.
- Skenario alternatif.
- Perbandingan hasil.
- Dampak terhadap likuiditas, utang, tabungan, dan target.
- Asumsi yang dapat diedit.
- Penyimpanan dan pemuatan skenario.

### D. Execution Plan

Integrasi dari `/payday` dan `/budget`.

Komponen:
- Rencana alokasi gaji aktif.
- Kewajiban dan biaya tetap.
- Dana yang sudah dialokasikan.
- Sisa anggaran dan dana bebas.
- Perbandingan planned versus actual.
- Preview perubahan rencana.

### E. Financial Action Center

Lapisan prioritas yang menyatukan alerts dan recommendations.

Komponen:
- Tindakan kritis.
- Tindakan yang perlu segera diperhatikan.
- Peluang optimasi.
- Alasan dan dampak.
- Status tindakan.
- Riwayat rekomendasi dan hasilnya.

### F. Detail management

Modul berikut tetap tersedia:

- Transactions
- Accounts
- Debts
- Fixed Costs
- Goals
- Categories
- Settings
- WhatsApp Vira

**Keputusan arsitektur:** menggabungkan pengalaman dan aturan prioritas, bukan menghapus modul pengelolaan detail secara paksa.

---

# 7. Functional Requirements

## FR-01 — Financial Health Engine

**Priority: P0**

### Objective

Menyediakan representasi kondisi finansial aktual yang konsisten, dapat dijelaskan, dan dapat digunakan oleh modul lain.

### Requirements

**FR-01.1 — Financial metrics**

Engine harus menyediakan setidaknya:

- Total income untuk periode yang dipilih.
- Total expenses.
- Net cash flow.
- Savings rate.
- Total liquid assets.
- Total liabilities.
- Net worth.
- Debt obligations.
- Emergency fund coverage.
- Budget utilization.
- Available cash dan allocated cash, jika data pendukung tersedia.

Setiap metrik harus mempunyai definisi, periode, unit, sumber data, dan aturan penanganan data yang tidak lengkap.

**FR-01.2 — Periode**

Mendukung:
- Pay cycle.
- Calendar month.
- Custom date range jika diperlukan oleh modul.

Periode harus konsisten dengan aturan pay cycle yang sudah ada. Periode tidak boleh diam-diam berubah menjadi kalender bulanan.

**FR-01.3 — Net worth**

Formula dasar:

`Net Worth = Total Assets - Total Liabilities`

Ketentuan:
- Saldo kartu kredit dan utang merupakan kewajiban, bukan aset.
- Transfer internal tidak boleh dihitung sebagai income atau expense.
- Hanya aset yang benar-benar direpresentasikan oleh data yang tersedia yang boleh dimasukkan.
- Nilai aset yang tidak tercatat tidak boleh diasumsikan nol tanpa penjelasan.

**FR-01.4 — Savings rate**

Formula dasar untuk periode yang relevan:

`Savings Rate = (Income - Expenses) / Income × 100%`

Ketentuan:
- Jika income nol, hasil harus dinyatakan tidak tersedia, bukan menghasilkan nilai tidak valid.
- Transfer internal tidak masuk income atau expenses.
- Definisi savings rate harus dibedakan dari kontribusi investasi jika keduanya digunakan.

**FR-01.5 — Emergency fund coverage**

`Coverage Months = Eligible Emergency Reserve / Essential Monthly Expenses`

Ketentuan:
- Definisi eligible reserve harus ditetapkan secara eksplisit.
- Dana yang telah terikat pada kewajiban atau envelope tidak boleh otomatis dihitung sebagai cadangan bebas.
- Jika pengeluaran esensial belum cukup representatif, engine harus menyatakan bahwa coverage belum dapat dihitung secara andal.

**FR-01.6 — Data quality**

Engine harus dapat menandai:
- Data tidak lengkap.
- Saldo yang belum direkonsiliasi.
- Kategori yang belum diklasifikasikan.
- Riwayat transaksi yang belum cukup.
- Perhitungan yang bergantung pada asumsi.

Metrik tidak boleh ditampilkan dengan tingkat kepastian yang menyesatkan.

### Acceptance criteria

- Metrik menggunakan sumber perhitungan yang konsisten.
- Hasil untuk dataset uji dapat direproduksi.
- Tidak ada penggunaan floating-point untuk penyimpanan atau operasi nominal uang yang memerlukan presisi eksak.
- Periode, currency, dan asumsi terlihat pada detail metrik.
- Edge cases seperti income nol, data kosong, dan saldo negatif ditangani secara eksplisit.

## FR-02 — Cash Flow Forecast

**Priority: P0**

### Objective

Memperkirakan kondisi kas masa depan berdasarkan data dan asumsi yang eksplisit.

### Requirements

**FR-02.1 — Forecast horizon**

Mendukung horizon:
- 30 hari.
- 60 hari.
- 90 hari.

Horizon harus dapat dikonfigurasi atau dipilih pengguna.

**FR-02.2 — Forecast inputs**

Dapat menggunakan:
- Saldo awal yang relevan.
- Jadwal pendapatan yang telah diketahui.
- Fixed costs.
- Kewajiban utang dan pembayaran yang direncanakan.
- Payday Allocation aktif.
- Asumsi pengeluaran yang ditetapkan pengguna.

Recurring income tidak boleh dianggap pasti hanya karena pengguna memiliki nilai `monthlySalary`. Engine harus membedakan pendapatan terjadwal, pendapatan historis, dan asumsi.

**FR-02.3 — Forecast outputs**

Menampilkan:
- Estimasi saldo dari waktu ke waktu.
- Periode dengan potensi kekurangan kas.
- Kewajiban yang menyebabkan risiko.
- Asumsi yang paling memengaruhi hasil.
- Perbedaan antara actual dan projected.

**FR-02.4 — Uncertainty**

Forecast berbasis data historis harus menunjukkan keterbatasan data. Jika belum ada model statistik tervalidasi, gunakan proyeksi berbasis aturan dan skenario, bukan klaim prediksi probabilistik.

### Acceptance criteria

- Forecast tidak menulis transaksi aktual.
- Perubahan asumsi hanya memengaruhi hasil simulasi sampai pengguna menyetujui perubahan rencana.
- Forecast dapat direproduksi dari input yang sama.
- Tidak terjadi penghitungan ganda untuk transaksi, tagihan, dan alokasi.
- Setiap risiko kas dapat ditelusuri ke input yang relevan.

## FR-03 — Financial Roadmap

**Priority: P1**

### Objective

Mengembangkan Tangga Ternak Uang menjadi roadmap finansial yang transparan dan dapat disesuaikan.

### Baseline steps

Berdasarkan implementasi yang didokumentasikan:

1. Tabungan dasar Rp10 juta.
2. Pelunasan utang non-mortgage.
3. Dana darurat 3–6 bulan.
4. Investasi minimal 20% income.
5. Dana pendidikan anak.
6. Pelunasan KPR.
7. Kekayaan abadi dan berbagi.

Daftar ini menjadi baseline untuk audit, bukan asumsi bahwa semua aturan harus dipertahankan tanpa perubahan.

### Requirements

**FR-03.1 — Explicit criteria**

Setiap tahap harus memiliki:
- ID dan nama tahap.
- Kriteria eligibility.
- Formula atau rule penyelesaian.
- Sumber data.
- Status.
- Alasan status.
- Kekurangan yang tersisa.
- Tanggal evaluasi terakhir.

**FR-03.2 — Personal applicability**

Tahap yang tidak relevan bagi pengguna harus dapat ditandai sebagai `NOT_APPLICABLE` berdasarkan preferensi eksplisit.

Tahap yang tidak berlaku tidak boleh memaksa pengguna membuat goal fiktif atau memanipulasi progres.

**FR-03.3 — Sequential progression**

Aturan default tetap mengikuti urutan roadmap. Perubahan ke model yang lebih fleksibel memerlukan keputusan produk yang eksplisit.

Engine harus membedakan:
- `COMPLETED`
- `IN_PROGRESS`
- `BLOCKED`
- `NOT_APPLICABLE`
- `NEEDS_DATA`

Status dan persentase progres tidak boleh dicampur.

**FR-03.4 — Target timeline**

Estimasi waktu penyelesaian harus berdasarkan:
- Target nominal.
- Nilai aktual yang memenuhi syarat.
- Kontribusi periodik yang diasumsikan.
- Kewajiban yang relevan.
- Horizon simulasi.

Jika tidak ada asumsi kontribusi yang layak, timeline harus dinyatakan tidak tersedia.

**FR-03.5 — Goal integration**

Roadmap terhubung dengan Savings Goals dan Payday Allocation tanpa membuat salinan saldo yang menjadi sumber kebenaran baru.

### Acceptance criteria

- Setiap status tahap memiliki penjelasan yang bisa diperiksa.
- Perubahan transaksi dapat memicu evaluasi ulang.
- Tahap tidak dianggap selesai hanya berdasarkan nama kategori atau nama goal jika bukti finansial belum memadai.
- Pengguna dapat mengetahui alasan tahap berikutnya terkunci.
- Preferensi applicability disimpan secara eksplisit.

## FR-04 — Decision Lab

**Priority: P1**

### Objective

Mengembangkan simulator yang sudah ada menjadi alat perbandingan keputusan finansial.

### Requirements

**FR-04.1 — Baseline scenario**

Baseline merepresentasikan kondisi aktual pada waktu simulasi dibuat.

Skenario harus menyimpan snapshot input yang diperlukan agar hasil historis tidak berubah secara diam-diam ketika data aktual berubah.

**FR-04.2 — Alternative scenarios**

Pengguna dapat membuat beberapa alternatif dengan mengubah:
- Income.
- Expense.
- Debt payment.
- Savings contribution.
- Target waktu.
- Asumsi cash buffer.
- Kontribusi goal.

**FR-04.3 — Comparison metrics**

Minimal menampilkan:
- Saldo akhir.
- Net cash flow.
- Sisa kewajiban.
- Estimasi waktu pelunasan utang.
- Emergency fund coverage.
- Progres tujuan.
- Potensi kekurangan kas selama horizon simulasi.

**FR-04.4 — Scenario transparency**

Setiap skenario menampilkan:
- Input yang berbeda dari baseline.
- Asumsi.
- Hasil perhitungan.
- Dampak positif.
- Trade-off.
- Data yang belum tersedia.

**FR-04.5 — No silent execution**

Menyimpan atau menjalankan simulasi tidak mengubah ledger, goals, atau payday allocation aktual.

Jika pengguna ingin menerapkan skenario, sistem harus menampilkan preview dan meminta persetujuan.

### Acceptance criteria

- Hasil skenario dapat direproduksi.
- Perubahan satu variabel menghasilkan perubahan yang konsisten dengan formula.
- Skenario tidak mengubah data aktual.
- Hasil lama tetap dapat dibaca berdasarkan snapshot input.
- Skenario dengan input tidak valid ditolak dengan pesan yang jelas.

## FR-05 — Financial Action Center

**Priority: P2**

### Objective

Menyatukan alerts dan recommendations menjadi satu sistem prioritas tindakan.

### Requirements

**FR-05.1 — Recommendation sources**

Mendukung jenis:
- Debt overdue.
- Debt due soon.
- Fixed cost due.
- Budget warning.
- Budget overflow.
- Cash flow risk.
- Emergency fund gap.
- Savings opportunity.
- Unusual spending.
- Goal progress risk.

Jenis tambahan harus menggunakan registry atau struktur yang konsisten.

**FR-05.2 — Prioritization**

Prioritas ditentukan oleh aturan eksplisit berdasarkan:
- Urgensi.
- Dampak finansial.
- Kedekatan deadline.
- Validitas data.
- Status rekomendasi.

Jangan menggunakan skor misterius yang tidak bisa dijelaskan. Jika memakai skor gabungan, komponennya harus terdokumentasi dan dapat diuji.

**FR-05.3 — Deduplication**

Masalah yang sama tidak boleh menghasilkan rekomendasi aktif berulang tanpa alasan.

Setiap rekomendasi perlu memiliki identitas masalah yang stabil, waktu evaluasi, status, dan kebijakan kedaluwarsa.

**FR-05.4 — Lifecycle**

Mendukung:
- `NEW`
- `VIEWED`
- `ACCEPTED`
- `DISMISSED`
- `EXPIRED`

Status yang sudah ada harus direuse jika sesuai. Jangan menciptakan sistem status kedua tanpa kebutuhan yang jelas.

**FR-05.5 — Action details**

Setiap rekomendasi harus menampilkan:
- Masalah.
- Alasan.
- Dampak atau nominal jika dapat dihitung.
- Deadline jika ada.
- Sumber data.
- Tindakan yang tersedia.
- Asumsi atau keterbatasan.

### Acceptance criteria

- Rekomendasi memiliki alasan yang dapat ditelusuri.
- Rekomendasi duplikat dapat dideteksi.
- Dismissal tidak mengubah data finansial.
- Kondisi kritis yang masih aktif dapat muncul kembali sesuai kebijakan yang jelas.
- Prioritas dapat diuji dengan fixture dan expected outputs.

## FR-06 — Execution Plan Integration

**Priority: P2**

### Objective

Menghubungkan Payday Allocation, budget, dan realisasi transaksi.

### Requirements

- Menampilkan alokasi aktif dan sisa dana setiap envelope.
- Membedakan saldo rekening aktual, dana teralokasi, dan dana yang belum dialokasikan.
- Menghubungkan pembayaran dengan transaksi yang relevan.
- Menyediakan preview ketika rencana perlu diubah.
- Menghitung planned versus actual.
- Menghindari penghitungan ganda antar-envelope, budget, dan goal.
- Mempertahankan lifecycle draft, active, dan completed jika masih sesuai implementasi.

### Acceptance criteria

- Dana yang sudah dialokasikan tidak dianggap sebagai dana bebas.
- Pembayaran yang dicatat tidak mengurangi saldo dua kali.
- Reallocation tidak langsung diterapkan tanpa konfirmasi.
- Perubahan aktual memicu pembaruan hasil yang konsisten.
- Rekonsiliasi antara rencana dan realisasi dapat ditelusuri.

## FR-07 — Financial Command Center UX

**Priority: P2**

### Objective

Menyediakan satu entry point yang memudahkan pengguna memahami kondisi dan tindakan finansial.

### Requirements

Halaman utama menampilkan:

1. Financial Health summary.
2. Cash flow forecast.
3. Prioritas tindakan.
4. Progress roadmap.
5. Ringkasan payday allocation.
6. Perubahan kondisi dibanding periode sebelumnya.

Ketentuan UX:
- Jangan menampilkan seluruh metrik sekaligus jika tidak membantu keputusan.
- Detail metrik dapat dibuka untuk melihat formula dan sumber data.
- Status data tidak lengkap harus terlihat.
- Pengguna dapat menavigasi ke modul sumber.
- Tampilan mobile tetap mendukung akses ke tindakan utama.

### Acceptance criteria

- Pengguna dapat menemukan prioritas tindakan tanpa berpindah-pindah banyak halaman.
- Setiap ringkasan dapat ditelusuri ke sumber detailnya.
- Tidak ada metrik ringkasan dengan definisi berbeda dari modul asal.
- Empty states, loading states, error states, dan kondisi data tidak lengkap ditangani.

## FR-08 — Financial Review

**Priority: P2**

### Objective

Menggunakan hasil periode sebelumnya untuk membantu evaluasi rencana.

### Requirements

Weekly review dan reports harus dapat menampilkan:
- Planned versus actual.
- Perubahan cash flow.
- Penyimpangan budget.
- Perubahan kewajiban.
- Progress target.
- Rekomendasi yang selesai dan belum selesai.

Riwayat hasil harus dibedakan dari proyeksi. Jangan mengubah hasil historis hanya karena formula atau data aktual terbaru berubah.

---

# 8. Financial Rules dan Invariants

Semua modul wajib mengikuti aturan berikut.

## 8.1 Money precision

- Nominal disimpan sebagai integer minor units.
- IDR menggunakan rupiah utuh sesuai implementasi sekarang.
- EUR menggunakan cents.
- Tidak menggunakan floating-point sebagai representasi utama uang.
- Pembulatan harus eksplisit dan konsisten.

## 8.2 Transaction semantics

- `INCOME`, `EXPENSE`, dan `TRANSFER` tetap memiliki semantik yang berbeda.
- Transfer tidak masuk expense/income analytics.
- Transfer dua rekening harus atomik.
- Koreksi saldo tidak boleh disamarkan sebagai expense biasa.

## 8.3 Pay-cycle semantics

- Perhitungan yang menggunakan pay cycle wajib memakai engine pay-cycle yang sudah ada.
- Jangan membuat implementasi kalender gaji kedua.
- Batas periode harus diuji, termasuk pergantian bulan dan tahun.

## 8.4 Credit cards and liabilities

- Credit card liability tidak boleh diperlakukan sebagai aset likuid.
- Statement due amount tidak boleh dihitung dua kali sebagai kewajiban.
- Debit mode harus mempertahankan aturan alokasi yang sudah ada.
- Pembayaran kartu kredit dan transfer pelunasan tidak boleh menduplikasi expense yang sudah dicatat.

## 8.5 Currency

- IDR dan EUR tidak boleh dijumlahkan secara langsung.
- Konversi membutuhkan nilai tukar dan timestamp yang eksplisit.
- Jika nilai tukar tidak tersedia, agregat lintas mata uang harus ditampilkan terpisah.
- Target Tangga Ternak Uang dalam IDR tidak boleh dikonversi secara implisit.

## 8.6 Data lineage

Setiap rekomendasi harus dapat ditelusuri ke:
- Input data.
- Periode.
- Rule atau formula.
- Versi aturan jika relevan.
- Timestamp evaluasi.

---

# 9. Proposed Technical Architecture

## 9.1 Prinsip implementasi

Pertahankan stack saat ini:

- Next.js App Router.
- React dan TypeScript.
- Route Handlers.
- Zod.
- MongoDB dan Mongoose.
- Existing financial libraries.

Jangan melakukan rewrite atau migrasi database hanya untuk mendukung redesign ini.

## 9.2 Proposed logical modules

Nama berikut adalah usulan struktur logis; coding agent harus menyesuaikannya dengan struktur aktual setelah audit.

```text
src/lib/financial/
  metrics/
    financial-health.ts
    liquidity.ts
    net-worth.ts
    savings-rate.ts
  forecast/
    cash-flow-forecast.ts
  roadmap/
    wealth-ladder.ts
    roadmap-evaluation.ts
  decision/
    scenario-engine.ts
    scenario-comparison.ts
  recommendations/
    recommendation-rules.ts
    recommendation-priority.ts
    recommendation-deduplication.ts
  execution/
    allocation-reconciliation.ts
  shared/
    money.ts
    periods.ts
    currency.ts
```

Ketentuan:
- Reuse file existing jika tanggung jawabnya sudah sesuai.
- Jangan memindahkan seluruh file hanya demi mencocokkan struktur contoh.
- Financial engine tidak boleh bergantung pada React atau UI.
- Business logic harus bisa diuji secara independen dari database.
- Route handlers melakukan autentikasi, validasi, dan orkestrasi; jangan menyimpan formula inti hanya di route.
- Semua endpoint tetap melakukan scoping berdasarkan `userId`.

## 9.3 Data model changes

Lakukan perubahan data hanya jika kebutuhan tidak bisa dipenuhi oleh model yang sudah tersedia.

Kandidat perubahan:

**Scenario**
- `userId`
- `name`
- `baselineSnapshot`
- `assumptions`
- `results`
- `createdAt`
- `updatedAt`

**Roadmap evaluation**
- `userId`
- `stepId`
- `status`
- `evaluationInputs`
- `evaluatedAt`
- `rulesVersion` jika dibutuhkan untuk reproducibility

**Recommendation**
- Reuse `FinancialRecommendation` jika struktur saat ini memadai.
- Tambahkan stable issue key, provenance, dan rule version hanya jika belum tersedia dan benar-benar diperlukan.

Jangan menyimpan saldo atau agregat yang dapat dihitung dari ledger sebagai sumber kebenaran kedua tanpa justifikasi dan mekanisme rekonsiliasi.

---

# 10. Security dan Reliability Requirements

- Semua endpoint wajib menggunakan autentikasi yang sesuai.
- Data harus selalu dibatasi pada `userId` yang berwenang.
- Validasi request menggunakan Zod.
- Tidak ada API baru yang memperbolehkan agent eksternal mengubah data tanpa autentikasi dan otorisasi.
- Perubahan yang melibatkan beberapa dokumen harus mempertimbangkan atomicity.
- Penanganan retry tidak boleh menghasilkan duplikasi.
- Input skenario harus dibatasi dan divalidasi.
- Perhitungan harus mempunyai regression tests.
- Data pribadi tidak boleh dikirim ke layanan AI karena AI tidak termasuk scope.
- Error tidak boleh membocorkan kredensial atau data finansial pengguna lain.

---

# 11. Testing Strategy

## 11.1 Unit tests

Wajib mencakup:
- Money precision.
- Income, expense, dan transfer.
- Pay-cycle boundaries.
- Net worth.
- Savings rate ketika income nol.
- Emergency fund coverage.
- Currency isolation.
- Credit card statement dan pembayaran.
- Forecast cash flow.
- Roadmap status transitions.
- Scenario comparison.
- Recommendation prioritization dan deduplication.

## 11.2 Integration tests

Wajib mencakup:
- Ledger ke Financial Health.
- Ledger ke Forecast.
- Goals dan Debts ke Roadmap.
- Scenario Engine tanpa mengubah actual data.
- Recommendations ke Action Center.
- Payday Allocation terhadap realisasi transaksi.
- User isolation di seluruh API baru atau yang dimodifikasi.

## 11.3 Regression tests

Pastikan perubahan tidak merusak:
- Transaction CRUD.
- Transfer.
- Debt payments.
- Fixed-cost payments.
- Payday lifecycle.
- Existing reports.
- WhatsApp Vira.
- Existing wealth ladder.
- Existing simulator behavior.

## 11.4 Property and invariant tests

Jika memungkinkan, gunakan property-based tests untuk memastikan:
- Transfer internal tidak mengubah total net worth secara langsung jika kedua rekening sepenuhnya tercatat dan tidak ada biaya.
- Transfer tidak mengubah income atau expense totals.
- Perhitungan nominal tidak menghasilkan nilai uang yang tidak valid.
- Simulasi tidak mengubah data aktual.
- Perubahan asumsi menghasilkan output yang deterministik.

---

# 12. Success Metrics

Target numerik final ditentukan setelah baseline pengukuran tersedia.

| Metric | Cara pengukuran |
|---|---|
| Financial calculation correctness | Persentase fixture yang cocok dengan expected outputs |
| Cross-module consistency | Jumlah ketidaksesuaian metrik antarhalaman |
| Recommendation explainability | Persentase rekomendasi yang memiliki rule, input, dan alasan |
| Duplicate recommendations | Jumlah duplikasi aktif per issue key |
| Forecast integrity | Persentase forecast yang lolos invariant dan regression tests |
| Scenario reproducibility | Persentase skenario yang menghasilkan output sama dari input sama |
| Planning execution | Proporsi envelope yang memiliki planned versus actual yang dapat direkonsiliasi |
| Roadmap transparency | Persentase tahapan dengan kriteria dan sumber data yang jelas |

Jangan mengklaim akurasi forecast berdasarkan hasil historis semata tanpa backtesting yang memadai.

---

# 13. Implementation Roadmap

## Phase 0 — Audit dan Baseline

**Objective:** Memahami implementasi aktual sebelum perubahan.

Tasks:
1. Audit financial engine dan model data.
2. Identifikasi formula yang duplikat.
3. Audit pay-cycle dan currency semantics.
4. Audit wealth ladder dan simulator.
5. Audit alerts, recommendations, dan lifecycle.
6. Tambahkan regression tests untuk perilaku existing yang valid.
7. Dokumentasikan gap antara codebase dan PRD.

**Exit criteria:** Tidak ada perubahan arsitektur besar sebelum audit selesai dan rencana migrasi disetujui.

## Phase 1 — Financial Health Engine

Tasks:
1. Menetapkan definisi dan sumber setiap metrik.
2. Menyatukan perhitungan yang duplikat.
3. Memperbaiki edge cases.
4. Menyediakan service untuk dashboard dan modul terkait.
5. Menambahkan tests dan data quality flags.

**Exit criteria:** Metrik utama konsisten dan lolos acceptance criteria FR-01.

## Phase 2 — Cash Flow Forecast

Tasks:
1. Menentukan input dan batasan forecast.
2. Mengembangkan deterministic projection.
3. Menghindari double-counting.
4. Menampilkan risiko likuiditas.
5. Menambahkan scenario tests.

**Exit criteria:** Forecast dapat direproduksi dan tidak memodifikasi data aktual.

## Phase 3 — Financial Roadmap

Tasks:
1. Audit dan dokumentasikan seluruh step existing.
2. Membuat evaluasi status eksplisit.
3. Menambahkan applicability dan missing-data handling.
4. Menghubungkan goals, debts, dan payday.
5. Menampilkan alasan dan target gap.

**Exit criteria:** Status roadmap dapat dijelaskan dan diuji.

## Phase 4 — Decision Lab

Tasks:
1. Reuse simulator existing.
2. Menetapkan baseline snapshot.
3. Menambahkan penyimpanan skenario.
4. Mengembangkan comparison view.
5. Menghubungkan hasil dengan roadmap dan financial health.

**Exit criteria:** Pengguna dapat membandingkan alternatif tanpa mengubah ledger.

## Phase 5 — Financial Action Center

Tasks:
1. Menginventarisasi seluruh alert dan recommendation types.
2. Menyatukan prioritas dan deduplication rules.
3. Menyediakan action lifecycle yang konsisten.
4. Menambahkan alasan dan provenance.
5. Menghubungkan tindakan dengan modul terkait.

**Exit criteria:** Rekomendasi tidak duplikatif secara tidak sengaja dan dapat ditelusuri.

## Phase 6 — UX Consolidation

Tasks:
1. Mendesain Financial Command Center.
2. Memindahkan ringkasan ke halaman utama.
3. Mempertahankan detail management.
4. Menghubungkan roadmap, Decision Lab, dan Execution Plan.
5. Melakukan regression dan usability testing.

**Exit criteria:** Alur memahami kondisi → memilih keputusan → menjalankan rencana → mengevaluasi hasil dapat dilakukan tanpa navigasi yang membingungkan.

---

# 14. Risks dan Mitigations

| Risk | Mitigation |
|---|---|
| Formula yang sama menghasilkan nilai berbeda | Single source of truth untuk setiap perhitungan |
| Double-counting saldo atau kewajiban | Definisi ledger, allocation, dan liability yang eksplisit |
| Roadmap terlalu kaku | Applicability dan eligibility rules yang terdokumentasi |
| Forecast dianggap kepastian | Tampilkan asumsi, keterbatasan, dan rentang skenario |
| Action Center terlalu ramai | Deduplication dan prioritas yang dapat dijelaskan |
| Refactor merusak fitur existing | Audit, regression tests, dan implementasi bertahap |
| Model data menjadi terlalu kompleks | Reuse model existing dan tambahkan field hanya jika diperlukan |
| Perubahan skenario memengaruhi data aktual | Isolasi simulation state dan persetujuan sebelum penerapan |

---

# 15. Definition of Done

Sebuah phase dianggap selesai jika:

- Semua acceptance criteria untuk phase tersebut terpenuhi.
- Unit dan integration tests relevan lulus.
- Regression tests untuk fitur existing lulus.
- Perhitungan memiliki definisi dan sumber yang terdokumentasi.
- Tidak ada duplikasi financial logic yang tidak dibenarkan.
- API dan data tetap terisolasi berdasarkan user.
- UI menangani loading, error, empty, dan insufficient-data states.
- Tidak ada perubahan transaksi aktual akibat proses simulasi.
- Dokumentasi teknis dan perubahan model data diperbarui.
- Build frontend dan pemeriksaan TypeScript lulus.

---

# 16. Instruksi untuk Coding Agent

Implementasikan PRD ini secara bertahap berdasarkan urutan phase. Jangan mencoba membangun semua fitur sekaligus.

Sebelum coding:

1. Baca seluruh financial engine dan model terkait.
2. Identifikasi implementasi existing yang dapat direuse.
3. Buat matriks `requirement → existing implementation → gap → proposed change`.
4. Laporkan risiko perubahan business logic.
5. Usulkan urutan perubahan file dan test coverage.
6. Tunggu persetujuan sebelum melakukan rewrite besar atau perubahan schema yang tidak backward-compatible.

Saat implementasi:

- Jangan menambah AI atau LLM.
- Jangan mengganti stack.
- Jangan mengubah semantik ledger tanpa alasan dan regression tests.
- Jangan mengarang metrik atau mengisi missing data dengan asumsi tersembunyi.
- Jangan membuat rekomendasi finansial dengan formula yang tidak terdokumentasi.
- Jangan menghapus fitur existing hanya karena navigasi sedang didesain ulang.
- Utamakan perubahan incremental yang bisa diverifikasi.

Setelah setiap phase, laporkan:
- File yang berubah.
- Perilaku yang ditambahkan atau diubah.
- Test yang dijalankan dan hasilnya.
- Risiko yang belum diselesaikan.
- Requirement yang masih belum terpenuhi.

---

## 17. Keputusan yang Masih Terbuka

Hal-hal berikut harus diselesaikan selama product discovery atau Phase 0, bukan diasumsikan oleh coding agent:

1. Apakah seluruh tahapan Tangga Ternak Uang tetap wajib berurutan atau beberapa tahap dapat ditandai tidak relevan?
2. Bagaimana definisi final available cash, allocated cash, dan emergency reserve?
3. Apakah forecast menggunakan fixed assumptions, rata-rata historis, atau keduanya?
4. Bagaimana prioritas antara pelunasan utang, cadangan kas, dan target tabungan ditentukan?
5. Apakah pengguna boleh membuat aturan prioritas sendiri?
6. Berapa lama snapshot dan riwayat skenario disimpan?
7. Metrik apa yang wajib tampil di Command Center tanpa membuat UI terlalu padat?

Keputusan tersebut memengaruhi business logic dan UX, sehingga harus terdokumentasi sebelum implementasi final modul terkait.

---

## 18. Product Acceptance Statement

Finora 2.0 dinyatakan mencapai tujuan awal ketika pengguna dapat melihat kondisi keuangan yang konsisten, memahami prioritas tindakan, membandingkan beberapa pilihan finansial jangka panjang, dan menjalankan rencana dengan konsekuensi yang dapat diperiksa.

Seluruh proses harus bekerja tanpa AI, menggunakan data yang tersedia, formula deterministik, aturan bisnis yang transparan, dan persetujuan pengguna untuk perubahan data aktual.

**Prinsip penutup:** Finora tidak harus mengetahui masa depan secara pasti. Finora harus mampu menghitung konsekuensi dari pilihan yang tersedia, menunjukkan asumsi yang digunakan, dan membantu pengguna memilih tindakan yang paling sesuai dengan kondisi serta tujuan finansialnya.