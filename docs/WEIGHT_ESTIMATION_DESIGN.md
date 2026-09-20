# Desain Estimasi Berat Berbasis Citra (Image-to-Mass)

**Status:** rancangan + hasil perbandingan kuantitatif · **Belum diaktifkan di produksi**
**Skrip bukti:** `tools/benchmark/04-bandingkan-metode-berat.mjs`
**Bukti mentah:** `tools/benchmark/hasil/perbandingan-metode-berat.{json,csv}`
**Fixture data:** `backend/test/fixtures/roboflow-predictions.json` (keluaran Roboflow **asli** tim)

---

## 1. Masalah pada metode yang berjalan sekarang

`hitungProportion()` di `backend/src/services/roboflowService.js` membagi berat dari load cell **murni proporsional terhadap luas bounding box**:

```
berat_i = totalBerat × (w_i · h_i) / Σ(w_j · h_j)
```

Dua cacat yang dapat dibuktikan:

**Cacat 1 — jenis makanan tidak diperhitungkan.** Tidak ada faktor per kelas sama sekali. Akibatnya 1 kg ayam goreng (berongga, ringan per volume) dan 1 kg nasi (padat) diperlakukan identik per satuan luas gambar. Padahal keduanya menempati luas gambar yang berbeda untuk massa yang sama.

**Cacat 2 — `confidence` dibuang sepenuhnya.** Nilai confidence hanya diteruskan sebagai field keluaran (`roboflowService.js:56`), tidak pernah dipakai untuk memfilter maupun membobot. Tidak ada ambang batas di mana pun (`grep` untuk `filter|threshold` tidak menemukan apa pun).

Cacat 2 bukan sekadar soal akurasi — ia punya konsekuensi operasional. Analisis sensitivitas di §4.3 menunjukkan: **satu deteksi palsu berluas besar (300×300 px) dengan confidence rendah (0,42) tetap mendapat 28,26% dari total berat** pada metode sekarang. Artinya satu kesalahan deteksi model dapat memindahkan lebih dari seperempat bobot sampah ke kategori yang salah.

---

## 2. Metode usulan

Generalisasi dari rumus lama, sehingga dapat dibandingkan dan dibalik:

```
berat_i = totalBerat × s_i / Σ s_j

s_i = d(kelas_i) · (w_i · h_i)^γ · c_i^β

c_i = max(0, confidence_i − θ) / (1 − θ)
```

| Parameter | Arti | Nilai awal | Status |
|---|---|---|---|
| `d(kelas)` | densitas relatif per kelas (nasi = 1,00) | tabel `food_density` | **belum tervalidasi** |
| `γ` (SIZE_EXPONENT) | eksponen ukuran→volume | 1,0 | perlu kalibrasi |
| `β` (CONFIDENCE_EXPONENT) | kekuatan penekanan deteksi berkonfidensi rendah | 0,0 | perlu kalibrasi |
| `θ` (CONFIDENCE_THRESHOLD) | ambang minimum deteksi dipakai | 0,40 | dapat dipakai sekarang |

**Sifat penting:** saat `γ=1`, `d=1` untuk semua kelas, dan `β=0`, rumus ini **kembali persis ke metode lama**. Karena itu peralihan bersifat **reversibel lewat satu variabel lingkungan** (`SKEMA_BERAT=luas_bbox_v1|densitas_v2`), tanpa deploy ulang kode.

**Integritas total terjaga.** Kedua metode memakai `totalBerat` dari load cell sebagai acuan; yang berubah hanya **distribusi antar kelas**, bukan total. Ini penting: total timbangan tetap menjadi kebenaran acuan, dan estimasi citra hanya menjawab "berapa bagian tiap jenis makanan".

---

## 3. Hasil perbandingan kuantitatif (data Roboflow asli)

Lima deteksi nyata dari model tim: `Ayam_Goreng` (conf 0,971), `tempe` (0,966), `Kelengkeng` (0,960), `nasi` (0,957), `cap_cai` (0,952). Total acuan 1 kg.

### 3.1 Per deteksi

| Kelas | Kategori | Luas px | Metode A (sekarang) | Metode B (γ=1) | Metode C (γ=1,5) |
|---|---|---:|---:|---:|---:|
| Ayam_Goreng | lauk | 80.934 | 27,2% | 24,8% | 28,0% |
| tempe | lauk | 35.037 | 11,8% | 14,6% | 10,8% |
| Kelengkeng | buah | 46.070 | 15,5% | 13,1% | 11,2% |
| nasi | nasi | 75.600 | 25,4% | **33,1%** | **36,1%** |
| cap_cai | sayur | 59.891 | 20,1% | **14,4%** | **14,0%** |
| | | **Total** | **1,0000 kg** | **1,0000 kg** | **1,0000 kg** |

### 3.2 Per kategori — inilah besaran perbedaannya

| Kategori | A (sekarang) | B (γ=1) | C (γ=1,5) | Selisih B−A | Selisih % |
|---|---:|---:|---:|---:|---:|
| nasi | 0,2541 | 0,3310 | 0,3607 | **+0,0769** | **+30,3%** |
| sayur | 0,2013 | 0,1442 | 0,1399 | **−0,0571** | **−28,4%** |
| buah | 0,1548 | 0,1311 | 0,1115 | −0,0237 | −15,3% |
| lauk | 0,3898 | 0,3937 | 0,3878 | +0,0040 | +1,0% |

**Bacaan yang paling penting untuk paper:** perbedaan terbesar jatuh pada **nasi (+30,3%) dan sayur (−28,4%)**. Ini bukan perbedaan kosmetik. Fitur unggulan paper adalah *ranking jenis makanan yang paling banyak terbuang untuk evaluasi menu SPPG*. Karena peringkat ditentukan oleh proporsi antar kategori, perubahan 28-30% pada dua kategori terbesar **dapat mengubah peringkat** — dan dengan demikian dapat mengubah rekomendasi menu yang diberikan ke SPPG.

Semakin tinggi proporsi sayur pada metode lama, semakin besar kemungkinan sistem merekomendasikan "kurangi porsi sayur". Metode baru menurunkan proporsi sayur 28,4% dan menaikkan nasi 30,3%. Arah perubahan ini konsisten dengan fisika (nasi lebih padat daripada sayur berkuah/berserat), **tetapi arah yang benar secara fisika belum sama dengan arah yang benar secara empiris** — itu tetap harus dibuktikan dengan data berlabel.

### 3.3 Sensitivitas terhadap eksponen ukuran (γ)

| γ | Proporsi nasi | Proporsi ayam | Tafsiran |
|---:|---:|---:|---|
| 0,50 | 29,69% | 21,50% | pertumbuhan sub-linear |
| 0,75 | 31,44% | 23,16% | |
| **1,00** | **33,10%** | **24,80%** | asumsi lama: luas sebanding massa |
| 1,25 | 34,64% | 26,41% | |
| **1,50** | **36,07%** | **27,97%** | asumsi 3D isotropik (volume ∝ panjang³) |
| 2,00 | 38,57% | 30,94% | pertumbuhan super-kuadratik |

Kisaran γ dari 0,5 sampai 2,0 menggeser proporsi nasi hanya ~9 poin persen (29,7% → 38,6%). **Kesimpulan: pilihan γ lebih tidak sensitif dibanding pilihan densitas per kelas.** Karena itu prioritas kalibrasi harus pada `d(kelas)`, bukan pada γ.

### 3.4 Sensitivitas terhadap pembobotan confidence (β) — temuan keamanan data

Skenario: ditambahkan satu deteksi **palsu** `nasi` berluas besar (300×300 px) dengan confidence rendah (0,42).

| β | Berat yang jatuh ke deteksi palsu itu |
|---:|---:|
| **0,0** | **28,26%** ← setara perilaku metode sekarang |
| 0,5 | 6,92% |
| 1,0 | 1,38% |
| 2,0 | 0,05% |

**Temuan:** dengan `θ=0,40` dan `β≥1`, deteksi palsu berkonfidensi rendah tersingkir hampir seluruhnya. Tanpa itu, satu kesalahan model menggeser 28% distribusi berat.

**Rekomendasi bertingkat, dari risiko terendah:**
1. **Aktifkan ambang `θ=0,40` saja (β=0, γ=1, densitas netral).** Ini sudah menghentikan masalah deteksi palsu, **tanpa** mengubah asumsi densitas, sehingga tidak memerlukan kalibrasi dan tidak mengubah angka yang sudah dilaporkan. Aman dijalankan lebih dulu.
2. Setelah data berlabel tersedia, baru aktifkan `d(kelas)` dengan nilai hasil kalibrasi.
3. Kalibrasi γ terakhir, karena paling tidak sensitif.

---

## 4. Parameter densitas

Disimpan di tabel `food_density` (lihat `supabase/migrations/20260920_provenance.sql`), **bukan di dalam kode**, supaya dapat diperbaiki tanpa deploy:

| Kolom | Fungsi |
|---|---|
| `kelas` | kelas Roboflow (mis. `Ayam_Goreng`, `tempe`) |
| `kategori` | kategori turunan (`nasi`/`sayur`/`lauk`/`buah`) |
| `densitas_relatif` | massa relatif per volume nyata, ternormalisasi nasi = 1,00 |
| `faktor_bentuk` | koreksi 3D→2D |
| `sumber` | asal nilai (wajib diisi saat kalibrasi) |
| `versi` | penanda versi; nilai awal `v0-belum-tervalidasi` |

**Nilai awal (SEMUA BELUM TERVALIDASI):**

| Kelas | Kategori | Densitas relatif |
|---|---|---|
| `nasi`, `rice` | nasi | 1,00 |
| `tempe` | lauk | 0,95 |
| `tahu` | lauk | 0,90 |
| `telur` | lauk | 0,95 |
| `ikan` | lauk | 0,75 |
| `Ayam_Goreng`, `ayam` | lauk | 0,70 |
| `pisang` | buah | 0,65 |
| `Kelengkeng` | buah | 0,65 |
| `cap_cai`, `sayur` | sayur | 0,55 |
| kelas tak dikenal | lainnya | 0,80 (default) |

> **Peringatan tegas:** angka-angka ini adalah **titik mulai berbasis penalaran fisika kualitatif** (nasi lebih padat daripada sayur), **bukan hasil pengukuran**. Angka ini **tidak boleh** dikutip di paper sebagai densitas terukur. Kolom `versi` sengaja memuat penanda `belum-tervalidasi` agar status ini tidak hilang.

---

## 5. Prosedur kalibrasi (menuju aktivas produksi)

**Data acuan yang dibutuhkan — dan mengapa load cell saja tidak cukup.**

Load cell memberi **satu** angka ground truth: total berat per sesi. Ia tidak memberi berat per kategori. Karena itu, penaksiran `d(kelas)` **tidak dapat** dilakukan dari data yang ada sekarang. Diperlukan pengambilan data tambahan:

1. **Sesi pemisahan manual.** Selama N sesi (target ≥ 30 sesi), sisa makanan dipisahkan per kategori **setelah** difoto dan ditimbang total. Setiap kategori kemudian ditimbang terpisah.
2. **Catat berpasangan:** keluaran Roboflow (kelas, luas, confidence) + berat nyata per kategori dari timbangan.
3. **Estimasi parameter.** Untuk setiap kelas, cari `d` yang meminimalkan galat antara distribusi hasil model dan distribusi berat nyata. Bentuk paling sederhana: regresi `berat_nyata_kategori ~ d_kategori × Σ(luas^γ)`.
4. **Validasi.** Bagi data: 70% kalibrasi, 30% uji (hold-out). **Laporkan metrik pada bagian uji saja.**
5. **Aktifkan bertahap** (lihat §3.4).

**Kriteria penerimaan (harus lulus sebelum `densitas_v2` diaktifkan penuh):**

| Kriteria | Ambang | Status |
|---|---|---|
| Ukuran data kalibrasi | ≥ 30 sesi dengan pemisahan manual | ☐ |
| Metrik pada data uji (hold-out) | MAPE distribusi per kategori **lebih rendah** daripada metode lama | ☐ |
| Perbaikan signifikan | Selisih MAPE > variabilitas antar-sesi | ☐ |
| Pembuktian jujur | **Bila metode baru TIDAK lebih baik, hasilnya tetap dilaporkan** | ☐ |
| Integritas total | Total berat tetap sama dengan load cell di setiap metode | ☑ (sudah terbukti) |

> Metrik yang wajib dilaporkan: MAE dan MAPE **per kategori**, bukan hanya rata-rata keseluruhan. Rata-rata dapat menyembunyikan kategori yang memburuk.

---

## 6. Batasan metode (harus dinyatakan di paper)

1. **Bounding box, bukan mask.** Luas kotak pembatas peka terhadap oklusi (saling menutupi) dan bentuk objek tak beraturan. Bila model Roboflow dapat mengeluarkan segmen/mask, luas mask akan jauh lebih tepat untuk estimasi volume. Ini perlu dikonfirmasi ke tim model.
2. **Tidak ada koreksi perspektif.** Kamera tetap membuat objek yang lebih jauh dari lensa tampak lebih kecil, sehingga beratnya direndahkan sistematis. Koreksi berbasis kedudukan `y` pada bidang lantai mungkin dilakukan, tetapi **hanya boleh diaktifkan bila kalibrasi membuktikan perbaikan** — bukan atas dasar teori.
3. **Literatur pendukung mengasumsikan objek terisolasi dengan skala diketahui.** Kondisi lapangan (objek menumpuk di wadah, kamera tetap di atas) lebih sulit daripada kondisi pada studi rujukan. Perlu dinyatakan secara eksplisit bahwa penerapan di sini adalah penyederhanaan.
4. **Densitas bergantung pada penyiapan makanan.** Nasi goreng, nasi putih, dan bubur nasi memiliki densitas berbeda; satu nilai per kelas adalah pendekatan kasar. Bila data memungkinkan, densitas sebaiknya dikondisikan pada jenis menu.
5. **Tidak dapat memisahkan cairan/kuah.** Kuah dapat terhitung pada beberapa kelas sekaligus, dan beratnya tidak dapat diestimasi dari citra dengan andal.

---

## 7. Rancangan implementasi di kode

| Berkas | Perubahan | Status |
|---|---|---|
| `backend/src/services/roboflowService.js` | Fungsi `hitungProportion(preds, total, {skemaBerat})`; tabel `DENSITAS_RELATIF`; filter ambang confidence; `densitasUntuk()`; mode `mock` eksplisit | **selesai** |
| `backend/src/services/iotProcessor.js` | Menyimpan `kelas`, `confidence_rata_rata`, `skema_berat`, `estimasi_mode`; menolak sesi `total ≤ 0` | **selesai** |
| `supabase/migrations/20260920_provenance.sql` | Tabel `food_density`; kolom provenance di `waste_records`; tabel `waste_record_kelas` | **selesai** (belum dijalankan di produksi) |
| `backend/test/hitungProportion.test.js` | 10 test mengunci perilaku `luas_bbox_v1` + memverifikasi `densitas_v2` | **selesai, lulus** |
| `tools/benchmark/04-bandingkan-metode-berat.mjs` | Harness perbandingan A/B | **selesai** |
| `.env` produksi | `SKEMA_BERAT`, `CONFIDENCE_THRESHOLD` | **belum** (menunggu keputusan) |

### Urutan aktivasi yang disarankan

```bash
# Langkah 1 (aman, tanpa kalibrasi): aktifkan ambang confidence saja.
# Tidak mengubah asumsi densitas; hanya membuang deteksi palsu berkonfidensi rendah.
SKEMA_BERAT=densitas_v2
CONFIDENCE_THRESHOLD=0.4
SIZE_EXPONENT=1.0        # sama dengan metode lama
CONFIDENCE_EXPONENT=0.0  # tanpa pembobotan confidence tambahan

# Langkah 2 (setelah kalibrasi): aktifkan densitas hasil pengukuran.
# Nilai di UPDATE-kan ke tabel food_density, bukan ke kode.

# Langkah 3 (opsional): aktifkan pembobotan confidence bila terbukti membantu.
CONFIDENCE_EXPONENT=1.0
```

**Rollback:** set `SKEMA_BERAT=luas_bbox_v1` dan deploy ulang. Tidak ada perubahan skema yang perlu dibatalkan, karena kedua metode memakai kolom yang sama.

---

## 8. Rujukan

- Standley, T., dkk. (2017). *image2mass: Estimating the Mass of an Object from Its Image.* ICML. [PDF](http://proceedings.mlr.press/v78/standley17a/standley17a.pdf) — dasar pendekatan memperkirakan massa dari citra 2D melalui volume visual × densitas kelas.
- Tinjauan sistematis estimasi berat ternak berbasis computer vision — menunjukkan regresi linier atas dimensi bounding box sebagai pendekatan paling umum. [ResearchGate](https://www.researchgate.net/publication/348652718_Computer_vision-based_weight_estimation_of_livestock_a_systematic_literature_review)
- Roboflow. *How to Measure Volume with Computer Vision.* [Blog](https://blog.roboflow.com/how-to-measure-volume-with-computer-vision/) — praktik pengukuran volume/mask dengan computer vision.

**Yang perlu ditambahkan tim (memerlukan pencarian literatur sendiri):** nilai densitas makanan Indonesia yang terverifikasi, dan studi pembanding estimasi berat makanan berbasis citra pada kantin sekolah.

---

*Dokumen ini memuat hasil perbandingan dari data deteksi asli, tetapi seluruh nilai densitas masih belum tervalidasi. Metode baru sengaja belum diaktifkan di produksi sampai kriteria penerimaan pada §5 terpenuhi.*
