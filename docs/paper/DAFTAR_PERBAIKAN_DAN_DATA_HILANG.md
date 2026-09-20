# Daftar Perbaikan & Data yang Masih Hilang

**Untuk:** Tim penulis paper MBGCircular
**Dokumen pendamping:** `PAPER_MBGCircular_DRAF_FINAL.md`, `LAPORAN_AUDIT_PAPER.md`

Dokumen ini memuat dua bagian: **(A)** perbaikan yang dapat dikerjakan tanpa pengujian baru, dan **(B)** data yang harus diukur. Setiap butir menyebutkan siapa yang perlu mengerjakan dan berapa lama.

---

## Bagian A — Perbaikan yang dapat dikerjakan sekarang

Tidak memerlukan pengujian. Dapat diselesaikan dalam 1–2 hari.

| # | Perbaikan | Lokasi di draf | Prioritas | Penanggung jawab | Waktu |
|---|---|---|---|---|---|
| A1 | **Putuskan atribusi angka 81,78–82,29%**: kutipan Akmal (2024), atau hasil pengukuran tim? | Seluruh naskah | **Critical** | Penulis utama | 10 menit |
| A2 | Lengkapi entri daftar pustaka untuk 5 sumber yang sudah dikutip | Daftar Pustaka | **Critical** | Penulis | 2–3 jam |
| A3 | Tulis Tinjauan Pustaka (Bagian 2) — minimal 3–5 studi *plate waste* + 2–3 studi BSF | Bagian 2 | **Critical** | Penulis | 1 hari |
| A4 | Isi tanggal mulai & berakhir penelitian serta karakteristik lokasi | Bagian 3.1 | High | Penulis | 15 menit |
| A5 | Isi pernyataan pendanaan, konflik kepentingan, dan kontribusi penulis | Bagian PERNYATAAN | High | Seluruh penulis | 30 menit |
| A6 | Sisipkan **Gambar 1** (diagram arsitektur) — sudah ada deskripsi teks di Bagian 3.4 | Bagian 3.4 | High | Penulis | 1 jam |
| A7 | Sesuaikan abstrak dengan batas kata jurnal tujuan | Abstrak | Medium | Penulis | 30 menit |
| A8 | Seragamkan gaya sitasi sesuai template jurnal | Seluruh naskah | Medium | Penulis | 1 jam |
| A9 | Hapus seluruh placeholder `[PERLU DATA]` yang tidak dapat diisi — ubah menjadi pernyataan keterbatasan | Seluruh naskah | High | Penulis | 1 jam |
| A10 | Sertakan lampiran data mentah (atau nyatakan tidak disertakan beserta alasannya) | Lampiran | Medium | Penulis | 1 jam |
| A11 | Konfirmasi judul baru disetujui seluruh penulis | Judul | High | Tim | 15 menit |
| A12 | Lengkapi nomor pasal Peraturan BGN No. 1/2026 yang dikutip | Pendahuluan 1.1 | Medium | Penulis | 1 jam |

### A1 — Mengapa ini paling penting

Angka 81,78–82,29% muncul sebagai **kutipan** (Akmal, 2024) di bagian Manfaat/Dampak, tetapi sebagai **hasil pengukuran sendiri** di Abstrak, Tabel 2, Tabel 4, dan Pembahasan. Ini tidak dapat dibiarkan: reviewer akan menemukannya, dan efeknya merusak kredibilitas seluruh naskah.

Tiga kemungkinan jawaban:

| Jawaban | Konsekuensi |
|---|---|
| **Kutipan Akmal (2024)** | Draf final sudah benar. Cukup pastikan seluruh penyebutan konsisten sebagai rujukan pembanding. **Tidak perlu eksperimen.** |
| **Hasil pengukuran tim** | Wajib menyertakan `W₀`, `Wₜ`, durasi, dan jumlah ulangan. Tanpa itu, klaim tidak dapat dipertahankan → kerjakan Bagian B1 |
| **Tidak yakin** | Gunakan jalur kutipan sampai data ditemukan. Jangan menuliskan sebagai hasil. |

---

## Bagian B — Data yang harus diukur

### B1. Eksperimen biokonversi minimum (paling berdampak)

**Untuk apa:** menutup klaim Tabel 2 (reduksi sampah & durasi penguraian). Tanpa ini, klaim biologis harus dihapus seluruhnya.

| Aspek | Ketentuan |
|---|---|
| **Durasi** | 48 jam (pengamatan pada 24 dan 48 jam) |
| **Perlakuan** | 2 wadah berisi larva + **1 wadah kontrol TANPA larva** |
| **Substrat** | 1 kg sisa makanan per wadah, dari sumber yang sama |
| **Yang ditimbang** | `W₀` (awal), `Wₜ` (24 jam), `Wₜ` (48 jam) |
| **Yang dicatat** | Densitas larva (gram larva/kg substrat), instar, suhu ruang, kelembapan |
| **Wajib dicatat** | **Basis bobot: BASAH atau KERING** |
| **Rumus** | `ERS = (W₀ − Wₜ)/W₀ × 100%`, dilaporkan bersama durasi `t` |
| **Rumus lanjutan** | `ERS_bebas_evaporasi` = selisih dengan kontrol |

**Mengapa kelompok kontrol wajib:** tanpa kontrol, penurunan bobot basah dapat berasal dari **penguapan air**, bukan konversi oleh larva. Satu wadah kontrol memisahkan keduanya — dan inilah pembeda antara data yang dapat dipertahankan dan yang akan ditolak reviewer.

**Yang harus dilaporkan apa adanya:** jika hasilnya 30% atau 50%, laporkan 30% atau 50%. **Angka rendah dengan metode benar jauh lebih kuat daripada angka tinggi tanpa metode.** Dan jangan sebut "WRI" bila rumus tidak memuat dimensi waktu — sebut **ERS**.

Berkas kerja: `docs/VALIDASI_PENGUJIAN.md` Bagian 3.

---

### B2. Akurasi deteksi (menggantikan klaim 92%)

**Untuk apa:** menutup klaim akurasi dan mendukung klaim multikelas.

| Aspek | Ketentuan |
|---|---|
| **Jumlah minimum** | 150 ompreng (target 300) |
| **Pengambilan** | Jangan hanya ompreng bersisa — sertakan yang kosong |
| **Pelabelan** | Minimal **2 pelabel independen**; pelabel ketiga sebagai pemutus |
| **Yang dilarang** | Memakai keluaran Roboflow sebagai *ground truth* |
| **Yang dilaporkan** | Matriks konfusi, presisi, recall, F1 **per kelas**, macro-F1, dan **baseline mayoritas-kelas** |

**Mengapa baseline wajib:** kutipan paper sendiri menyatakan 85–88% siswa menyisakan makanan. Model yang selalu menjawab "ada sisa" akan memperoleh akurasi 85–88% tanpa belajar apa pun. Tanpa baseline, angka akurasi mudah disalahartikan.

Berkas kerja: `tools/validasi/hitung-akurasi.py` (sudah siap pakai).

**Perkiraan waktu:** 3–5 hari (termasuk pelabelan).

---

### B3. Kalibrasi load cell (menggantikan klaim galat <1%)

**Untuk apa:** menutup klaim presisi penimbangan.

| Aspek | Ketentuan |
|---|---|
| **Massa acuan** | 5 titik, mis. 50 g, 100 g, 200 g, 500 g, 1000 g |
| **Ulangan** | 5× per titik |
| **Yang dihitung** | Galat %FS, repeatability (simpangan baku), R² regresi linier |
| **Wajib dinyatakan** | **Rentang bobot tempat galat diukur** |

**Konteks dari audit:** data yang ada justru berada di dekat ambang deteksi (0,02 kg/sesi) dengan 90% baris bernilai 0 — yaitu **lantai derau**. Angka "galat <1%" tanpa menyebut rentang tidak bermakna: 1% dari 0,02 kg = 0,2 gram, tidak realistis untuk *load cell* 10 kg.

Berkas kerja: `docs/VALIDASI_PENGUJIAN.md` Bagian 2.

**Perkiraan waktu:** 1 hari.

---

### B4. Latensi inferensi Roboflow

**Untuk apa:** melengkapi Tabel 2.

| Aspek | Ketentuan |
|---|---|
| **Cara** | `ROBOFLOW_API_KEY=<kunci> node tools/benchmark/03-benchmark-latency.mjs --n=30` |
| **Yang dilaporkan** | min, median, rata-rata, p95, maks, dan **n** |

**Catatan:** instrumentasi berjenjang kini sudah terpasang permanen di backend, sehingga distribusi latensi dapat dihitung ulang kapan saja dari data nyata tanpa pengukuran manual.

**Perkiraan waktu:** 1 jam (tersedia kunci API).

---

### B5. Data lapangan multi-hari

**Untuk apa:** menutup Tabel 3 dan membuat distribusi kategori layak dilaporkan.

| Aspek | Kondisi saat ini | Minimum yang diperlukan |
|---|---|---|
| Jumlah hari | **1 hari** | ≥ 5 hari sekolah |
| Baris bermakna | 6 dari 60 (90% nol) | Perbaiki validasi dulu (sudah dikerjakan di kode) |
| Jumlah transaksi | 6 | ≥ 100 |

**Penting:** perbaikan validasi pada kode **sudah selesai** — sesi dengan bobot 0 kg kini ditolak, dan pengiriman hasil simulasi tidak lagi disimpan. Namun perbaikan itu **belum aktif di produksi** karena migrasi basis data belum dijalankan (lihat `docs/PANDUAN_EKSEKUSI_OPERATOR.md`).

---

### B6. Etika & tata kelola data

| Butir | Kondisi | Kebutuhan |
|---|---|---|
| Persetujuan sekolah | Belum ada | Surat persetujuan |
| Persetujuan orang tua/wali | Belum ada | Mekanisme & bentuk |
| Kebijakan retensi citra | Belum ada | Durasi simpan & prosedur hapus |
| Pernyataan UU PDP No. 27/2022 | Belum ada | Pernyataan kepatuhan |

**Wajib sebelum submit ke jurnal mana pun** untuk penelitian yang melibatkan citra anak di bawah umur.

**Mitigasi yang sudah ada dan dapat dinyatakan:** skema basis data **tidak menyimpan** nama, nomor induk, atau identitas siswa — hanya tanggal, kategori, bobot, dan cap waktu.

---

## Bagian C — Keputusan strategis

Anda perlu memilih satu jalur sebelum melanjutkan.

| Jalur | Isi | Waktu | Kekuatan |
|---|---|---|---|
| **A. System design & feasibility** | Rancangan + verifikasi fungsional. Klaim biologis dihapus. | 2 hari (A1–A12) | Jujur, dapat dipertahankan, kontribusi jelas |
| **B. A + data minimum** | Jalur A + B1 (maggot 3 wadah 48 jam) + B3 (kalibrasi) | 4–6 hari | Jauh lebih kuat; satu klaim biologis sah |
| **C. A + B + akurasi** | Jalur B + B2 (150 foto berlabel) | 8–12 hari | Paling kuat; semua tabel terisi |

**Rekomendasi: Jalur B.** Memberi satu klaim biologis yang sah dengan tambahan waktu paling kecil. Klaim akurasi (B2) adalah nilai tambah, bukan penentu kelayakan submit.

**Yang harus dihindari:** submit dengan angka biologis yang tidak pernah diukur. Itu bukan "data simulasi", melainkan **fabrikasi**, dan merupakan risiko terbesar pada naskah saat ini.

---

## Daftar centang sebelum submit

**Wajib:**
- [ ] Atribusi angka WRI diputuskan dan konsisten di seluruh naskah (A1)
- [ ] Daftar pustaka lengkap (A2)
- [ ] Tinjauan pustaka terisi (A3)
- [ ] `maggot_harvests` = 0 → klaim biomassa/pupuk dihapus atau data disediakan
- [ ] `menu_uploads` = 0 → klaim korelasi menu dihapus atau data disediakan
- [ ] Etika & tata kelola citra dilengkapi (B6)
- [ ] Tidak ada placeholder `[PERLU DATA]` yang tersisa tanpa penjelasan
- [ ] Judul sesuai cakupan data
- [ ] Gambar 1 disisipkan

**Sangat disarankan:**
- [ ] Eksperimen maggot 3 wadah termasuk kontrol (B1)
- [ ] Kalibrasi load cell terekam (B3)
- [ ] Latensi Roboflow terukur (B4)
- [ ] Akurasi per kelas + baseline mayoritas-kelas (B2)

**Sebelum data lapangan dikumpulkan:**
- [ ] Jalankan 4 migrasi basis data (`docs/PANDUAN_EKSEKUSI_OPERATOR.md`)
- [ ] Deploy backend versi baru — agar sesi tanpa nilai tidak lagi tersimpan
- [ ] Pastikan rentang tanggal data yang dikutip hanya memuat baris bermakna

---

## Satu hal yang perlu diperhatikan saat mengumpulkan data baru

Sistem saat ini membagi bobot ke jenis makanan berdasarkan **luas kotak pembatas** saja, tanpa memperhitungkan densitas jenis makanan. Audit mengukur dampaknya pada deteksi nyata: **nasi +30,3%** dan **sayur −28,4%** dibanding metode yang memperhitungkan densitas. Karena luaran utama sistem adalah peringkat makanan terbuang, selisih ini **berpotensi mengubah peringkat dan rekomendasi menu**.

Selama peringkat menjadi salah satu luaran yang dilaporkan, perbaikan ini perlu dikerjakan sebelum data dikumpulkan dalam jumlah besar. Rancangannya tersedia di `docs/WEIGHT_ESTIMATION_DESIGN.md`, dan aktivasi awalnya tidak memerlukan kalibrasi (cukup memakai ambang keyakinan deteksi).
