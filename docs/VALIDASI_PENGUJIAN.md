# Protokol Validasi & Template Pengumpulan Data

**Untuk:** Tim penulis paper MBGCircular dan operator lapangan
**Tujuan:** Mengisi tag `[PERLU DATA]` pada dokumen revisi paper dengan data aktual — tanpa mengarang.
**Prinsip:** Setiap angka di paper harus dapat ditelusuri ke berkas data mentah. Dokumen ini menyediakan prosedur dan template agar hal itu terpenuhi.

---

## 0. Ringkasan: apa yang harus diukur, dan mengapa

| # | Yang harus diukur | Menutup klaim di paper | Alat | Perkiraan waktu |
|---|---|---|---|---|
| 1 | Akurasi deteksi per kelas | "akurasi 92%" (Abstrak, Tabel 4, Pembahasan) | `tools/validasi/hitung-akurasi.py` + lembar label | 3-5 hari |
| 2 | Kalibrasi & galat load cell | "galat <1%" (Tabel 4) | Template §2 + massa acuan | 1 hari |
| 3 | Efisiensi reduksi sampah (WRI/ERS) | "WRI 81,78-82,29%", "<24 jam" | Worksheet §3 | 3-4 minggu |
| 4 | Latency rantai AIoT | "latency <2 detik" | `tools/benchmark/03-benchmark-latency.mjs` | 2 jam |
| 5 | `n` setiap klaim | Seluruh Tabel 4 | Sudah tersedia: `docs/AUDIT_INTEGRITAS_DATA.md` | selesai |
| 6 | Karakterisasi produk (kasgot/biomassa) | Judul paper | Uji laboratorium eksternal | 2-4 minggu |
| 7 | Dampak kapasitas SDM (RQ-3) | Rumusan masalah 3 | Kuesioner pre/post | 2 minggu |

---

## 1. Akurasi Deteksi AI

### 1.1 Mengapa pendekatan "satu angka akurasi" tidak cukup

Paper mengutip bahwa **85-88% siswa menyisakan makanan** (FISIP UI, 2025). Artinya distribusi kelas sangat tidak seimbang: kelas "ada sisa makanan" jauh lebih banyak daripada "tidak ada sisa". Pada kondisi seperti itu, model yang **selalu** menjawab "ada sisa makanan" akan otomatis mendapat akurasi ~85-88% **tanpa belajar apa pun**. Karena itu, akurasi mentah tidak bermakna tanpa pembanding.

`hitung-akurasi.py` selalu menghitung **baseline mayoritas-kelas** dan menampilkan selisihnya, sehingga reviewer tidak dapat menuduh angka akurasi kita menyesatkan.

### 1.2 Prosedur pengumpulan data

**Persiapan**
1. Tentukan definisi label. Disarankan dua tingkat:
   - **Tingkat 1 (biner):** `ada_sisa` / `tidak_ada` — untuk menjawab Rumusan Masalah 1 sebagaimana Tabel 1.
   - **Tingkat 2 (multikelas):** kategori makanan (`nasi`, `sayur`, `lauk`, `buah`) atau kelas Roboflow langsung — **ini yang sudah berjalan di sistem** dan perlu dibuktikan.
2. Siapkan lembar label (CSV) dengan dua kolom: `kebenaran` dan `prediksi`.

**Pengambilan sampel**
3. Ambil **minimal 150 ompreng** (target 300 bila memungkinkan). Jangan hanya mengambil ompreng yang bersisa.
4. Setiap ompreng: foto dengan alat, catat tanggal/waktu, dan **catat nilai Roboflow yang keluar**. Cara termudah: ambil dari respons backend (field `deteksi[].kelas`) dan simpan.
5. **Pelabelan ground truth oleh manusia** — minimal 2 pelabel independen. Bila berbeda pendapat, libatkan pelabel ketiga sebagai pemutus. Catat jumlah ketidaksepakatan (bisa dilaporkan sebagai ukuran keandalan antar-pelabel).
6. **Jangan** memakai keluaran Roboflow sebagai `kebenaran`. Ini kesalahan fatal yang akan membatalkan validitas.

**Format CSV**
```csv
kebenaran,prediksi
nasi,nasi
sayur,lauk
ada_sisa,ada_sisa
tidak_ada,ada_sisa
```

**Menjalankan perhitungan**
```bash
python3 tools/validasi/hitung-akurasi.py data-label-ompreng.csv \
  --keluaran hasil-akurasi.txt
```

**Keluaran yang wajib masuk paper:** `n`, confusion matrix lengkap, macro-F1, weighted-F1, dan baseline mayoritas-kelas beserta selisihnya.

### 1.3 Kriteria penerimaan

| Kriteria | Status |
|---|---|
| n ≥ 150 ompreng dengan label terverifikasi | ☐ |
| Pelabelan oleh ≥ 2 orang independen | ☐ |
| Confusion matrix dilaporkan lengkap | ☐ |
| Baseline mayoritas-kelas dilaporkan | ☐ |
| Akurasi **per kelas** dilaporkan (bukan hanya total) | ☐ |
| Bila akurasi ≤ baseline + 5 poin: **jangan** klaim kinerja model | ☐ |

> **Catatan penting untuk paper manager:** sistem saat ini **sudah multikelas** (Roboflow mengembalikan kelas seperti `Ayam_Goreng`, `tempe`, `cap_cai`, `Kelengkeng`, `nasi`, dan backend memetakannya ke kategori). Dokumen revisi yang menyatakan AI "hanya biner" perlu ditinjau ulang. Namun klaim multikelas **hanya boleh dipertahankan bila** protokol di atas dijalankan dan metrik per kelas dilaporkan. Tanpa itu, mengganti satu overclaim dengan overclaim lain.

---

## 2. Kalibrasi dan Galat Load Cell

### 2.1 Konteks dari audit data (penting)

Audit database produksi (`docs/AUDIT_INTEGRITAS_DATA.md`) menemukan:
- Total seluruh data limbah = **0,200 kg**, dengan **54 dari 60 baris bernilai 0 kg**.
- Ambang minimum agar satu sesi penimbangan dimulai = **0,02 kg** (`DUMP_DELTA_KG`, `smart_container_esp32cam.ino`).

Artinya data yang ada berada di **lantai derau** sensor. Klaim "galat <1%" tidak dapat ditafsirkan tanpa menyebut rentang bobotnya: galat 1% dari 0,02 kg = 0,2 gram, dan itu tidak realistis untuk load cell 10 kg dengan HX711. **Yang harus dilaporkan adalah galat pada rentang bobot yang benar-benar dipakai.**

### 2.2 Prosedur

**Alat:** 5 massa acuan terverifikasi yang mencakup rentang pemakaian nyata, mis. **50 g, 100 g, 200 g, 500 g, 1000 g**. Timbangan pembanding dengan resolusi ≥ 0,1 g.

**Langkah:**
1. Nyalakan alat, biarkan stabil 60 detik.
2. Tekan **Tare** dalam kondisi wadah kosong. Catat bahwa tare dilakukan sekali di awal.
3. Untuk setiap massa acuan: letakkan, tunggu stabil (LCD menunjukkan nilai tetap), catat pembacaan. **Ulangi 5 kali** (angkat dan letakkan kembali setiap kali).
4. Catat semuanya di CSV: `massa_acuan_g,ulangan,pembacaan_g`.
5. Ulangi seluruh rangkaian **setelah 30 menit** untuk mengukur drift.

**Rumus:**
- Galat mutlak: `e = pembacaan − massa_acuan`
- Galat relatif: `galat% = (e / massa_acuan) × 100`
- **Galat %FS (full scale):** `(e_maks / 10000 g) × 100` — cara ini yang lazim dipakai untuk spesifikasi sensor
- **Repeatability:** simpangan baku dari 5 ulangan pada massa yang sama
- **Linieritas:** regresi linear `pembacaan = a × massa + b`; laporkan R² dan `a`

**Template CSV:**
```csv
massa_acuan_g,ulangan,pembacaan_g
50,1,
50,2,
100,1,
```

### 2.3 Kriteria penerimaan

| Kriteria | Status |
|---|---|
| ≥ 5 titik kalibrasi, masing-masing ≥ 5 ulangan | ☐ |
| R² regresi linier dilaporkan | ☐ |
| Galat %FS dilaporkan (bukan hanya %) | ☐ |
| **Rentang bobot tempat galat diukur dinyatakan eksplisit** | ☐ |
| Repeatability (simpangan baku) dilaporkan | ☐ |
| Diuji drift setelah 30 menit | ☐ |

---

## 3. Worksheet Biokonversi Maggot BSF (WRI / ERS)

### 3.1 Koreksi istilah yang diminta dokumen revisi

Rumus yang dipakai paper, `WRI = (W0 − Wt)/W0 × 100%`, **tidak memuat komponen waktu**. Rumus ini mengukur **efisiensi degradasi massa**, bukan laju. Karena itu disarankan menyebutnya **Efisiensi Reduksi Sampah (ERS)** dan melaporkan durasi `t` secara terpisah.

Bila tetap ingin memakai istilah WRI, gunakan bentuk ternormalisasi waktu:
`WRI_ternormalisasi = ((W0 − Wt) / W0) / t`

**Worksheet ini menghitung keduanya** agar tim dapat memilih dan mempertanggungjawabkannya.

### 3.2 Data yang wajib dicatat per ulangan

| Kolom | Keterangan |
|---|---|
| `ulangan` | Nomor ulangan (target **≥ 3**) |
| `tanggal_mulai` / `tanggal_selesai` | Tanggal |
| `durasi_jam` (t) | Selisih waktu pengamatan |
| `w0_gram` | Bobot awal sampah organik |
| `wt_gram` | Bobot sisa tidak terurai |
| `basis_bobot` | **`basah` atau `kering`** — WAJIB dicatat, karena kehilangan air (evaporasi) dapat ikut menurunkan bobot basah tanpa kontribusi larva |
| `kontrol_tanpa_larva_w0` / `wt` | **Wajib** untuk memisahkan kontribusi evaporasi |
| `densitas_larva` | larva per kg substrat |
| `instar_larva` | mis. instar 5 |
| `laju_pakan_gram_per_hari` | |
| `suhu_c` / `kelembapan_persen` | Kondisi ruang |
| `jumlah_larva_awal` | Bila dihitung |

**Perhitungan:**
- `ERS = (W0 − Wt) / W0 × 100%`
- `WRI_ternormalisasi = ((W0 − Wt) / W0) / t`
- `ERS_bebas_evaporasi = ((W0 − Wt) − (W0k − Wtk)) / W0 × 100%` ← **ini angka yang paling dapat dipertanggungjawabkan** karena sudah dikurangi kontrol

### 3.3 Template CSV

```csv
ulangan,tanggal_mulai,tanggal_selesai,durasi_jam,w0_gram,wt_gram,basis_bobot,kontrol_w0,kontrol_wt,densitas_larva,instar,laju_pakan,suhu_c,kelembapan_persen
1,,,24,,,basah,,,,,,,
2,,,24,,,basah,,,,,,,
3,,,24,,,basah,,,,,,,
```

### 3.4 Kriteria penerimaan

| Kriteria | Status |
|---|---|
| ≥ 3 ulangan | ☐ |
| Basis bobot (basah/kering) dicatat & dinyatakan | ☐ |
| Ada kelompok kontrol tanpa larva | ☐ |
| ERS dilaporkan bersama durasi `t` | ☐ |
| Parameter biologis (densitas, instar, laju pakan, suhu) dicatat | ☐ |
| Angka ERS dilaporkan beserta rentang, bukan angka tunggal | ☐ |

> **Catatan atribusi (paling penting):** dokumen revisi menandai bahwa angka 81,78-82,29% muncul sebagai kutipan (Akmal, 2024) di satu bagian tetapi sebagai hasil sendiri di bagian lain. **Ini harus diputuskan sebelum submisi.** Bila angka tersebut dari Akmal (2024), paper hanya boleh menyebutnya sebagai rujukan pembanding. Bila dari pengujian tim, worksheet ini yang mengisi datanya.

---

## 4. Latency Rantai AIoT

Sudah tersedia dan dapat dijalankan: `tools/benchmark/03-benchmark-latency.mjs`. Lihat `docs/LAPORAN_PENGUKURAN_PAPER.md` untuk hasil yang sudah terukur.

**Yang masih perlu** adalah latency **per transaksi nyata** di lapangan, yang memerlukan instrumentasi berjenjang di backend (patch tersedia dalam rencana kerja) dan sinkronisasi waktu (NTP) di firmware — karena saat ini perangkat tidak memiliki cap waktu absolut.

**Kriteria penerimaan:** laporkan `n`, median, p95, dan maksimum; **jangan** satu angka "latency = X detik".

---

## 5. Perlindungan Data & Etika (wajib untuk submisi)

Sistem merekam citra ompreng yang dapat ditautkan pada identitas siswa (anak di bawah umur) melalui ID transaksi. Untuk memenuhi butir etika pada dokumen revisi dan **UU No. 27 Tahun 2022 (PDP)**:

| Item | Status | Catatan |
|---|---|---|
| Persetujuan sekolah/komite etik | ☐ | Sertakan nomor surat |
| Persetujuan orang tua/wali | ☐ | Bentuk dan cakupannya |
| Kebijakan retensi citra | ☐ | Berapa lama disimpan, lalu dihapus |
| Anonimisasi | ☐ | **Tidak ada** PII siswa yang boleh tayang di dashboard publik |
| Akses foto | ☐ | Bucket `menu-foto` saat ini publik; foto menu ≠ foto siswa, pastikan tidak tercampur |

> **Temuan terkait:** pada skema saat ini tidak ditemukan PII siswa (nama/NIS) — tabel hanya memuat agregat kategori dan bobot. Ini dapat dinyatakan sebagai mitigasi, **tetapi** foto di storage tetap perlu kebijakan retensi yang eksplisit.

---

## 6. Daftar centang akhir sebelum submisi

- [ ] Setiap angka di Tabel 4 memiliki `n` dan rentang.
- [ ] Label provenance pada `waste_records` sudah aktif (`is_simulated`) sehingga data simulasi tidak tercampur.
- [ ] Data yang dikutip **tidak** memuat baris `berat_kg = 0` sebagai bukti penimbangan.
- [ ] Angka akurasi disertai confusion matrix dan baseline mayoritas-kelas.
- [ ] Angka WRI/ERS disertai jawaban atas atribusi sumber dan basis bobot.
- [ ] Galat load cell disertai rentang bobot pengukuran.
- [ ] Klaim multikelas disertai metrik per kelas.
- [ ] Judul paper disesuaikan bila karakterisasi produk belum ada datanya.
- [ ] Pernyataan etika dan tata kelola citra dilengkapi.
- [ ] `docs/LAPORAN_PENGUKURAN_PAPER.md` dilampirkan sebagai bukti pengukuran.

---

*Dokumen ini tidak memuat data hasil, melainkan prosedur dan template. Seluruh angka yang diisi ke dalamnya harus berasal dari pengukuran aktual tim.*
