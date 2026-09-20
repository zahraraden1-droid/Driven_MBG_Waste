# Laporan untuk Paper Manager — MBGCircular

**Disusun:** 20 September 2026
**Isi:** status data, hasil audit paper, dan daftar tindakan sebelum submisi
**Catatan:** dokumen ini adalah laporan kerja, **bukan** naskah paper. Naskah paper ada pada berkas terpisah.

---

## BAGIAN 1 — STATUS DATA (baca ini lebih dulu)

### 1.1 Data apa yang tersedia saat ini

| Sumber | Isi | Status |
|---|---|---|
| Pengukuran fungsional sistem | Interval telemetri, latensi, jumlah rekaman | **Terukur** — dapat dikutip dengan `n` |
| Pengukuran deteksi visual | 60 rekaman dari 1 hari | **Terukur, tetapi terbatas** — 54 dari 60 bernilai 0 kg |
| Data simulasi (seed demo) | 3 baris limbah + 1 baris panen | **BUKAN hasil pengukuran** — lihat §1.2 |
| Akurasi deteksi | — | **Belum diukur** |
| Efisiensi reduksi sampah | — | **Belum diukur** |
| Presisi penimbangan | — | **Belum diukur** |

### 1.2 ⚠️ PERINGATAN: data simulasi masuk ke dashboard produksi

**Temuan pada 20 September 2026.** Dashboard publik saat ini menampilkan:

```
totalLimbahTerolahKg : 247,2 kg
totalPanenMaggotKg   : 35 kg
penghematanEmisiCo2e : 128,544 kg CO2e
cakupanData          : 9 baris "nyata", 4 hari observasi
```

**Angka-angka itu tidak boleh dipakai dalam paper.** Alasannya:

Berkas `supabase/seed_demo.sql` berisi data contoh:

```sql
insert into waste_records (tanggal, minggu, kategori, berat_kg) values
  (current_date - 7, 'Minggu 1', 'nasi', 120),
  (current_date - 6, 'Minggu 1', 'sayur', 82),
  (current_date - 5, 'Minggu 1', 'lauk', 45);

insert into maggot_harvests (tanggal, berat_kg) values
  (current_date, 35);
```

Data di database **cocok persis** dengan berkas itu: 120 kg nasi, 82 kg sayur, 45 kg lauk, dan panen 35 kg. Artinya:

| Angka tayang | Asal |
|---|---|
| 247,2 kg limbah | 247,0 kg dari data contoh + 0,2 kg dari pengukuran nyata |
| 35 kg panen maggot | **100% dari data contoh** |
| 128,544 kg CO2e | Dihitung dari total di atas, termasuk data contoh |
| "4 hari observasi" | Sebagian adalah tanggal yang diisi berkas contoh |

**Mengapa ini penting:** data contoh ditandai `is_simulated = false` dan `sumber = null`, sehingga sistem menganggapnya **data nyata**, bukan data simulasi. Filter yang sudah dipasang pada `get_public_kpi()` karena itu **tidak menyaringnya**. Jika angka ini dikutip ke paper sebagai hasil penelitian, tidak ada dasar yang dapat dipertahankan — dan ini jenis temuan yang paling mudah dikenali reviewer.

**Tindakan yang diperlukan (pilih salah satu):**

| Pilihan | Perintah | Akibat |
|---|---|---|
| Hapus data contoh | `delete from waste_records where tanggal in (current_date-7, current_date-6, current_date-5) and minggu='Minggu 1';`<br>`delete from maggot_harvests where berat_kg = 35;` | KPI kembali ke angka pengukuran nyata |
| Tandai sebagai simulasi | `update waste_records set is_simulated = true, sumber = 'mock' where minggu='Minggu 1' and berat_kg >= 45;` | Tetap tersimpan tetapi tersaring dari KPI |

**Rekomendasi: pilihan pertama** — data contoh tidak diperlukan lagi karena sistem sudah menerima data nyata.

### 1.3 Angka yang boleh dikutip ke paper

Semua berasal dari pengukuran nyata, dengan `n` dinyatakan:

| Parameter | Nilai | n | Kondisi |
|---|---|---|---|
| Interval antar-pengiriman telemetri | **median 30,0 detik** (min 29,4; maks 95,1) | 31 | periode kirim perangkat 30 detik |
| Latensi layanan prediksi | **median 305,5 ms** (p95 539,6) | 15 | diukur dari jaringan penguji |
| Latensi operasi baca basis data | **median 319,4 ms** (p95 887,0) | 15 | diukur dari jaringan penguji |
| Latensi rantai telemetri | **298 ms** | 1 | setelah optimasi cache |
| Rekaman telemetri tersimpan | 32 baris | — | pengamatan ±17 menit |
| Rekaman deteksi visual tersimpan | 60 baris (**54 bernilai 0 kg**) | — | 1 tanggal |

**Yang TIDAK boleh dikutip:** akurasi 92%, galat load cell <1%, latency <2 detik, WRI 81,78–82,29%, dan seluruh angka pada §1.2. Keempat yang pertama tidak memiliki data pendukung tersimpan; yang terakhir adalah data contoh.

### 1.4 Data simulasi yang SAH dipakai

Dalam kerangka paper *perancangan sistem*, **aliran data contoh yang ditandai** adalah praktik yang lazim dan diterima. Syaratnya: setiap tabel dan gambar wajib diberi keterangan "data simulasi".

Draf paper sudah memuat satu bagian seperti itu (Bagian 4.4) beserta tabel contoh yang ditandai tegas. Itu **berbeda** dari data pada §1.2, karena di situ penandaan hanya dilakukan pada laporan, bukan pada basis data — sehingga angka yang sama dapat terlanjur dianggap hasil pengukuran.

---

## BAGIAN 2 — RINGKASAN AUDIT PAPER

### 2.1 Status kelayakan

| Aspek | Penilaian |
|---|---|
| Kelengkapan struktur | Belum — tinjauan pustaka, kesimpulan, daftar pustaka belum ada pada draf awal (sebagian kini sudah disediakan sebagai kerangka) |
| Dukungan bukti atas klaim | **Masalah utama** — 8 dari 13 klaim tidak terbukti |
| Kualitas data | Data yang ada tidak dapat menopang klaim kinerja |
| Kepatuhan etika | Belum — pernyataan etika untuk perekaman citra siswa belum dilengkapi |
| **Kesiapan submit** | **Belum siap.** Dapat disiapkan (lihat Bagian 3) |

### 2.2 Hasil verifikasi klaim terhadap sistem nyata

| Klaim pada draf | Hasil verifikasi | Status |
|---|---|---|
| Akurasi deteksi 92% | Tidak ada log ground truth vs prediksi | Tidak terbukti |
| Galat load cell <1% | Tidak ada prosedur kalibrasi terekam; data justru di ambang deteksi | Tidak terbukti |
| Latency <2 detik | Tidak ada instrumentasi saat audit; kini terpasang dan terukur | Tidak terbukti → diganti angka nyata |
| WRI 81,78–82,29% | `maggot_harvests` kosong saat audit; tidak ada W₀/Wₜ | Tidak terbukti |
| Durasi penguraian <24 jam | Tidak ada data waktu pengamatan | Tidak terbukti |
| "Monitoring real-time" | 32 baris tersimpan, **0 memuat nilai sensor** | Tidak terbukti |
| Deteksi biner True/False sebelum penimbangan | **Fitur ini tidak ada di program terpasang** | Tidak terbukti |
| Eliminasi bau & vektor penyakit | Tidak ada pengukuran | Observasional |
| Peningkatan kapasitas SDM | Tidak ada instrumen | Tidak terbukti |
| Analitik jenis makanan | **Terbukti ada** — model multikelas berjalan | Terbukti sebagian |
| Interval telemetri 30 detik | Terukur median 30,0 detik (n=31) | **Terbukti** |
| Rantai data end-to-end | 32 insert berhasil | **Terbukti** |

**Neraca: 2 terbukti, 1 terbukti sebagian, 8 tidak terbukti, 1 asumsinya tanpa rujukan.**

### 2.3 Tiga temuan terpenting

**1. Draf revisi melemahkan paper tanpa perlu.** Dokumen revisi menetapkan AI "hanya biner" dan analitik jenis makanan "belum diimplementasikan". Verifikasi terhadap sistem menunjukkan kebalikannya: model mengeluarkan kelas spesifik (`nasi`, `Tahu`, `Ayam_Goreng`, `cap_cai`, `Kelengkeng`). Klaim multikelas **dipulihkan** pada draf baru.

**2. Empat angka kinerja tidak memiliki bukti tersimpan.** Akurasi 92%, galat <1%, latency <2 detik, dan WRI 81,78–82,29% dikeluarkan dari posisi klaim hasil. Dua di antaranya kini digantikan angka yang benar-benar terukur.

**3. Tabel 1 paper mendeskripsikan fitur yang tidak ada.** Paper menggambarkan verifikasi AI sebelum penimbangan membuka akses load cell. Pemeriksaan kode dan firmware menunjukkan fitur itu **tidak ada**. Dinyatakan sebagai belum diimplementasikan, bukan dihapus diam-diam.

### 2.4 Kekuatan paper (agar penilaian berimbang)

1. Masalah nyata dan relevan dengan kebijakan nasional, dengan dasar regulasi yang dapat dilacak keberadaannya.
2. Integrasi tiga pilar (deteksi visual, telemetri penimbangan, pemantauan biokonversi) merupakan kebaruan yang wajar.
3. Perangkat keras berbiaya rendah — dapat diverifikasi dari daftar komponen.
4. **Arsitektur benar-benar terbangun dan berjalan**, bukan hanya rancangan di atas kertas. Ini keunggulan yang tidak dimiliki banyak paper perancangan.
5. Terdapat satu kontribusi metodologis nyata: identifikasi bahwa pembagian bobot berbasis luas kotak pembatas mengabaikan densitas jenis makanan, dengan dampak terukur **nasi +30,3%** dan **sayur −28,4%** — cukup besar untuk mengubah peringkat jenis makanan terbuang.

---

## BAGIAN 3 — DAFTAR TINDAKAN SEBELUM SUBMISI

### 3.1 Bersifat wajib

| # | Tindakan | Perkiraan waktu |
|---|---|---|
| 1 | **Hapus atau tandai data contoh** di basis data (§1.2) | 10 menit |
| 2 | Lengkapi **Daftar Pustaka** untuk 5 sumber yang sudah dikutip | 2–3 jam |
| 3 | Tulis **Tinjauan Pustaka** (3–5 studi *plate waste* + 2–3 studi BSF) | 1 hari |
| 4 | Isi **tanggal dan lokasi penelitian** | 15 menit |
| 5 | Isi **pernyataan pendanaan, konflik kepentingan, dan kontribusi penulis** | 30 menit |
| 6 | Sisipkan **Gambar 1** (diagram arsitektur) dan **Gambar 2** (tangkapan dashboard) | 1 jam |
| 7 | Lengkapi **pernyataan etika** dan tata kelola citra siswa | perlu koordinasi sekolah |
| 8 | Isi nomor pasal **Peraturan BGN No. 1/2026** yang dikutip | 1 jam |

### 3.2 Keputusan yang masih diperlukan

**Atribusi angka 81,78–82,29%.** Angka ini muncul sebagai *kutipan* (Akmal, 2024) di bagian Manfaat/Dampak, tetapi sebagai *hasil pengukuran sendiri* di Abstrak, Tabel 2, Tabel 4, dan Pembahasan pada draf awal.

| Jawaban | Konsekuensi |
|---|---|
| Kutipan Akmal (2024) | Tidak perlu eksperimen; cukup konsisten sebagai rujukan pembanding |
| Hasil pengukuran tim | Wajib menyertakan W₀, Wₜ, durasi, dan jumlah ulangan |
| Tidak yakin | Gunakan jalur kutipan sampai data ditemukan |

Pada draf baru, angka ini **tidak lagi muncul sebagai hasil**, sehingga keputusan tersebut tidak lagi menghambat submit — tetapi tetap perlu dijawab bila ingin disebut sebagai pembanding literatur.

### 3.3 Data tambahan (nilai tambah, bukan syarat)

Bila waktu memungkinkan, dua pengukuran ini akan memperkuat paper secara berarti:

| # | Pengukuran | Perkiraan waktu | Yang diperlukan |
|---|---|---|---|
| 1 | **Eksperimen biokonversi minimum** — 2 wadah berlarva + **1 wadah kontrol tanpa larva**, 48 jam | 2–3 hari | timbangan, 3 wadah, sisa makanan 1 kg/wadah |
| 2 | **Kalibrasi load cell** — 5 massa acuan × 5 ulangan | 1 hari | massa acuan terverifikasi |

**Mengapa wadah kontrol wajib** pada eksperimen biokonversi: tanpa kontrol, penurunan bobot basah dapat berasal dari penguapan air, bukan konversi oleh larva. Satu wadah kontrol memisahkan keduanya — inilah pembeda antara data yang dapat dipertahankan dan yang akan ditolak reviewer.

Satu catatan penting: bila hasilnya 30% atau 50%, laporkan apa adanya. **Angka rendah dengan metode benar jauh lebih kuat daripada angka tinggi tanpa metode.**

---

## BAGIAN 4 — CATATAN TEKNIS YANG PERLU DIKETAHUI PENULIS

Beberapa temuan dari audit sistem yang memengaruhi cara data boleh disajikan.

**1. Bobot yang diukur adalah bobot yang DITUANG, bukan bobot sisa di ompreng.** Karena *tare* dilakukan saat tombol ditekan, sisa makanan yang sudah ada di ompreng sebelum tombol ditekan ikut menjadi titik nol dan tidak terhitung. Bila sebagian sisa tidak dituangkan, angkanya lebih rendah dari sisa sebenarnya.

**2. Sebagian besar rekaman deteksi bernilai 0 kg.** 54 dari 60 baris berasal dari sesi penimbangan yang tidak menghasilkan pembacaan bobot valid. Nilai nol **bukan** berarti tidak ada sisa makanan. Validasi yang menolak penyimpanan data semacam ini sudah ditulis tetapi belum diterapkan pada sistem yang berjalan.

**3. Telemetri tercatat, tetapi nilainya kosong.** Penjadwalan perangkat bekerja tepat, tetapi pada rekaman yang tersimpan tidak ada nilai sensor. Klaim pemantauan lingkungan karena itu belum dapat didukung.

**4. Verifikasi keberadaan sisa makanan belum diimplementasikan.** Alur pada paper menyebutkan sistem memverifikasi citra sebelum membuka penimbangan; pada program terpasang, fitur itu belum ada.

**5. Data contoh tidak dapat dibedakan setelah tersimpan.** Berkas contoh menandai barisnya sebagai data nyata, sehingga filter yang sudah dipasang tidak menyaringnya. Perbaikan yang disarankan: setiap penyimpanan data contoh wajib menandai `is_simulated = true` dan `sumber = 'mock'`.

---

## BAGIAN 5 — DAFTAR BERKAS PENDUKUNG

| Berkas | Isi | Untuk siapa |
|---|---|---|
| `docs/paper/PAPER_MBGCircular_LENGKAP.md` | **Naskah paper** + laporan audit + daftar perbaikan | Penulis |
| `docs/LAPORAN_PENGUKURAN_PAPER.md` | Rincian pengukuran latency dan metodenya | Paper manager / reviewer |
| `docs/VALIDASI_PENGUJIAN.md` | Protokol pengukuran akurasi, kalibrasi, dan worksheet biokonversi | Tim lapangan |
| `docs/WEIGHT_ESTIMATION_DESIGN.md` | Rancangan perbaikan pembagian bobot beserta hasil perbandingan | Penulis (bagian pembahasan) |
| `docs/AUDIT_PRODUCTION_READINESS.md` | Audit kesiapan sistem secara menyeluruh | Tim teknis |
| `docs/PANDUAN_EKSEKUSI_OPERATOR.md` | Langkah operasional sistem | Tim teknis |

---

## RINGKASAN SATU PARAGRAF

Sistem MBGCircular **sudah terbangun dan berjalan** — hal itu terbukti dan dapat dikutip dengan angka yang terukur. Yang **belum** tersedia adalah data kinerja: akurasi deteksi, presisi penimbangan, dan efisiensi reduksi sampah. Karena itu paper disusun dengan kerangka **perancangan sistem dan kelayakan**, bukan uji kinerja. Tiga hal yang paling perlu perhatian: **hapus data contoh dari basis data**, **lengkapi pernyataan etika**, dan **jawab atribusi angka 81,78–82,29%**. Setelah itu naskah dapat disubmit.
