PRD — Tangga Ternak Uang (Finora)
Status: Draft untuk implementasi
Produk: Finora — Personal Finance
Modul: Wawasan Keuangan (/insights)
Versi: 1.0
Tanggal: 21 Oktober 2026
Prinsip utama: Deterministic, explainable, data-driven; tidak menggunakan LLM untuk menghitung progres atau menentukan status langkah.
1. Ringkasan
Tangga Ternak Uang adalah kerangka prioritas keuangan jangka panjang di Finora. Fitur ini membantu pengguna memahami posisi mereka dalam tujuh langkah pengelolaan keuangan, mengetahui fokus berikutnya, dan melihat progres berdasarkan data aktual yang tercatat di aplikasi.

Tangga berada di bagian atas halaman Wawasan Keuangan (/insights). Sinyal keuangan operasional—seperti cash flow negatif, budget terlampaui, hutang jatuh tempo, dan anomali pengeluaran—tetap berada di bagian terpisah di bawahnya.
Prinsip produk
1. Urutan tangga stabil dan tidak berpindah-pindah akibat alert bulanan.
2. Status ditentukan oleh aturan eksplisit dan data aplikasi, bukan LLM.
3. Kondisi faktual suatu langkah dibedakan dari status progres tangga.
4. Data yang tidak cukup atau tidak dapat diklasifikasikan tidak boleh dianggap memenuhi target.
5. Pengguna dapat memahami alasan suatu langkah selesai, terkunci, atau masih menjadi fokus.
6. Fitur tidak mengubah saldo, transaksi, budget, atau hutang secara otomatis selain sinkronisasi goal sistem yang dijelaskan dalam PRD ini.
2. Masalah yang ingin diselesaikan
Pengguna membutuhkan kompas keuangan jangka panjang, bukan hanya daftar alert bulanan. Tanpa kerangka yang stabil, pengguna dapat sulit menentukan prioritas antara tabungan dasar, pelunasan hutang, dana darurat, investasi, pendidikan, KPR, dan berbagi.

Risiko desain yang harus dihindari:
- Langkah di belakang dianggap selesai dan menambah progres ketika langkah awal belum selesai.
- Saldo rekening yang sudah dialokasikan untuk tagihan dianggap sebagai tabungan bebas.
- Transfer internal dianggap sebagai pendapatan, pengeluaran, atau kontribusi investasi.
- Heuristik nama kategori/goal menghasilkan status yang keliru.
- Pengguna diberi kesan harus melunasi KPR secepat mungkin tanpa mempertimbangkan penalti atau kebutuhan likuiditas.
- Data tidak lengkap ditafsirkan sebagai kondisi terpenuhi.
3. Tujuan dan non-tujuan
Tujuan
- Menampilkan tujuh langkah dengan status, progres, alasan, dan CTA yang relevan.
- Menghitung progres utama secara berurutan (sequential gate).
- Menggunakan data Goals, Accounts, Debts, Transactions, Categories, serta profil/pengaturan pengguna.
- Menyinkronkan goal tabungan dasar dengan saldo likuid IDR sesuai aturan yang transparan.
- Menggunakan definisi transaksi dan kategori yang terstruktur sejauh memungkinkan.
- Memastikan engine dapat diuji dengan unit test dan hasilnya dapat direproduksi.
Non-tujuan
- Bukan penasihat investasi, pajak, atau hukum.
- Tidak memprediksi keuntungan investasi atau merekomendasikan produk investasi tertentu.
- Tidak menggunakan LLM untuk menentukan status, menghitung angka, atau mengubah data finansial.
- Tidak memaksa pengguna membeli instrumen investasi atau mempercepat pelunasan KPR.
- Tidak mengubah fitur sinyal bulanan menjadi bagian dari progres tangga.
- Tidak memerlukan integrasi bank eksternal untuk MVP.
4. Pengguna sasaran
Pengguna Finora yang mengelola keuangan pribadi dan ingin:
- membangun tabungan dasar;
- menyelesaikan hutang non-KPR;
- membangun dana darurat;
- mengukur kebiasaan investasi;
- merencanakan pendidikan anak jika relevan;
- mengelola KPR; dan
- merencanakan kekayaan jangka panjang serta berbagi.
MVP mengutamakan pengalaman single-user. Model data dan query tetap harus membatasi data berdasarkan userId agar aman untuk pengembangan multi-user.
5. Lokasi dan struktur UI
Route: src/app/(app)/insights/page.tsx
Engine: src/lib/financial/wealth-ladder.ts

Urutan halaman:
1. Header “Wawasan Keuangan”.
2. Ringkasan Tangga Ternak Uang: progres, langkah aktif, dan ringkasan fokus.
3. Visual tangga tujuh tingkat.
4. Detail langkah aktif dan satu CTA utama.
5. Daftar langkah lain dengan status Selesai, Fokus, Terkunci, atau Tidak relevan.
6. Pemisah yang jelas.
7. Sinyal/wawasan bulan ini, tetap berjalan dengan aturan yang ada.
Prinsip UX
- Gunakan Bahasa Indonesia yang jelas dan tidak menghakimi.
- Satu CTA utama untuk langkah aktif.
- Tampilkan alasan status dan data yang mendasarinya.
- Jangan menampilkan status “selesai” hanya karena tidak ditemukan data; bedakan data kosong dari kondisi yang benar-benar terpenuhi.
- Tujuh langkah tetap terlihat, termasuk langkah pendidikan anak dan berbagi.
- Aksesibilitas: status tidak dibedakan hanya dengan warna; gunakan teks dan ikon/label.
- Pada layar kecil, tangga harus tetap mudah dipahami tanpa memerlukan hover.
6. Definisi tujuh langkah
Step 1 — Nabung cash Rp10 juta
Target: Rp10.000.000 IDR, nominal tetap.

Sumber data: Goal sistem BASIC_SAVINGS dan saldo likuid IDR yang memenuhi syarat.

Kondisi goal selesai: currentAmount >= 10_000_000.

Aturan sinkronisasi:
- Saat evaluasi, pastikan goal sistem “Tabungan dasar 10jt” tersedia; buat jika belum ada.
- currentAmount = min(10_000_000, max(manualContribution, eligibleLiquidBalanceIdr)).
- Jangan menjumlahkan saldo rekening dengan kontribusi manual jika berpotensi merujuk pada uang yang sama.
- Kontribusi manual tidak boleh diturunkan secara otomatis oleh sinkronisasi saldo.
- Nilai progres dibatasi Rp10 juta; data saldo aktual tidak diubah.
- Rekening yang dihitung harus dapat dikonfigurasi/dikecualikan.
- Dana yang telah dialokasikan untuk tagihan/kewajiban sebaiknya tidak dihitung sebagai saldo tabungan bebas jika data alokasi tersedia.
- Untuk MVP jika alokasi belum tersedia, tampilkan penjelasan bahwa saldo eligible adalah estimasi dan sediakan pengaturan rekening yang disertakan.
CTA: /goals.

Catatan mata uang: Target ini berbasis IDR. Saldo EUR tidak boleh dikonversi secara implisit menggunakan kurs yang tidak ditetapkan. Saldo non-IDR tidak dihitung ke target ini pada MVP.
Step 2 — Lunasi hutang kecil (kecuali KPR)
Sumber data: Debts.

Kondisi faktual terpenuhi: Tidak ada hutang aktif non-mortgage dengan sisa pokok/total terutang lebih besar dari nol.

Jenis utama: CONSUMER, OTHER; semua jenis aktif non-mortgage yang masih memiliki saldo harus diperhitungkan.

Aturan:
- Jangan membuat hutang secara otomatis.
- Gunakan Debt.kind jika tersedia.
- Jika jenis belum ditetapkan, inferensi nama seperti “KPR” atau “rumah” boleh menjadi fallback dengan hasil yang dapat ditinjau pengguna.
- Jangan menganggap hutang selesai hanya karena pembayaran bulanan tercatat; periksa outstanding balance dan status.
- Hutang overdue atau berbunga tinggi dapat menghasilkan sinyal operasional, tetapi tidak mengubah urutan tangga.
CTA: /debts.
Step 3 — Dana darurat 3–6 bulan
Sumber data: Goal EMERGENCY_FUND dan estimasi pengeluaran esensial bulanan.

Ambang minimum selesai: Coverage minimal 3 bulan.

Rumus:

coverageMonths = eligibleEmergencyFundBalance / essentialMonthlyExpenses

conditionMet = coverageMonths >= 3

Aturan:
- Pengeluaran esensial bulanan dihitung dari kategori yang ditandai eksplisit sebagai ESSENTIAL; heuristic nama hanya fallback.
- Gunakan rata-rata historis tiga bulan lengkap jika tersedia.
- Jika riwayat belum cukup, gunakan data periode tersedia dan tampilkan bahwa estimasi masih awal.
- Jika pengeluaran esensial nol/tidak diketahui, coverage adalah UNKNOWN, bukan tak terhingga dan bukan otomatis selesai.
- Saldo dana darurat tidak boleh menghitung aset berisiko atau dana yang tidak likuid kecuali pengguna secara eksplisit mengklasifikasikannya sesuai kebijakan produk.
- Tiga bulan adalah syarat minimum untuk menyelesaikan langkah; 6 bulan dapat ditampilkan sebagai target lanjutan.
CTA: /goals atau halaman pengaturan kategori/pengeluaran esensial jika data belum cukup.
Step 4 — Investasi minimal 20% income
Sumber data: Transactions, Categories, Accounts, dan klasifikasi transaksi.

Definisi metrik: Rasio kontribusi investasi bersih terhadap pendapatan bersih yang memenuhi syarat pada periode bulanan.

investmentRate = netEligibleInvestmentContribution / eligibleNetIncome

conditionMet = investmentRate >= 0.20

Pendapatan yang memenuhi syarat:
- Pendapatan yang benar-benar diterima, seperti gaji dan pendapatan usaha.
- Tidak termasuk transfer internal, pencairan pinjaman, pengembalian dana, atau penjualan aset.
Kontribusi investasi yang memenuhi syarat:
- Dana baru yang benar-benar dialokasikan ke instrumen investasi.
- Transfer ke rekening broker/investasi hanya dihitung jika ditandai sebagai kontribusi investasi dan bukan transfer internal biasa yang sudah dihitung di tempat lain.
- Penarikan dari investasi mengurangi kontribusi bersih sesuai klasifikasi transaksi yang tersedia.
- Transfer internal tidak boleh dihitung ganda.
- Kategori investasi berbasis nama hanya fallback; kategori/jenis transaksi eksplisit menjadi sumber utama.
Periode:
- Bulan berjalan ditampilkan sebagai indikator sementara.
- Rata-rata tiga bulan lengkap ditampilkan sebagai indikator konsistensi jika datanya tersedia.
- Bulan berjalan yang belum selesai tidak boleh langsung diberi label gagal tanpa konteks.
Kasus data tidak cukup:
- Jika pendapatan belum tercatat atau denominator nol, status kondisi UNKNOWN.
- Jangan menafsirkan UNKNOWN sebagai selesai.
- UI menampilkan tindakan untuk melengkapi transaksi atau klasifikasi.
CTA: /transactions atau halaman transaksi yang sudah difilter ke kategori investasi.

Catatan: Metrik ini mengukur kontribusi, bukan keuntungan investasi atau perubahan harga aset.
Step 5 — Dana pendidikan anak
Sumber data: Goals dengan goalType = EDUCATION atau klasifikasi goal pendidikan yang eksplisit.

Kondisi faktual terpenuhi: Ada goal pendidikan yang valid dan belum diarsipkan. Untuk penyelesaian penuh, target dan progres goal harus dapat ditampilkan dengan jelas; keberadaan goal saja menandakan “direncanakan”, bukan otomatis target dana sudah tercapai.

Relevansi:
- Langkah selalu ditampilkan.
- Preferensi pengguna dapat menandai NOT_APPLICABLE jika tidak memiliki atau tidak merencanakan anak.
- Status NOT_APPLICABLE tidak menghalangi gate berikutnya dan dikeluarkan dari denominator progres efektif.
- Langkah tetap tampak pada visual dengan label yang menjelaskan bahwa langkah tidak relevan saat ini.
CTA: /goals.
Step 6 — Lunasi KPR
Sumber data: Debts.

Kondisi faktual terpenuhi: Tidak ada hutang aktif bertipe MORTGAGE dengan saldo terutang lebih besar dari nol.

Aturan:
- Gunakan Debt.kind = MORTGAGE sebagai sumber utama.
- Inferensi nama “KPR”/“rumah” hanya fallback jika jenis belum ditetapkan.
- Sediakan mekanisme bagi pengguna untuk mengonfirmasi/mengoreksi hasil inferensi.
- Jika tidak ada KPR aktif, kondisi dapat terpenuhi walaupun langkah masih terkunci oleh gate.
- UI harus membedakan “tidak punya KPR” dari “KPR sudah dilunasi”.
- Copy “lunasi KPR secepat mungkin” tidak boleh menyiratkan pelunasan dipercepat selalu optimal. Jika KPR masih aktif, arahkan pengguna meninjau kewajiban dan opsi, bukan otomatis melakukan pelunasan.
CTA: /debts.
Step 7 — Kekayaan abadi & berbagi
Sumber data: Goals dan Transactions.

Kondisi faktual: Status dibagi menjadi:
- PLANNED: ada goal kekayaan jangka panjang/berbagi;
- ACTIVE: goal atau aktivitas relevan berjalan;
- ACHIEVED: target yang didefinisikan pengguna telah tercapai.
Keberadaan satu transaksi donasi atau zakat tidak otomatis berarti “kekayaan abadi” sudah tercapai.

MVP:
- Langkah selalu ditampilkan sebagai tujuan akhir.
- Pengguna dapat membuat goal berbagi/kekayaan dengan goalType eksplisit.
- Bila hanya ada transaksi berbagi, tampilkan sebagai aktivitas terdeteksi, bukan penyelesaian target kekayaan.
- Definisi conditionMet untuk penyelesaian penuh perlu berdasarkan target yang ditetapkan pengguna; jangan menganggap transaksi tunggal sebagai bukti kekayaan jangka panjang.
CTA: /goals atau /transactions sesuai status dan konteks.
7. Sequential gate dan perhitungan progres
Status per langkah
Setiap langkah harus memiliki status faktual dan status progres terpisah:
- conditionMet: kondisi data untuk langkah tersebut terpenuhi.
- gateUnlocked: seluruh langkah wajib sebelumnya telah selesai atau dikecualikan secara sah.
- creditedComplete: langkah boleh dihitung selesai dalam progres tangga.
- status: COMPLETED, FOCUS, LOCKED, NOT_APPLICABLE, atau UNKNOWN.
Aturan gate
1. Langkah pertama yang belum selesai menjadi fokus utama.
2. Langkah setelah fokus tidak boleh menambah progres, walaupun kondisi faktualnya terpenuhi.
3. Kondisi faktual langkah yang terkunci tetap dapat ditampilkan secara jujur, misalnya “Tidak ada KPR aktif — langkah masih terkunci”.
4. Langkah NOT_APPLICABLE yang disetujui pengguna dilewati dalam gate dan tidak masuk denominator progres efektif.
5. Status UNKNOWN tidak dianggap selesai dan tidak boleh dilewati otomatis.
6. Jika kondisi langkah yang sebelumnya selesai tidak lagi terpenuhi akibat perubahan data, evaluasi ulang secara deterministik. Langkah berikutnya kembali terkunci jika aturan berurutan tidak lagi terpenuhi.
7. Evaluasi ulang tidak menghapus transaksi, goal, atau data sumber.
Rumus progres
Untuk langkah yang relevan dan wajib:

progressPercent = floor(completedRequiredSteps / applicableRequiredSteps * 100)

completedRequiredSteps hanya menghitung langkah yang selesai berurutan dan creditedComplete = true.

Jika seluruh langkah wajib ditandai NOT_APPLICABLE secara tidak sengaja atau denominator nol, gunakan fallback yang aman dan tampilkan keadaan kosong; jangan menghasilkan NaN atau Infinity.

Contoh gate:
- Step 1 belum selesai; step 6 kondisi faktualnya terpenuhi → progres 0%, step 1 fokus, step 6 terkunci.
- Step 1 selesai, step 2 belum selesai → step 1 dihitung, step 2 fokus, langkah wajib setelahnya terkunci.
- Step 1–4 selesai, step 5 NOT_APPLICABLE → step 6 dapat menjadi langkah berikutnya yang bisa dihitung sesuai kebijakan denominator.
- Data Step 3 belum cukup → Step 3 UNKNOWN, progres tidak melewatinya.
8. Model data dan klasifikasi
Gunakan field terstruktur sebagai sumber kebenaran; heuristik nama hanya sebagai fallback yang bisa dijelaskan.
Goal
Field yang direkomendasikan:
- userId
- name
- goalType: BASIC_SAVINGS | EMERGENCY_FUND | EDUCATION | CHARITY | WEALTH | OTHER
- targetAmount
- currentAmount
- currency
- status
- isSystem
- isArchived
- createdAt, updatedAt
Jangan mengubah skema existing tanpa migrasi yang kompatibel. Jika goalType belum ada, implementasikan fallback mapping dan rencanakan migrasi bertahap.
Debt
Field relevan:
- userId
- kind: CONSUMER | OTHER | MORTGAGE
- outstandingAmount
- status
- name
- dueDate jika tersedia
- metadata sumber/inferensi jika diperlukan
Category
Field yang direkomendasikan:
- categoryType: INCOME | ESSENTIAL | INVESTMENT | EDUCATION | CHARITY | OTHER
- isEssential atau padanan yang konsisten dengan model existing.
Transaction
Field yang direkomendasikan:
- type: INCOME | EXPENSE | TRANSFER
- classification/purpose: misalnya INVESTMENT_CONTRIBUTION, INVESTMENT_WITHDRAWAL, REFUND, LOAN_PROCEEDS, ASSET_SALE
- categoryId
- accountId dan destinationAccountId untuk transfer, jika model mendukung
- amountMinor, currency, date
- metadata klasifikasi manual bila diperlukan.
Gunakan integer minor units sesuai konvensi aplikasi. Untuk IDR, gunakan rupiah utuh jika itu konvensi yang sudah dipakai; EUR menggunakan sen. Hindari floating-point untuk perhitungan uang.
User preferences
Field yang direkomendasikan:
- educationGoalApplicability: APPLICABLE | NOT_APPLICABLE | UNSET
- daftar rekening yang dihitung untuk tabungan dasar, jika konfigurasi per rekening diperlukan
- preferensi kategori pengeluaran esensial jika belum terdefinisi secara formal.
Evaluasi tangga
Hasil evaluasi dapat dihitung saat request dari snapshot data, atau disimpan sebagai cache yang dapat dibangun ulang. Jika hasil disimpan, simpan timestamp dan versi aturan agar perubahan algoritme dapat dievaluasi ulang.
9. Arsitektur dan kontrak engine
File utama: src/lib/financial/wealth-ladder.ts

Pisahkan fungsi menjadi unit yang mudah diuji, misalnya:
- ensureBasicSavingsGoal(...)
- calculateEligibleLiquidBalance(...)
- calculateEmergencyFundCoverage(...)
- calculateInvestmentRate(...)
- evaluateLadderConditions(...)
- applySequentialGate(...)
- calculateLadderProgress(...)
Nama tersebut adalah usulan, bukan kewajiban jika struktur existing sudah berbeda.
Kontrak keluaran konseptual
type LadderStepStatus =
  | "COMPLETED"
  | "FOCUS"
  | "LOCKED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

type LadderStepEvaluation = {
  step: number;
  title: string;
  conditionMet: boolean | "UNKNOWN";
  gateUnlocked: boolean;
  creditedComplete: boolean;
  status: LadderStepStatus;
  reasonCode: string;
  reason: string;
  progress?: {
    current: number;
    target: number;
    unit: "IDR" | "MONTHS" | "PERCENT" | "BOOLEAN";
  };
  cta?: {
    label: string;
    href: string;
  };
};
Keluaran harus stabil dan mudah diuji. reasonCode digunakan untuk pengujian/telemetri; reason merupakan teks penjelasan UI. Jangan menerima hasil evaluasi dari LLM.
Batas efek samping
- Perhitungan status harus pure/deterministic.
- Pembuatan goal sistem merupakan operasi terpisah dan idempotent.
- Evaluasi halaman tidak boleh membuat goal duplikat pada request bersamaan.
- Gunakan unique key atau strategi upsert untuk goal sistem per userId dan goalType.
- Semua query data harus dibatasi dengan userId dari sesi terautentikasi.
- Jangan menerima userId otoritatif dari body request yang dikirim klien.
10. API dan pemuatan data
Gunakan route/API existing jika tersedia; jangan membuat endpoint duplikat tanpa kebutuhan.

Kebutuhan data untuk evaluasi:
- goals;
- debts;
- accounts dan saldo yang memenuhi syarat;
- transactions untuk penghasilan, investasi, dan pengeluaran esensial;
- categories;
- preferensi pengguna;
- waktu/periode evaluasi.
Jika dibuat endpoint khusus, respons perlu mencakup:
- progressPercent;
- activeStep;
- daftar evaluasi tujuh langkah;
- evaluatedAt;
- ruleVersion;
- indikator kualitas/kecukupan data bila relevan.
API harus:
- memvalidasi input dengan Zod;
- menggunakan sesi autentikasi;
- menerapkan batas akses berdasarkan userId;
- tidak mengirim data finansial ke provider AI;
- mengembalikan pesan error yang aman tanpa membocorkan data sensitif.
11. Sinyal bulanan versus tangga
Keduanya tetap terpisah.

Tangga: progres jangka panjang dan fokus berikutnya. Perubahan status terjadi saat kondisi dasar berubah atau data sumber berubah.

Sinyal bulanan: masalah operasional dan kondisi periode saat ini, seperti:
- cash flow negatif;
- budget overflow;
- hutang overdue;
- anomali belanja;
- tagihan tetap yang belum tercakup.
Sinyal bulanan boleh memberi peringatan keselamatan atau tindakan mendesak, tetapi tidak boleh mengubah urutan tangga secara otomatis. Contoh: tunggakan kritis dapat ditampilkan sebagai alert prioritas tinggi walaupun langkah tangga saat ini adalah dana darurat.
12. Keamanan dan privasi
- Engine tangga tidak memerlukan OpenRouter atau provider AI.
- Jangan mengirim transaksi, saldo, hutang, atau goal ke layanan eksternal untuk menghitung progres.
- Terapkan otorisasi server-side dan isolasi data berdasarkan pengguna.
- Log hanya kode status, durasi, dan error teknis yang diperlukan; hindari logging payload keuangan lengkap.
- Data yang dikembalikan ke UI dibatasi pada yang diperlukan untuk menampilkan hasil.
- Pembuatan goal sistem harus idempotent dan tidak mengubah saldo rekening.
13. Edge cases
1. Goal “Tabungan dasar 10jt” sudah ada dengan kontribusi manual lebih besar dari Rp10 juta: jangan menurunkan nilai manual; progres dibatasi 100%.
2. Goal sistem belum ada: buat satu kali secara idempotent.
3. Dua request evaluasi berjalan bersamaan: tidak boleh menghasilkan goal duplikat.
4. Saldo rekening negatif atau akun tidak aktif: jangan dihitung sebagai saldo likuid positif.
5. Saldo IDR dan EUR tersedia: hanya saldo IDR eligible yang dihitung untuk Step 1 pada MVP.
6. Pengeluaran esensial nol atau data tidak tersedia: Step 3 UNKNOWN.
7. Pendapatan bulan berjalan nol/tidak tercatat: Step 4 UNKNOWN, bukan selesai.
8. Transfer antar rekening sendiri: bukan pendapatan, pengeluaran, atau kontribusi investasi kecuali diklasifikasikan eksplisit dan tidak dihitung ganda.
9. Hutang non-KPR aktif dengan outstanding nol: dianggap lunas jika status/model konsisten; tangani data tidak konsisten dengan aman.
10. Nama hutang mengandung “rumah” tetapi jenis belum ditetapkan: inferensi ditampilkan untuk konfirmasi, bukan dianggap kebenaran tanpa penjelasan.
11. KPR tidak ada: kondisi Step 6 terpenuhi secara faktual, tetapi tetap mengikuti gate.
12. Pendidikan anak tidak relevan: langkah tetap tampil dengan NOT_APPLICABLE; gate mengikuti aturan yang telah ditetapkan.
13. Goal pendidikan hanya dibuat tetapi target belum diisi: tampilkan sebagai direncanakan, jangan menyebut dana sudah tercapai.
14. Ada satu transaksi donasi tetapi belum ada target berbagi/kekayaan: tampilkan aktivitas, jangan menyelesaikan Step 7.
15. Transaksi lama diedit/dihapus: hasil evaluasi dihitung ulang.
16. Pengguna mengarsipkan goal: goal tersebut tidak dihitung sebagai goal aktif.
17. Pengguna belum punya riwayat 3 bulan: gunakan data yang tersedia dan tampilkan kualitas estimasi.
18. Pengguna mengubah klasifikasi kategori: evaluasi terkait diperbarui tanpa mengubah transaksi lain.
19. Semua langkah faktual di belakang terpenuhi tetapi Step 1 belum selesai: progres utama tetap 0%.
20. Kondisi langkah yang sebelumnya selesai berubah menjadi tidak terpenuhi: hitung ulang progres sesuai urutan.
14. Acceptance criteria
Sequential gate
- [ ] Jika Step 1 belum selesai, progres tidak meningkat karena kondisi Step 2–7.
- [ ] Hanya langkah berurutan yang selesai dihitung ke progres utama.
- [ ] Kondisi faktual langkah terkunci dapat dilihat tanpa menyatakan langkah itu sudah mendapat kredit progres.
- [ ] UNKNOWN tidak dianggap selesai.
- [ ] NOT_APPLICABLE hanya digunakan berdasarkan preferensi eksplisit yang diizinkan.
Step 1
- [ ] Goal dasar dibuat otomatis jika belum ada.
- [ ] Evaluasi berulang tidak membuat goal duplikat.
- [ ] Kontribusi manual tidak diturunkan oleh sinkronisasi saldo.
- [ ] Nilai progres maksimum Rp10 juta.
- [ ] Saldo EUR tidak dihitung ke target IDR pada MVP.
- [ ] CTA membuka Goals.
Step 2 dan Step 6
- [ ] Hutang diklasifikasikan berdasarkan kind jika tersedia.
- [ ] Fallback nama tidak menimpa klasifikasi eksplisit.
- [ ] Pembayaran/lunasi hutang memperbarui hasil evaluasi.
- [ ] Kondisi faktual “tidak ada KPR” tidak melewati gate.
Step 3
- [ ] Coverage memakai pengeluaran esensial yang terdefinisi.
- [ ] Coverage minimal 3 bulan memenuhi kondisi dasar.
- [ ] Data pengeluaran tidak cukup menghasilkan UNKNOWN.
- [ ] Target 6 bulan dapat ditampilkan sebagai milestone lanjutan.
Step 4
- [ ] Transfer internal tidak dihitung sebagai income.
- [ ] Kontribusi investasi tidak dihitung ganda.
- [ ] Rasio tidak dihitung jika pendapatan tidak valid/nol.
- [ ] Bulan berjalan ditandai sebagai sementara.
- [ ] Perhitungan dapat diuji tanpa akses ke LLM.
Step 5 dan Step 7
- [ ] Kedua langkah selalu tampil.
- [ ] Step 5 mendukung NOT_APPLICABLE.
- [ ] Goal yang baru direncanakan tidak disamakan dengan target yang tercapai.
- [ ] Satu transaksi berbagi tidak otomatis menandai Step 7 selesai.
UX, akses, dan kualitas
- [ ] Tangga tampil di atas sinyal bulanan.
- [ ] Langkah aktif memiliki satu CTA utama.
- [ ] Status disertai alasan yang bisa dipahami pengguna.
- [ ] Semua query finansial dibatasi berdasarkan pengguna terautentikasi.
- [ ] Tidak ada pengiriman data finansial ke LLM untuk evaluasi tangga.
- [ ] Unit test mencakup edge cases utama dan regresi bug progres.
15. Strategi testing
Unit test
- Setiap fungsi perhitungan memiliki input/output deterministik.
- Step 1: batas Rp0, Rp5 juta, Rp10 juta, dan di atas Rp10 juta.
- Step 3: coverage di bawah 3, tepat 3, di atas 3, data kosong, denominator nol.
- Step 4: 0%, 19,99%, tepat 20%, lebih dari 20%, income nol, transfer internal, refund, dan transaksi duplikat.
- Step 2/6: hutang aktif, lunas, KPR, non-KPR, jenis eksplisit versus inferensi nama.
- Gate: seluruh kombinasi kondisi yang relevan; langkah belakang terpenuhi tetapi langkah awal gagal.
- NOT_APPLICABLE dan UNKNOWN.
- Re-evaluasi setelah transaksi/goal/debt berubah.
Integration test
- Goals, Accounts, Debts, Transactions, Categories dan preferensi terhubung benar.
- Goal sistem di-upsert tanpa duplikasi.
- API membutuhkan sesi autentikasi.
- Pengguna tidak dapat membaca data pengguna lain.
- CTA mengarah ke route yang benar.
UI test
- Tangga tampil di atas sinyal bulanan.
- Status dan alasan tampil pada desktop dan mobile.
- Langkah terkunci tetap menjelaskan kondisi faktualnya.
- Loading, empty, error, dan data tidak cukup memiliki tampilan yang jelas.
Regression test wajib
Reproduksi bug sebelumnya: saldo Step 1 = Rp0, sementara Step 6 tidak memiliki KPR. Hasil yang benar: progres 0%; Step 1 menjadi fokus; Step 6 tetap terkunci walaupun kondisi faktualnya terpenuhi.
16. Tahapan implementasi
P0 — Kebenaran progres
- Formalisasi status dan sequential gate.
- Tambahkan regression test.
- Pastikan progres dihitung hanya dari langkah berurutan.
P1 — Sumber data yang tepercaya
- Sinkronisasi goal Step 1 yang idempotent.
- Perjelas saldo likuid yang eligible.
- Perjelas jenis debt dan fallback inferensi.
- Tambahkan status UNKNOWN dan alasan evaluasi.
P2 — Kualitas metrik
- Klasifikasi goal dan kategori terstruktur.
- Perhitungan dana darurat berdasarkan pengeluaran esensial.
- Perhitungan kontribusi investasi dan pendapatan yang memenuhi syarat.
- Preferensi relevansi pendidikan anak.
- Definisi target Step 7 yang dapat diverifikasi.
P3 — Penyempurnaan UX
- Visual tangga tujuh tingkat.
- Detail alasan dan kualitas data.
- Milestone, riwayat status, dan notifikasi berbasis perubahan kondisi.
17. Risiko dan mitigasi
Risiko	Dampak	Mitigasi
Heuristik nama salah klasifikasi	Status langkah salah	Field terstruktur sebagai sumber utama; fallback dapat dikonfirmasi
Saldo tabungan dihitung ganda	Progres terlalu tinggi	Pisahkan saldo eligible dan kontribusi manual; hindari penjumlahan yang ambigu
Transfer dianggap investasi	Rasio investasi tidak akurat	Klasifikasi tujuan transaksi dan deduplikasi
Gate terlalu kaku	Fakta pengguna terasa diabaikan	Pisahkan conditionMet, gateUnlocked, dan creditedComplete
Data historis minim	Metrik tidak stabil	UNKNOWN/indikator kualitas data dan penjelasan estimasi
Target tidak relevan bagi pengguna	Pengalaman terasa memaksa	Preferensi NOT_APPLICABLE dengan aturan denominator yang jelas
Penghitungan Step 7 terlalu longgar	Klaim progres menyesatkan	Pisahkan PLANNED, ACTIVE, dan ACHIEVED
Request bersamaan membuat goal duplikat	Data Goals kotor	Upsert idempotent dan unique key yang sesuai


18. Keputusan produk yang perlu dikunci sebelum implementasi final
1. Dana Step 1: apakah saldo yang sudah dialokasikan untuk tagihan akan dikecualikan melalui fitur alokasi dana, atau MVP hanya menggunakan daftar rekening eligible?
2. Investasi Step 4: apakah kontribusi bersih bulanan dihitung dari setoran ke instrumen, atau dari transfer ke rekening investasi? Rekomendasi: kontribusi nyata yang terklasifikasi eksplisit, tanpa double-count.
3. Periode Step 4: rekomendasi adalah bulan berjalan sebagai indikator dan tiga bulan lengkap sebagai indikator konsistensi.
4. Step 5: konfirmasi bahwa NOT_APPLICABLE dikeluarkan dari denominator progres efektif tetapi tetap terlihat pada visual.
5. Step 7: tetapkan kriteria “ACHIEVED” berdasarkan target goal yang terukur; keberadaan transaksi donasi saja tidak cukup.
6. Step 6: pertahankan sebagai tujuan dalam kerangka, tetapi jangan menyatakan pelunasan dipercepat selalu merupakan pilihan finansial terbaik.
19. Definition of Done
Fitur siap dianggap selesai ketika:
- Semua acceptance criteria P0–P2 terpenuhi.
- Regression test sequential gate lulus.
- Tidak ada penghitungan ganda pada saldo dan transaksi investasi dalam kasus uji yang didukung.
- Status UNKNOWN dan NOT_APPLICABLE ditampilkan dengan benar.
- Semua CTA, loading state, error state, dan tampilan mobile berfungsi.
- Tidak ada akses lintas pengguna atau pengiriman data finansial ke provider AI.
- Dokumentasi rumus dan reason code tersedia bagi developer.
- Test suite dan build aplikasi lulus.
Catatan implementasi: PRD ini adalah spesifikasi produk. Sebelum mengubah skema MongoDB/Mongoose atau API yang sudah ada, developer perlu memetakan model existing dan membuat migrasi kompatibel. Jangan mengganti kontrak data lama hanya berdasarkan nama field yang diusulkan dalam dokumen ini.