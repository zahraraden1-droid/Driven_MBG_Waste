# MBGCircular — Dokumen Paper Lengkap

**Satu berkas berisi tiga bagian.** Bagian I adalah naskah paper yang akan disubmit;
Bagian II dan III adalah dokumen kerja internal yang **tidak** ikut disubmit.

| Bagian | Isi | Untuk siapa |
|---|---|---|
| **I** | Naskah paper — kerangka *perancangan sistem & kelayakan* | Reviewer jurnal |
| **II** | Laporan audit menyeluruh atas draf sebelumnya | Tim penulis |
| **III** | Daftar perbaikan & data yang masih hilang | Tim penulis |

**Sebelum submit:** hapus Bagian II dan III, lalu isi seluruh penanda `[PERLU DATA]`
dan `[PERLU REFERENSI]` pada Bagian I.

**Ringkasan status kesiapan:**
- Bagian I belum siap submit — masih memuat **23 penanda** `[PERLU DATA]`/`[PERLU REFERENSI]`
  dan dua gambar yang belum disisipkan.
- Klaim besaran dampak (akurasi 92%, galat <1%, latency <2 detik, WRI 81,78–82,29%)
  sudah **dikeluarkan** dari posisi klaim hasil karena tidak memiliki data pendukung.
- Kerangka paper: **perancangan sistem & kelayakan**, bukan uji kinerja.

---

# BAGIAN I — NASKAH PAPER

<div style="page-break-after: always;"></div>

# MBGCircular: Perancangan Sistem AIoT untuk Deteksi Multikelas Sisa Makanan dan Telemetri Pengelolaan Sampah Organik Sekolah

**DRAF FINAL — kerangka: perancangan sistem & kelayakan (system design & feasibility)**

**Untuk diisi sebelum submit:** lihat **Bagian III** dokumen ini. Setiap penanda `[PERLU DATA]` dan `[PERLU REFERENSI]` tidak boleh diisi dengan angka perkiraan.

---

## CATATAN PENULIS (hapus sebelum submit)

**Kerangka paper ini adalah perancangan sistem dan pengujian kelayakan (feasibility), bukan uji kinerja.** Kontribusinya adalah rancangan arsitektur dan bukti bahwa sistem berfungsi — bukan bukti besaran dampak.

Konsekuensi yang dipegang konsisten di seluruh naskah:

| Kontribusi yang DIKLAIM | Dasar |
|---|---|
| Arsitektur AIoT terintegrasi terbangun dan berjalan | Pengujian fungsional + angka latensi terukur |
| Deteksi visual **multikelas** berjalan pada perangkat nyata | Keluaran model diverifikasi (`nasi`, `Tahu`, `Ayam_Goreng`, `cap_cai`, `Kelengkeng`) |
| Telemetri periodik andal | Interval terukur median 30,0 detik (n=31) |
| Sistem menyimpan data kuantitatif untuk pelaporan | Rantai data terbukti tersimpan ke basis data |
| Pemilihan komponen berbiaya rendah | Dapat diverifikasi dari daftar komponen |

| Yang DINYATAKAN BELUM DIUJI |
|---|
| Akurasi deteksi per kelas |
| Efisiensi reduksi sampah oleh larva (ERS/WRI) |
| Presisi penimbangan | 
| Karakterisasi produk sampingan (kasgot, biomassa larva) |
| Dampak terhadap kapasitas SDM |

**Perubahan dari draf sebelumnya:** judul diubah agar sesuai cakupan data; klaim akurasi 92%, galat <1%, latency <2 detik, dan WRI 81,78–82,29% dikeluarkan dari posisi klaim hasil; klaim multikelas **dipulihkan** karena verifikasi menunjukkan sistem memang multikelas.

---

## ABSTRAK

Program Makan Bergizi Gratis (MBG) berpotensi menghasilkan timbulan sampah makanan dalam jumlah besar di lingkungan sekolah. Penelitian ini **merancang dan membangun MBGCircular**, sebuah sistem terintegrasi berbasis *Artificial Intelligence* (AI) dan *Internet of Things* (IoT) untuk mendeteksi sisa makanan pada ompreng dan mencatat telemetri pengelolaan sampah organik sekolah, serta **menguji kelayakan fungsionalnya**.

Pengembangan menggunakan pendekatan *Research and Development* dengan kerangka ADDIE. Sistem terdiri atas unit penimbangan berbasis ESP32-Cam dengan sensor *load cell* HX711, unit pemantauan bilik maggot berbasis ESP8266, backend Express.js, basis data Supabase (PostgreSQL), dan *broker* MQTT. Deteksi visual dijalankan **di sisi server** menggunakan layanan Roboflow dengan keluaran **multikelas** jenis makanan.

Pengujian kelayakan menunjukkan rantai data berjalan *end-to-end* dari perangkat hingga basis data. Telemetri tercatat dengan **interval median 30,0 detik (n=31)**, sesuai periode pengiriman yang ditetapkan perangkat. Latensi terukur: layanan prediksi **median 305,5 ms (n=15)**, operasi baca basis data **median 319,4 ms (n=15)**, dan rantai telemetri **298 ms**. Deteksi visual menghasilkan kelas jenis makanan spesifik, yang dipetakan sistem ke kategori nasi, sayur, lauk, dan buah.

Penelitian ini **belum mengukur** akurasi deteksi terhadap data berlabel, presisi penimbangan melalui prosedur kalibrasi terekam, efisiensi reduksi sampah, maupun dampak terhadap kapasitas SDM. Seluruh keterbatasan dinyatakan secara eksplisit dan menjadi agenda penelitian lanjutan. Kontribusi utama penelitian ini adalah **rancangan arsitektur sistem terintegrasi berbiaya rendah beserta verifikasi kelayakan fungsionalnya**, serta satu catatan metodologis mengenai keterbatasan pembagian bobot berbasis luas kotak pembatas.

**Kata kunci:** perancangan sistem, AIoT, deteksi sisa makanan, maggot *Black Soldier Fly*, telemetri, MQTT, ekonomi sirkular

---

## 1. PENDAHULUAN

### 1.1 Latar Belakang

Program Makan Bergizi Gratis menargetkan 17 hingga 20 juta siswa di Indonesia (Badan Gizi Nasional, 2025). Skala ini berpotensi menghasilkan hingga 2.400 ton sampah makanan harian dan emisi gas rumah kaca sebesar 200.706 ton CO₂e/tahun **[PERLU REFERENSI: sumber dan asumsi perhitungan kedua angka]**. Sebagai gambaran skala masalah *food waste* secara umum di Indonesia — **bukan spesifik Program MBG** — Bappenas (2021) memperkirakan kerugian ekonomi lintas rantai pasok nasional mencapai Rp213–551 triliun/tahun. Klarifikasi cakupan ini penting agar angka agregat nasional tidak disalahpahami sebagai kerugian yang timbul khusus dari Program MBG.

Studi FISIP UI (2025) mencatat 85–88% siswa di DKI Jakarta menyisakan makanan MBG **[PERLU REFERENSI]**. Angka ini relevan secara metodologis: karena mayoritas ompreng mengandung sisa makanan, distribusi kelas menjadi tidak seimbang. Konsekuensinya, **akurasi mentah tidak dapat dipakai sebagai satu-satunya ukuran kinerja model deteksi** (lihat Bagian 5.4).

Peraturan BGN Nomor 1 Tahun 2026 mewajibkan Satuan Pelayanan Pemenuhan Gizi (SPPG) mengelola sampah berbasis ekonomi sirkular, termasuk pencatatan data kuantitatif volume/berat sampah secara berkala **[PERLU REFERENSI: kutip pasal spesifik]**. Terdapat ambiguitas yurisdiksi yang perlu dicatat: kewajiban dibebankan pada SPPG, sedangkan sistem pada penelitian ini dipasang di sekolah.

### 1.2 Kesenjangan yang Ditangani

Berdasarkan identifikasi kebutuhan pada tahap *Analysis* **[PERLU DATA: metode dan jumlah responden]**, teridentifikasi indikasi kendala operasional: keterbatasan kapasitas SDM petugas, pemilahan manual yang memakan waktu, risiko pembusukan, serta belum tersedianya pemantauan digital terintegrasi. Pernyataan ini merupakan hasil identifikasi kebutuhan, bukan temuan survei formal.

Kesenjangan teknis yang lebih spesifik: sistem pemantauan sisa makanan yang ada umumnya terpisah dari sistem pengolahan sampah, sehingga data pemilahan dan data pengolahan tidak terhubung. Penelitian ini menangani kesenjangan tersebut dengan merancang **satu alur data terintegrasi** dari penimbangan hingga pemantauan bilik biokonversi.

### 1.3 Rumusan Masalah

1. Bagaimana merancang arsitektur AIoT yang mengintegrasikan deteksi visual sisa makanan, penimbangan, dan pemantauan bilik biokonversi dalam satu alur data?
2. Bagaimana kelayakan fungsional sistem tersebut, ditinjau dari keberhasilan transmisi data dan latensi yang terukur?
3. Keterbatasan metodologis apa yang perlu ditangani sebelum luaran sistem dapat dipakai sebagai dasar evaluasi menu?

> Rumusan masalah diarahkan pada **perancangan dan kelayakan**, bukan pada pengukuran dampak. Kapasitas SDM dan efisiensi reduksi sampah tidak diukur dalam penelitian ini.

### 1.4 Tujuan Penelitian

1. Merancang arsitektur sistem AIoT terintegrasi untuk pengelolaan sisa makanan sekolah.
2. Membangun dan mengoperasikan sistem tersebut pada perangkat nyata.
3. Menguji kelayakan fungsional rantai data serta mengukur latensi pada tahap yang dapat diukur.
4. Mengidentifikasi keterbatasan metodologis sistem sebagai dasar penelitian lanjutan.

### 1.5 Kontribusi

1. **Rancangan arsitektur terintegrasi** yang menyatukan deteksi visual, penimbangan, dan pemantauan bilik biokonversi dalam satu alur data — berbeda dari pendekatan yang memisahkan pemantauan dan pengolahan.
2. **Verifikasi kelayakan fungsional** pada perangkat nyata, bukan sekadar rancangan konseptual, dengan angka latensi terukur dan jumlah sampel yang dinyatakan.
3. **Arsitektur berbiaya rendah**: pemilihan ESP32-Cam, HX711, dan MQTT *open-source* menjadikan sistem dapat direplikasi **[PERLU DATA: estimasi biaya per unit dan pembanding sistem komersial]**.
4. **Catatan metodologis**: pembagian bobot berbasis luas kotak pembatas mengabaikan densitas jenis makanan, dengan dampak terukur yang berpotensi mengubah peringkat jenis makanan terbuang (Bagian 5.5).

### 1.6 Batasan Sejak Awal

Penelitian ini adalah **perancangan dan pengujian kelayakan pada satu lokasi**, bukan uji kinerja lapangan berskala. Tidak tersedia kelompok pembanding, tidak ada pengukuran akurasi terhadap data berlabel, dan tidak ada pengukuran efisiensi biokonversi. Rincian pada Bagian 6.

---

## 2. TINJAUAN PUSTAKA

**[PERLU REFERENSI: bagian ini harus diisi penulis melalui pencarian literatur. Kerangka di bawah disediakan agar tidak dikarang.]**

### 2.1 Pemantauan sisa makanan berbasis computer vision

Diperlukan 3–5 studi tentang deteksi/pemantauan *plate waste* di kantin sekolah atau institusi sejenis, mencakup: arsitektur model, jumlah kelas, ukuran dan pembagian data, serta metrik yang dilaporkan.

**Posisi penelitian ini [disusun setelah literatur terkumpul]:** penelitian ini tidak mengklaim unggul dalam akurasi, melainkan menawarkan **integrasi** antara pemantauan sisa makanan dan pemantauan pengolahan dalam satu alur data.

### 2.2 Biokonversi sampah organik oleh larva Black Soldier Fly

Diperlukan studi tentang rentang *Waste Reduction Index*, waktu pengolahan, densitas penebaran larva, dan kondisi optimal. Penelitian ini **tidak mengukur** besaran tersebut; unit biokonversi dipantau sebagai bagian dari sistem, bukan sebagai objek pengukuran kinerja biologis.

### 2.3 Definisi metrik reduksi sampah

Rumus `(W₀ − Wₜ)/W₀ × 100%` **tidak memuat komponen waktu**, sedangkan sebagian literatur menormalisasi terhadap durasi pengamatan. Karena itu penelitian ini **tidak memakai istilah WRI** dan menyebut metriknya **Efisiensi Reduksi Sampah (ERS)**, dengan durasi dilaporkan terpisah. **[PERLU REFERENSI: rujukan definisi metrik]**

### 2.4 Estimasi massa berbasis citra

Pendekatan memperkirakan massa objek dari citra 2D melalui estimasi volume visual dikalikan densitas kelas objek telah diteliti, misalnya *image2mass* (Standley dkk., 2017). Penelitian ini **belum menerapkannya** — lihat Bagian 5.5 — dan penerapannya menjadi agenda lanjutan.

### 2.5 Sistem pemantauan IoT berbiaya rendah

**[PERLU REFERENSI: studi sistem pemantauan berbasis ESP32/MQTT berbiaya rendah sebagai pembanding arsitektur.]**

---

## 3. METODE PERANCANGAN

### 3.1 Waktu dan Lokasi

Penelitian dilaksanakan di **[PERLU DATA: nama/jenis sekolah dan wilayah]** serta laboratorium rekayasa sistem untuk perakitan dan pengujian integrasi, pada periode **[PERLU DATA: tanggal mulai dan berakhir]**.

### 3.2 Alat dan Bahan

**Tabel 1. Komponen sistem**

| Komponen | Fungsi | Peran dalam arsitektur |
|---|---|---|
| ESP32-Cam (OV2640) | Kamera, penimbangan, LCD, tombol | Unit penimbangan *smart container* |
| *Load cell* 10 kg + HX711 | Pengukuran bobot | Akuisisi bobot sisa makanan |
| ESP8266 (NodeMCU) | Pemantauan bilik maggot | Unit telemetri lingkungan |
| DHT (suhu/kelembapan udara) | Sensor lingkungan | Pemantauan bilik |
| DS18B20 | Suhu substrat | Pemantauan bilik |
| MQ-135 | Kadar amonia | Pemantauan bilik |
| LCD I2C 16×2 | Petunjuk bagi siswa | Antarmuka pengguna |
| Unit biokonversi Maggot BSF *self-harvesting* | Penguraian sampah | Objek pemantauan, bukan objek pengukuran kinerja |
| Backend Express.js | API dan orkestrasi | Lapisan layanan |
| Supabase (PostgreSQL) | Penyimpanan data | Lapisan data |
| Broker Mosquitto | Transport MQTT | Lapisan komunikasi |
| Roboflow | Inferensi visual **di server** | Lapisan AI |
| FastAPI | Layanan prediksi | Lapisan analitik |
| Next.js | Antarmuka pengguna | Lapisan presentasi |

> **Klarifikasi arsitektur:** ThingsBoard **tidak digunakan**. Fungsi pemantauan perangkat dan telemetri diimplementasikan sendiri pada backend. Inferensi model berjalan **di server**; ESP32-Cam hanya menangkap dan mengirimkan citra.

### 3.3 Tahapan Perancangan (ADDIE)

1. **Analysis** — identifikasi kebutuhan operasional petugas dan kebutuhan data SPPG **[PERLU DATA: metode]**.
2. **Design** — perancangan skema perangkat keras, alur komunikasi MQTT, struktur basis data, dan alur penggunaan.
3. **Development** — pemrograman perangkat, kalibrasi *load cell*, pembangunan API.
4. **Implementation** — pemasangan di lokasi uji coba.
5. **Evaluation** — pengujian kelayakan fungsional dan pengukuran latensi.

### 3.4 Arsitektur Sistem

```
   ESP32-Cam (kamera + load cell + LCD)  ─┐
                                          ├─ MQTT ─► Broker ─► Backend Express
   ESP8266 (DHT / DS18B20 / MQ-135)     ─┘                      │
                                                                ├─► Roboflow (inferensi, di server)
                                                                ├─► Supabase (PostgreSQL)
                                                                └─► FastAPI (prediksi)

   Next.js: dashboard admin sekolah │ dashboard SPPG │ dashboard publik ──REST──► Backend
```

**[GAMBAR 1: diagram arsitektur — perlu disisipkan sebagai gambar, bukan blok teks. Sertakan keterangan sumber.]**

**Gambar 1. Arsitektur sistem MBGCircular.** *Diagram ini adalah rancangan; tidak memuat data eksperimen.*

### 3.5 Alur Penggunaan Perangkat

**Tabel 2. Alur penggunaan unit penimbangan**

| # | Tindakan pengguna | Perilaku sistem | Tampilan LCD |
|---|---|---|---|
| 1 | Letakkan ompreng di atas timbangan | Menunggu tombol | `Tekan Tombol / Untuk Memfoto` |
| 2 | Tekan tombol | **Tare otomatis** pada titik ini | `Sedang Memfoto / Model v1` |
| 3 | (tunggu ±0,5 detik) | Kamera menangkap citra VGA, mengirim via MQTT | `Sedang Memfoto` |
| 4 | Tuangkan sisa makanan ke bak | Bobot terakumulasi; data dikirim setelah stabil 1,5 detik | `Silahkan Buang / Sisa +x.xxx kg` |
| 5 | — | Backend memanggil Roboflow, membagi bobot per kategori, menyimpan | `Silahkan Tunggu / Proses Data...` |
| 6 | Bersihkan ompreng | Kembali siap | `Selesai! / Terima Kasih` |

**Catatan rancangan penting:** karena *tare* dilakukan **saat tombol ditekan**, sisa makanan yang sudah berada di ompreng sebelum tombol ditekan ikut menjadi titik nol dan tidak terhitung. Sistem mengukur **bobot yang dituangkan**, bukan bobot sisa di ompreng. Konsekuensi metodologis ini dibahas pada Bagian 5.6 dan 6.

**Catatan rancangan yang belum diimplementasikan:** alur verifikasi keberadaan sisa makanan sebelum penimbangan **belum terpasang pada program**. Fungsi ini dinyatakan sebagai agenda pengembangan, bukan sebagai fitur yang telah berjalan.

### 3.6 Protokol Pengujian Kelayakan

**[PERLU DATA: protokol lengkap untuk setiap pengujian — n, prosedur, dan kondisi pengukuran.]**

### 3.7 Pernyataan Etika Penelitian

Sistem merekam citra ompreng yang berpotensi ditautkan pada identitas siswa (anak di bawah umur) melalui pencatatan transaksi. **[PERLU DATA: status persetujuan sekolah/komite etik, mekanisme persetujuan orang tua/wali, kebijakan retensi dan penghapusan citra, serta kepatuhan terhadap UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.]**

Mitigasi teknis yang dapat dinyatakan: skema basis data yang dipakai **tidak menyimpan** nama, nomor induk, atau identitas siswa. Yang tersimpan hanya tanggal, kategori makanan, bobot, dan cap waktu.

---

## 4. HASIL PERANCANGAN DAN PENGUJIAN KELAYAKAN

### 4.1 Status Verifikasi Setiap Klaim

Tabel berikut menyatakan secara eksplisit apa yang sudah dan belum terverifikasi. Ini inti kerangka *perancangan sistem & kelayakan*.

**Tabel 3. Status verifikasi setiap komponen klaim**

| # | Klaim | Status | Bukti / alasan |
|---|---|---|---|
| 1 | Rantai data berjalan *end-to-end* (perangkat → MQTT → backend → basis data) | **Terverifikasi** | 32 rekaman telemetri tersimpan; alur tereksekusi |
| 2 | Penjadwalan telemetri sesuai rancangan | **Terverifikasi** | Interval median 30,0 detik (n=31) sesuai periode kirim yang ditetapkan 30 detik |
| 3 | Deteksi visual **multikelas** berjalan | **Terverifikasi (keberadaan)** | Keluaran model memuat kelas jenis makanan spesifik, bukan biner |
| 4 | Akurasi deteksi | **Belum diukur** | Tidak tersedia data berlabel dengan *ground truth* |
| 5 | Presisi penimbangan | **Belum diukur** | Prosedur kalibrasi dengan massa acuan belum dijalankan secara tercatat |
| 6 | Validitas nilai sensor bilik | **Belum terverifikasi** | Pada rekaman yang ada, nilai sensor tidak tersimpan |
| 7 | Efisiensi reduksi sampah (ERS) | **Belum diukur** | Tidak tersedia data bobot awal/akhir substrat |
| 8 | Karakterisasi produk sampingan | **Belum diukur** | Tidak ada data proksimat/rendemen |
| 9 | Dampak terhadap kapasitas SDM | **Belum diukur** | Tidak ada instrumen pengukuran |
| 10 | Verifikasi keberadaan sisa makanan sebelum penimbangan | **Belum diimplementasikan** | Fungsi ini tidak ada pada program yang terpasang |

### 4.2 Pengujian Kelayakan Rantai Data

**Tabel 4. Hasil pengujian kelayakan rantai data**

| Parameter | Hasil terukur | Kondisi pengukuran |
|---|---|---|
| Rekaman telemetri tersimpan | 32 baris | periode pengamatan ±17 menit |
| Interval antar-pengiriman | **median 30,0 detik** (min 29,4; maks 95,1; n=31) | periode kirim perangkat 30 detik |
| Rekaman deteksi visual tersimpan | 60 baris (54 bernilai 0 kg; 6 bernilai >0) | 1 tanggal pengamatan |
| Total bobot tercatat | 0,200 kg | — |

Dua hal perlu dinyatakan terbuka:

1. **54 dari 60 baris deteksi bernilai 0 kg.** Nilai nol berasal dari sesi penimbangan yang tidak menghasilkan pembacaan bobot valid — bukan berarti tidak ada sisa makanan.
2. **Tidak ada nilai sensor yang tersimpan** pada 32 baris telemetri. Penjadwalan terbukti benar, tetapi validitas nilai belum.

Kedua hal ini merupakan temuan dari pengujian kelayakan dan telah ditangani pada revisi perangkat lunak melalui validasi yang menolak penyimpanan data tanpa nilai. Perbaikan tersebut **belum diterapkan pada sistem produksi** pada saat penulisan.

### 4.3 Pengukuran Latensi

**Tabel 5. Distribusi latensi (milidetik; n=15 per baris kecuali dinyatakan lain)**

| Tahap | min | median | rata-rata | p95 | maks |
|---|---:|---:|---:|---:|---:|
| Layanan prediksi (`/predict/waste`) | 215,2 | **305,5** | 327,0 | 539,6 | 609,5 |
| Operasi baca basis data | 234,1 | **319,4** | 442,0 | 887,0 | 1.264,1 |
| Rantai telemetri (payload diterima → tersimpan) | — | **298** | — | — | — |

**Kondisi pengukuran:** angka latensi layanan prediksi dan basis data diukur dari jaringan penguji, **bukan dari jaringan lokasi sekolah**, sehingga tidak menggambarkan kondisi lapangan. Latensi inferensi Roboflow **belum terukur** karena kunci API tidak tersedia saat pengukuran; pengukuran tersebut akan berjalan otomatis melalui instrumen yang kini terpasang.

### 4.4 Demonstrasi Aliran Data dengan Data Simulasi

> **PENTING — SEMUA ANGKA PADA BAGIAN INI ADALAH DATA SIMULASI.**
> Bagian ini mendemonstrasikan bahwa sistem mampu **memproses dan menampilkan** aliran data, bukan melaporkan hasil pengukuran. Seluruh tabel dan gambar pada bagian ini wajib diberi keterangan "data simulasi" bila dikutip.

Untuk memverifikasi bahwa arsitektur mampu memproses aliran data lengkap, sistem dijalankan dengan data contoh yang melewati jalur pemrosesan yang sama dengan data nyata: penerimaan payload → pemetaan kelas ke kategori → perhitungan distribusi bobot → penyimpanan → penyajian pada antarmuka.

**Tabel 6. Contoh keluaran pemrosesan (DATA SIMULASI, bukan hasil pengukuran)**

| Kelas terdeteksi | Kategori | Bobot simulasi (kg) | Proporsi |
|---|---|---:|---:|
| `nasi` | Nasi | 0,120 | 40,0% |
| `Ayam_Goreng` | Lauk | 0,075 | 25,0% |
| `cap_cai` | Sayur | 0,060 | 20,0% |
| `Kelengkeng` | Buah | 0,045 | 15,0% |
| **Total** | | **0,300** | **100%** |

**Keterangan:** nilai pada Tabel 6 adalah **data simulasi** yang dibangkitkan untuk menguji jalur pemrosesan. Bobot total berasal dari masukan buatan, dan proporsi dihitung sistem memakai metode pembagian bobot yang sama dengan data nyata. Angka ini **tidak menggambarkan** pola konsumsi siswa dan **tidak boleh** dikutip sebagai hasil penelitian.

Yang **dapat** disimpulkan dari demonstrasi ini: sistem mampu menerima payload, memetakan kelas model ke kategori makanan, menghitung distribusi, menyimpan ke basis data, dan menyajikannya pada antarmuka tanpa intervensi manual.

**[GAMBAR 2: tangkapan layar dashboard dengan DATA SIMULASI. Wajib disertai keterangan "data simulasi" pada gambar maupun pada teks keterangannya.]**

### 4.5 Bentuk Data yang Diharapkan setelah Validasi

Bagian ini menyatakan secara jujur bentuk luaran yang diharapkan, agar pembaca memahami bagaimana sistem ini akan dilaporkan setelah validasi dilakukan. **Tabel ini berisi nilai kosong dan bukan hasil.**

**Tabel 7. Kerangka pelaporan hasil validasi (belum terisi)**

| Parameter | Nilai | n | Kondisi |
|---|---|---|---|
| Akurasi deteksi per kelas | belum diukur | — | memerlukan data berlabel |
| Macro-F1 | belum diukur | — | memerlukan data berlabel |
| Baseline mayoritas-kelas | belum diukur | — | memerlukan data berlabel |
| Galat penimbangan (%FS) | belum diukur | — | memerlukan kalibrasi massa acuan |
| Efisiensi reduksi sampah (ERS) | belum diukur | — | memerlukan W₀/Wₜ dan kelompok kontrol |
| Distribusi kategori (multi-hari) | belum diukur | — | memerlukan ≥5 hari data bermakna |

---

## 5. PEMBAHASAN

### 5.1 Kelayakan Fungsional Arsitektur

Hasil pengujian menunjukkan arsitektur yang dirancang **dapat dibangun dan dijalankan**: perangkat terhubung, data mengalir melalui MQTT, backend memproses, dan basis data menyimpan. Interval telemetri yang terukur (median 30,0 detik) sesuai dengan periode yang ditetapkan perangkat, yang menunjukkan penjadwalan sisi perangkat bekerja sesuai rancangan.

Untuk paper berkerangka perancangan, hasil ini merupakan **luaran utama**: arsitektur terbukti layak secara teknis, bukan hanya di atas kertas.

Namun konsistensi jadwal **tidak sama dengan validitas nilai**. Sebagian besar rekaman tidak memuat nilai sensor yang dapat dipakai. Temuan ini menunjukkan bahwa keberhasilan integrasi tidak boleh disamakan dengan keberhasilan pengukuran — dan bahwa pengujian kelayakan perlu dilengkapi pengujian validitas data.

### 5.2 Kontribusi Integrasi

Sebagian besar sistem pemantauan yang dilaporkan pada literatur memisahkan pemantauan sisa makanan dari pemantauan pengolahan sampah. Rancangan ini menyatukan keduanya dalam satu alur data: bobot sisa makanan yang tercatat pada unit penimbangan dan kondisi bilik biokonversi yang dipantau unit telemetri bermuara pada basis data yang sama, sehingga pelaporan keduanya dapat dihasilkan dari satu sumber.

Kontribusi ini bersifat **arsitektural** dan tidak bergantung pada hasil pengukuran kinerja. **[PERLU REFERENSI: pembanding literatur untuk memperkuat klaim kebaruan integrasi.]**

### 5.3 Deteksi Visual Berjalan secara Multikelas

Model yang dipakai menghasilkan **keluaran multikelas**, yaitu jenis makanan spesifik, bukan sekadar klasifikasi biner ada/tidak ada sisa makanan. Backend memetakan kelas tersebut ke kategori (nasi, sayur, lauk, buah) dan menghitung distribusi bobot per kategori.

Draf sebelumnya menurunkan klaim ini menjadi deteksi biner. Berdasarkan verifikasi terhadap sistem yang berjalan, **klaim multikelas sesuai dengan kapabilitas nyata** sehingga dipulihkan. Konsekuensinya: akurasi harus dilaporkan **per kelas**, bukan sebagai satu angka tunggal — dan hal itu belum dilakukan.

### 5.4 Mengapa Akurasi Tunggal Tidak Memadai

Kutipan pada Bagian 1.1 menyatakan 85–88% siswa menyisakan makanan. Bila proporsi itu berlaku pada data uji, model yang **selalu** menjawab "ada sisa makanan" akan memperoleh akurasi sekitar 85–88% tanpa mempelajari apa pun. Karena itu pelaporan akurasi **wajib** disertai *baseline* mayoritas-kelas, matriks konfusi, dan metrik per kelas.

Ini bukan kelemahan yang dapat diabaikan: tanpa *baseline*, angka akurasi pada sistem dengan distribusi kelas tidak seimbang **tidak dapat ditafsirkan**. Kerangka perhitungannya telah disiapkan agar dapat dijalankan segera setelah data berlabel tersedia.

### 5.5 Catatan Metodologis: Pembagian Bobot Berbasis Luas Kotak

Sistem membagi bobot terukur ke setiap jenis makanan secara **proporsional terhadap luas kotak pembatas**, tanpa memperhitungkan densitas jenis makanan maupun nilai keyakinan model. Pendekatan ini menyiratkan asumsi bahwa seluruh jenis makanan memiliki densitas yang sama per satuan luas citra — asumsi yang tidak sesuai dengan sifat fisik bahan pangan.

Pengukuran terhadap **keluaran deteksi nyata** (bukan data simulasi) menunjukkan besarnya dampak asumsi ini: dibandingkan pembagian yang memperhitungkan densitas, proporsi **nasi berubah +30,3%** dan **sayur berubah −28,4%**.

Karena luaran utama sistem adalah peringkat jenis makanan yang paling banyak terbuang untuk evaluasi menu, selisih sebesar ini **berpotensi mengubah peringkat dan rekomendasi** yang diberikan kepada SPPG. Temuan ini bersifat metodologis dan tidak bergantung pada akurasi model, sehingga tetap berlaku walaupun akurasi belum diukur.

Penanganan yang diusulkan adalah pembobotan yang memperhitungkan densitas relatif per kelas, dengan parameter yang **dikalibrasi melalui penimbangan acuan** — bukan ditetapkan berdasarkan asumsi. Pendekatan ini belum diaktifkan karena memerlukan data kalibrasi.

Temuan ini menjadi **kontribusi metodologis** penelitian: identifikasi bahwa luaran analitis sistem semacam ini dapat berubah cukup besar hanya karena pilihan metode pembagian bobot, dan bahwa hal itu perlu ditangani sebelum luaran dipakai sebagai dasar keputusan.

### 5.6 Keterbatasan Rancangan yang Perlu Ditangani

Tiga hal pada rancangan saat ini yang perlu ditangani sebelum sistem dipakai untuk pengumpulan data dalam jumlah besar:

1. **Bobot yang diukur adalah bobot yang dituangkan**, bukan bobot sisa di ompreng. Bila sebagian sisa tidak dituangkan, angkanya lebih rendah dari sisa sebenarnya.
2. **Tidak ada verifikasi keberadaan sisa makanan** sebelum penimbangan, sehingga siswa dapat menekan tombol dengan ompreng kosong dan sistem tetap meminta menuang.
3. **Pengukuran bobot bergantung pada kestabilan 1,5 detik**, yang dapat terpicu lebih awal bila siswa masih menuang. Asumsi ini perlu diuji.

### 5.7 Implikasi Praktis

Kontribusi praktis yang dapat dinyatakan tanpa data tambahan adalah **mekanisme pencatatan kuantitatif otomatis** untuk mendukung kewajiban pelaporan berkala. Pencatatan yang selama ini manual menjadi terekam dan dapat diekspor.

Perlu diklarifikasi bahwa sistem ini berupa **pendukung** pelaporan: kesesuaian format keluaran dengan format resmi yang dipersyaratkan regulasi belum dipetakan.

### 5.8 Perbandingan dengan Literatur

**[PERLU REFERENSI: bandingkan arsitektur dan pendekatan dengan studi sejenis. Tanpa pembanding ini, klaim kebaruan integrasi tidak dapat dinyatakan.]**

---

## 6. KETERBATASAN PENELITIAN

1. **Berkerangka perancangan, bukan uji kinerja.** Penelitian ini tidak mengukur dampak; yang diuji adalah kelayakan fungsional.
2. **Pengujian pada satu lokasi tanpa kelompok pembanding**, sehingga validitas eksternal terbatas.
3. **Akurasi deteksi belum diukur.** Tidak tersedia data berlabel; tidak ada angka akurasi yang dilaporkan.
4. **Presisi penimbangan belum dikarakterisasi.** Data yang ada justru berada di dekat ambang deteksi sistem (0,02 kg/sesi), dengan 90% baris bernilai nol.
5. **Efisiensi reduksi sampah belum diukur.** Tidak tersedia `W₀`/`Wₜ` maupun data panen. Angka rentang pada literatur yang dirujuk **bukan** hasil penelitian ini.
6. **Validitas data telemetri belum terverifikasi.** Nilai sensor tidak tersimpan pada rekaman yang ada.
7. **Karakterisasi produk sampingan belum dilakukan** (kasgot, biomassa larva).
8. **Dampak terhadap kapasitas SDM belum diukur.**
9. **Bobot yang diukur adalah bobot yang dituangkan**, bukan bobot sisa di ompreng.
10. **Verifikasi keberadaan sisa makanan belum diimplementasikan** pada program.
11. **Pernyataan etika belum dilengkapi.**
12. **Latensi inferensi belum terukur** dan angka latensi lain diukur dari jaringan penguji, bukan jaringan sekolah.

---

## 7. KESIMPULAN

Penelitian ini menghasilkan **rancangan dan prototipe fungsional MBGCircular** yang mengintegrasikan deteksi visual sisa makanan, telemetri penimbangan, dan pemantauan bilik biokonversi dalam satu alur data.

Pengujian kelayakan pada **[PERLU DATA: skala pengujian]** menunjukkan arsitektur yang dirancang **dapat dibangun dan dijalankan**: rantai data berjalan *end-to-end*, telemetri tercatat dengan interval median 30,0 detik (n=31), dan latensi operasi basis data terukur median 319,4 ms (n=15). Deteksi visual menghasilkan keluaran multikelas jenis makanan.

Sebagai penelitian perancangan, penelitian ini **tidak** mengklaim besaran dampak. Yang belum diuji dinyatakan eksplisit: akurasi deteksi per kelas, presisi penimbangan, efisiensi reduksi sampah, karakterisasi produk sampingan, dan dampak terhadap kapasitas SDM.

Kontribusi penelitian ini terletak pada **rancangan arsitektur terintegrasi berbiaya rendah**, **bukti kelayakan fungsionalnya pada perangkat nyata**, dan **satu catatan metodologis** bahwa pembagian bobot berbasis luas kotak pembatas mengabaikan densitas jenis makanan — dengan dampak terukur yang berpotensi mengubah peringkat jenis makanan terbuang, sehingga perlu ditangani sebelum luaran analitis sistem dipakai sebagai dasar evaluasi menu.

Penelitian lanjutan disarankan untuk memvalidasi akurasi per kelas dengan data berlabel, mengukur presisi penimbangan melalui prosedur kalibrasi terekam, dan menjalankan pengujian biokonversi terkontrol dengan kelompok pembanding.

---

## PERNYATAAN

**Kontribusi penulis [PERLU DATA: rincian kontribusi tiap penulis].**

**Pendanaan [PERLU DATA: sumber pendanaan, atau nyatakan tidak ada].**

**Konflik kepentingan [PERLU DATA: nyatakan ada/tidak ada, termasuk hubungan dengan penyedia unit biokonversi atau perangkat AIoT].**

**Ketersediaan data.** Data mentah telemetri dan deteksi tersimpan pada basis data penelitian. **[PERLU DATA: nyatakan apakah data dapat diakses dan dengan mekanisme apa.]**

**Catatan mengenai data simulasi.** Seluruh angka pada Bagian 4.4 diberi tanda **data simulasi** dan tidak boleh dikutip sebagai hasil pengukuran. Angka pada Bagian 4.2 dan 4.3 berasal dari pengukuran nyata dengan `n` yang dinyatakan.

---

## DAFTAR PUSTAKA

**[PERLU REFERENSI: seluruh entri harus dilengkapi penulis sesuai gaya sitasi jurnal tujuan. Detail bibliografi tidak dicantumkan pada draf ini karena tidak dapat diverifikasi dari sisi penulis.]**

Sumber yang dikutip dalam teks dan wajib dilengkapi:

1. Badan Gizi Nasional. (2025, 14 Agustus). *[judul dan jenis dokumen]*.
2. Peraturan Badan Gizi Nasional Nomor 1 Tahun 2026 tentang Sisa Pangan, Sampah, dan Air Limbah Domestik Program Makan Bergizi Gratis. **[lengkapi nomor pasal]**
3. Bappenas. (2021). *[judul laporan]*.
4. Studi FISIP UI. (2025). *[judul dan penulis]*.
5. Standley, T., dkk. (2017). *image2mass: Estimating the Mass of an Object from Its Image.* ICML.
6. *[Referensi Bagian 2.1–2.5]*


---

# BAGIAN II — LAPORAN AUDIT PAPER

> Dokumen internal. **Hapus sebelum submit.**

**Objek audit:** (1) Draf asli `AIOT DRIVEN MBG WASTE.txt`; (2) `DOKUMEN REVISI PAPER AIoT.txt`; (3) seluruh sistem yang berjalan (kode, basis data produksi, firmware) sebagai sumber verifikasi klaim.
**Tanggal audit:** 20 September 2026
**Metode:** penilaian tiap bagian terhadap standar artikel ilmiah; setiap klaim yang dapat diuji diverifikasi langsung ke kode/database.
**Dokumen hasil:** Bagian I (naskah) dan Bagian III (daftar perbaikan) pada dokumen ini

---

### A. Ringkasan Eksekutif

#### A.1 Penilaian umum

| Aspek | Nilai | Keterangan |
|---|---|---|
| Kelengkapan struktur | **4/10** | Tinjauan pustaka, kesimpulan, dan daftar pustaka tidak ada pada draf asli |
| Kejelasan rumusan masalah | **7/10** | Rumusan jelas, tetapi satu pertanyaan (kapasitas SDM) tidak dapat dijawab |
| Kesesuaian metode | **5/10** | Kerangka ADDIE ada, tetapi tanpa n, protokol, dan prosedur |
| Dukungan bukti atas klaim | **2/10** | **Masalah terbesar.** Seluruh angka kinerja tanpa data pendukung |
| Kejujuran pelaporan | **6/10** (draf revisi) / **3/10** (draf asli) | Draf revisi sudah membaik dengan hedging, tetapi masih ada kekeliruan arah |
| Kualitas data | **2/10** | Data yang tersimpan tidak dapat menopang klaim apa pun |
| Keterlacakan & reprodusibilitas | **3/10** | Tanpa prosedur, tanpa kode/skema yang disertakan |
| Kepatuhan etika | **2/10** | Belum ada pernyataan etika maupun tata kelola citra |
| **Kesiapan submit (kondisi saat ini)** | **3/10** | **Belum siap.** Terdapat klaim yang tidak dapat dipertanggungjawabkan |

#### A.2 Tiga temuan terpenting

**Temuan 1 — Draf revisi justru melemahkan paper tanpa perlu.** Dokumen revisi menetapkan AI hanya "deteksi biner True/False" dan menyatakan analitik jenis makanan "belum diimplementasikan". Verifikasi terhadap sistem yang berjalan menunjukkan **kebalikannya**: model mengeluarkan kelas spesifik (`nasi`, `Tahu`, `Ayam_Goreng`, `cap_cai`, `Kelengkeng`), backend memetakan ke kategori, dan antarmuka menampilkan peringkat. Revisi ini diperbaiki dengan **memulihkan klaim multikelas**, disertai syarat pelaporan metrik per kelas.

**Temuan 2 — Angka 92%, <1%, <2 detik, dan WRI 81,78–82,29% tidak memiliki bukti tersimpan.** Tidak ada log akurasi, tidak ada prosedur kalibrasi terekam, tidak ada instrumentasi durasi saat pengukuran (kini sudah dipasang), dan `maggot_harvests` berisi **0 baris**. Keempatnya dihapus dari posisi klaim hasil.

**Temuan 3 — Data yang tersimpan tidak dapat menopang klaim kinerja.** Audit basis data produksi menemukan: 54 dari 60 baris deteksi bernilai **0 kg**, total seluruh korpus **0,200 kg**, dan **32 dari 32** baris telemetri tidak memuat satu pun nilai sensor. Sebagian besar angka pada tabel kinerja tidak dapat dihitung dari data ini.

---

### B. Audit per Bagian

| Bagian | Kondisi draf lama | Temuan | Severity | Sudah ditangani di draf final | Sisa pekerjaan |
|---|---|---|---|---|---|
| **Judul** | "…Conversion to Fertilizer and Maggot Biomass" | Menjanjikan karakterisasi pupuk & biomassa, tetapi `maggot_harvests` = 0 baris dan tidak ada data proksimat | **Critical** | Ya — judul diubah, fokus pada deteksi & telemetri | Persetujuan tim |
| **Abstrak** | Memuat 92%, <1%, <2 dtk, WRI sebagai hasil | Mencampur hasil ukur dengan rujukan; tanpa n | **Critical** | Ya — hanya angka terukur, WRI sebagai rujukan | Referensi WRI |
| **Pendahuluan** | 2.400 ton/hari & 200.706 ton CO₂e tanpa asumsi; Rp213–551 T disandingkan dengan MBG | Angka tanpa rincian perhitungan; agregat nasional berpotensi menyesatkan | High | Ya — klarifikasi cakupan ditambahkan | Sumber angka |
| **Rumusan masalah** | RQ-3 menggabungkan performa biologis dan kapasitas SDM | Dua hal berbeda digabung; yang satu terukur, yang satu tidak | High | Ya — RQ-3 dirumuskan ulang agar dapat dijawab | — |
| **Manfaat/Dampak** | "terbukti efektif", "berhasil mempermudah" | Klaim kausal dari data observasional | High | Ya — bahasa proporsional | — |
| **Tinjauan Pustaka** | **Tidak ada** | Klaim kebaruan tidak dapat diverifikasi; pembahasan tanpa basis pembanding | **Critical** | Kerangka disediakan | **Pencarian literatur oleh penulis** |
| **Metode — waktu & lokasi** | Tidak menyebut waktu sama sekali | Reproduksibilitas hilang | High | Ya — placeholder ditandai jelas | **Isi tanggal & lokasi** |
| **Metode — instrumen** | Menyebut Supabase **dan** ThingsBoard tanpa membedakan peran | Ambiguitas arsitektur | Medium | Ya — diklarifikasi: ThingsBoard tidak dipakai, inferensi di server | — |
| **Metode — protokol** | Tidak ada n, pembagian data, atau prosedur pelabelan | Tanpa ini, akurasi 92% tidak dapat ditafsirkan | **Critical** | Placeholder terstruktur | **Tulis protokol** |
| **Metode — kalibrasi load cell** | Tidak ada | Klaim galat tidak dapat direproduksi | **Critical** | Placeholder | **Jalankan & catat** |
| **Metode — parameter biokonversi** | Tidak ada densitas, instar, laju pakan, suhu, ulangan | Kombinasi reduksi tinggi dalam <24 jam tidak dapat dinilai kewajarannya secara biologis | **Critical** | Placeholder | **Jalankan eksperimen** |
| **Metode — etika** | Tidak ada | Penelitian melibatkan citra anak di bawah umur; banyak jurnal melakukan *desk rejection* | **Critical** | Kerangka + mitigasi teknis | **Urus persetujuan** |
| **Tabel 1 (status AI)** | Menyatakan verifikasi True/False sebelum penimbangan | **Fitur ini tidak ada di program yang terpasang** — tidak ada pengecekan presensi sisa makanan | **Critical** | Tabel dihapus dari hasil; fitur dinyatakan belum diimplementasikan | Implementasi atau hapus dari rancangan |
| **Rumus WRI** | `(W₀−Wₜ)/W₀`, tanpa dimensi waktu, disebut "WRI" | Istilah tidak konsisten dengan literatur | Medium | Ya — disebut **ERS**, durasi dilaporkan terpisah | Referensi definisi |
| **Tabel 2 (biokonversi)** | 81,78–82,29%, <24 jam | Disajikan sebagai hasil sendiri di sebagian bagian, sebagai kutipan di bagian lain | **Critical** | Ya — disajikan **hanya** sebagai rujukan literatur | **Keputusan atribusi** |
| **Tabel 4 (kinerja)** | Enam angka tanpa n, tanpa sebaran | Tidak dapat ditafsirkan | **Critical** | Diganti tabel dengan n & kondisi pengukuran | Data tambahan |
| **Hasil — analitik jenis makanan** | Dijanjikan, tetapi dinilai belum diimplementasikan | **Justru sudah ada** | High | Ya — dipulihkan sebagai multikelas | Akurasi per kelas |
| **Pembahasan** | Mengulang Hasil; "terbukti efektif"; tanpa pembanding | Tidak memenuhi fungsi diskusi ilmiah | High | Ya — interpretasi alternatif ditambahkan | **Pembanding literatur** |
| **Keterbatasan** | **Tidak ada** | Wajib ada | High | Ya — 10 butir eksplisit | — |
| **Kesimpulan** | **Tidak ada** | Struktur paper tidak lengkap | High | Ya — ditambahkan | — |
| **Daftar Pustaka** | **Tidak ada** | Klaim tidak dapat diverifikasi pembaca | **Critical** | Kerangka disediakan | **Susun entri lengkap** |
| **Pernyataan pendanaan/konflik** | Tidak ada | Syarat format dasar | Medium | Kerangka disediakan | **Isi** |
| **Gambar 1** | Dirujuk tetapi tidak ada dalam naskah | Pembaca tidak dapat melihat arsitektur | Medium | Placeholder ditandai | **Sisipkan gambar** |
| **Reprodusibilitas** | Tidak ada kode, skema rangkaian, atau data mentah | Tidak dapat direplikasi | High | Placeholder | **Lampirkan** |

---

### C. Audit Klaim (verifikasi terhadap sistem nyata)

Setiap klaim diperiksa langsung ke kode, basis data produksi, atau pengukuran.

| # | Klaim pada draf | Hasil verifikasi | Status | Tindakan |
|---|---|---|---|---|
| 1 | Akurasi deteksi **92%** | Tidak ada log *ground truth* vs prediksi di sistem mana pun | **Tidak terbukti** | Dihapus; ganti dengan protokol pengukuran |
| 2 | Galat *load cell* **<1%** | Tidak ada prosedur kalibrasi terekam. Data yang ada: 54/60 baris **0 kg**, total 0,200 kg, ambang sesi 0,02 kg → berada di **lantai derau** | **Tidak terbukti** | Dihapus; ganti dengan rencana kalibrasi |
| 3 | Latency **<2 detik** | Saat audit, tidak ada instrumentasi durasi. Kini terpasang dan terukur | **Tidak terbukti** | Diganti angka terukur: basis data median 319,4 ms; rantai telemetri 298 ms |
| 4 | **WRI 81,78–82,29%** | `maggot_harvests` = 0 baris; tidak ada `W₀`/`Wₜ` | **Tidak terbukti** | Disajikan sebagai rujukan literatur |
| 5 | Durasi penguraian **<24 jam** | Tidak ada data waktu pengamatan | **Tidak terbukti** | Dipindahkan ke keterbatasan |
| 6 | "*Monitoring* real-time" | 32 baris telemetri tersimpan, **0 memuat nilai sensor** | **Tidak terbukti** | Diganti: penjadwalan terbukti, validitas nilai belum |
| 7 | Analitik jenis makanan | **Terbukti ada** — model multikelas, backend memetakan kategori, UI menampilkan peringkat | **Terbukti (sebagian)** | Dipulihkan sebagai klaim multikelas; akurasi per kelas masih perlu diukur |
| 8 | Deteksi biner True/False sebelum penimbangan | **Tidak ada di program terpasang** | **Tidak terbukti** | Dinyatakan belum diimplementasikan |
| 9 | Eliminasi bau & vektor penyakit | Tidak ada pengukuran apa pun | **Tidak terbukti** | Bersifat observasional; dinyatakan sebagai keterbatasan |
| 10 | Peningkatan kapasitas SDM | Tidak ada instrumen | **Tidak terbukti** | Menjadi agenda lanjutan |
| 11 | Penghematan emisi CO₂e | Faktor 0,52 tanpa rujukan; tayang di dashboard publik | **Tidak terbukti asumsinya** | Perlu sumber atau ditandai estimasi |
| 12 | Interval telemetri 30 detik | **Terbukti** — median 30,0 s, n=31 | **Terbukti** | Dilaporkan dengan n |
| 13 | Rantai data berjalan end-to-end | **Terbukti** — 32 insert, alur MQTT→backend→DB | **Terbukti** | Dilaporkan |

Neraca: **2 klaim terbukti, 1 terbukti sebagian, 8 tidak terbukti, 1 asumsinya tanpa rujukan.**

---

### D. Audit Integritas Data

Ringkasan dari `AUDIT_INTEGRITAS_DATA.md`:

| Tabel | Baris | Kondisi | Dampak pada paper |
|---|---:|---|---|
| `waste_records` | 60 | **54 bernilai 0 kg**; total 0,200 kg; 1 tanggal | Tabel distribusi kategori tidak dapat digeneralisasi |
| `sensor_readings` | 32 | **0 memuat nilai sensor** | Klaim pemantauan lingkungan tanpa bukti |
| `maggot_harvests` | **0** | kosong | Klaim biomassa/panen tidak mungkin dihitung |
| `menu_uploads` | **0** | kosong | Korelasi menu–limbah **tidak mungkin dihitung** |
| `sales_records` | **0** | kosong | Klaim pemasukan tidak dapat didukung |
| `maggot_batches` | 1 | batch `001`, 5 gram telur, status `inkubasi` | Tidak ada siklus yang selesai |
| `ai_predictions` | 0 | **tidak pernah ditulis kode mana pun** | Klaim penyimpanan prediksi tidak didukung implementasi |

**Skor kesiapan data untuk klaim riset: 15/100.**

---

### E. Audit Konsistensi Internal

| # | Inkonsistensi | Lokasi | Severity | Tindakan |
|---|---|---|---|---|
| 1 | WRI sebagai kutipan di satu bagian, sebagai hasil sendiri di bagian lain | Abstrak vs Manfaat/Dampak | **Critical** | Diputuskan penulis |
| 2 | AI disebut biner, tetapi analitik jenis makanan diklaim | Tabel 1 vs Tabel 3/4 | **Critical** | Diselaraskan menjadi multikelas |
| 3 | Supabase dan ThingsBoard disebut keduanya tanpa pembedaan peran | Metode | Medium | Diklarifikasi |
| 4 | Inferensi disebut di ESP32-Cam dan di server | Metode | Medium | Diklarifikasi: di server |
| 5 | Durasi penguraian <24 jam vs reduksi 82% — tidak dijelaskan apakah basis basah/kering | Hasil | High | Dinyatakan sebagai keterbatasan |
| 6 | Peraturan BGN membebankan SPPG, sistem dipasang di sekolah | Pendahuluan | Medium | Dicatat sebagai pertanyaan terbuka |
| 7 | Judul menjanjikan pupuk & biomassa, isi tidak memuat keduanya | Judul vs Isi | **Critical** | Judul diubah |

---

### F. Audit Etika & Kepatuhan

| Butir | Kondisi | Severity | Kebutuhan |
|---|---|---|---|
| Persetujuan sekolah/komite etik | **Tidak ada** | **Critical** | Surat persetujuan |
| Persetujuan orang tua/wali | **Tidak ada** | **Critical** | Mekanisme dan bentuk |
| Kebijakan retensi citra | **Tidak ada** | High | Durasi simpan & prosedur hapus |
| Anonimisasi data siswa | Skema **tidak menyimpan** PII; hanya agregat | Baik | Dinyatakan sebagai mitigasi |
| Kepatuhan UU PDP No. 27/2022 | Belum dinyatakan | High | Pernyataan kepatuhan |
| Izin penggunaan foto training | Tidak dapat diverifikasi dari repo | Medium | Konfirmasi |

Catatan: penilaian ini **tidak** menuduh adanya pelanggaran. Yang dicatat adalah bahwa **dokumentasi** yang diperlukan untuk submisi belum ada.

---

### G. Audit Format & Kesiapan Submit

| Butir | Kondisi | Kebutuhan |
|---|---|---|
| Gaya sitasi | Tidak konsisten; daftar pustaka kosong | Ikuti template jurnal tujuan |
| Gambar | Gambar 1 dirujuk, tidak ada | Sisipkan diagram arsitektur |
| Penomoran tabel | Tabel 2 dan 3 dipertahankan tanpa nilai yang sah | Perbarui setelah data tersedia |
| Placeholder `[PERLU DATA]` | Masih ada di draf final | Isi sebelum submit |
| Panjang abstrak | Belum disesuaikan | Sesuaikan batas jurnal |
| Bahasa | Indonesia akademik, konsisten | Pertahankan |
| Lampiran data mentah | Tidak ada | Sertakan bila diminta jurnal |

---

### H. Kekuatan Paper (agar penilaian berimbang)

1. **Masalah nyata dan relevan** dengan kebijakan nasional, dengan dasar regulasi yang dapat dilacak keberadaannya.
2. **Integrasi tiga pilar** (deteksi visual, telemetri penimbangan, pemantauan biokonversi) merupakan kebaruan yang wajar dan bukan sekadar penambahan sensor.
3. **Perangkat keras berbiaya rendah** menjadikan sistem dapat direplikasi sekolah lain — kontribusi praktis yang dapat diverifikasi dari daftar komponen.
4. **Arsitektur benar-benar terbangun dan berjalan**, bukan sekadar rancangan di atas kertas. Ini keunggulan yang tidak dimiliki banyak paper perancangan.
5. **Draf revisi sudah menunjukkan kesediaan mengakui keterbatasan** — modal penting menghadapi reviewer.
6. **Temuan metodologis pada Bagian 5.4** (pembagian bobot mengabaikan densitas) adalah kontribusi nyata hasil audit, bukan sekadar kritik.

---

### I. Kesimpulan Audit

Paper ini **belum siap submit**, tetapi **dapat disiapkan** dengan dua jalur:

**Jalur cepat (system design & feasibility).** Fokuskan paper pada rancangan dan verifikasi fungsional — yang memang sudah terbukti. Hapus seluruh klaim kinerja biologis dan kuantitatif. Lengkapi tinjauan pustaka, daftar pustaka, etika, dan protokol. Nilai: jujur, dapat dipertahankan, kontribusi jelas.

**Jalur kuat (tambahkan data minimum).** Jalur cepat + dua pengukuran tambahan: (a) eksperimen maggot terkontrol 3 wadah dengan kelompok tanpa larva, 24–48 jam; (b) minimal 150 foto berlabel untuk akurasi per kelas. Nilai: jauh lebih kuat, tetapi memerlukan waktu lapangan.

Risiko terbesar bila tetap disubmit dalam kondisi sekarang adalah **klaim biologis tanpa data** — ini jenis temuan yang paling mudah dikenali reviewer dan paling sulit dipertahankan.


---

# BAGIAN III — DAFTAR PERBAIKAN & DATA YANG MASIH HILANG

> Dokumen internal. **Hapus sebelum submit.**

**Untuk:** Tim penulis paper MBGCircular
**Dokumen pendamping:** Bagian I (naskah) dan Bagian III (daftar perbaikan) pada dokumen ini

Dokumen ini memuat dua bagian: **(A)** perbaikan yang dapat dikerjakan tanpa pengujian baru, dan **(B)** data yang harus diukur. Setiap butir menyebutkan siapa yang perlu mengerjakan dan berapa lama.

---

### Bagian A — Perbaikan yang dapat dikerjakan sekarang

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

#### A1 — Mengapa ini paling penting

Angka 81,78–82,29% muncul sebagai **kutipan** (Akmal, 2024) di bagian Manfaat/Dampak, tetapi sebagai **hasil pengukuran sendiri** di Abstrak, Tabel 2, Tabel 4, dan Pembahasan. Ini tidak dapat dibiarkan: reviewer akan menemukannya, dan efeknya merusak kredibilitas seluruh naskah.

Tiga kemungkinan jawaban:

| Jawaban | Konsekuensi |
|---|---|
| **Kutipan Akmal (2024)** | Draf final sudah benar. Cukup pastikan seluruh penyebutan konsisten sebagai rujukan pembanding. **Tidak perlu eksperimen.** |
| **Hasil pengukuran tim** | Wajib menyertakan `W₀`, `Wₜ`, durasi, dan jumlah ulangan. Tanpa itu, klaim tidak dapat dipertahankan → kerjakan Bagian B1 |
| **Tidak yakin** | Gunakan jalur kutipan sampai data ditemukan. Jangan menuliskan sebagai hasil. |

---

### Bagian B — Data yang harus diukur

#### B1. Eksperimen biokonversi minimum (paling berdampak)

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

Berkas kerja: `VALIDASI_PENGUJIAN.md` (di folder `docs/`) Bagian 3.

---

#### B2. Akurasi deteksi (menggantikan klaim 92%)

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

#### B3. Kalibrasi load cell (menggantikan klaim galat <1%)

**Untuk apa:** menutup klaim presisi penimbangan.

| Aspek | Ketentuan |
|---|---|
| **Massa acuan** | 5 titik, mis. 50 g, 100 g, 200 g, 500 g, 1000 g |
| **Ulangan** | 5× per titik |
| **Yang dihitung** | Galat %FS, repeatability (simpangan baku), R² regresi linier |
| **Wajib dinyatakan** | **Rentang bobot tempat galat diukur** |

**Konteks dari audit:** data yang ada justru berada di dekat ambang deteksi (0,02 kg/sesi) dengan 90% baris bernilai 0 — yaitu **lantai derau**. Angka "galat <1%" tanpa menyebut rentang tidak bermakna: 1% dari 0,02 kg = 0,2 gram, tidak realistis untuk *load cell* 10 kg.

Berkas kerja: `VALIDASI_PENGUJIAN.md` (di folder `docs/`) Bagian 2.

**Perkiraan waktu:** 1 hari.

---

#### B4. Latensi inferensi Roboflow

**Untuk apa:** melengkapi Tabel 2.

| Aspek | Ketentuan |
|---|---|
| **Cara** | `ROBOFLOW_API_KEY=<kunci> node tools/benchmark/03-benchmark-latency.mjs --n=30` |
| **Yang dilaporkan** | min, median, rata-rata, p95, maks, dan **n** |

**Catatan:** instrumentasi berjenjang kini sudah terpasang permanen di backend, sehingga distribusi latensi dapat dihitung ulang kapan saja dari data nyata tanpa pengukuran manual.

**Perkiraan waktu:** 1 jam (tersedia kunci API).

---

#### B5. Data lapangan multi-hari

**Untuk apa:** menutup Tabel 3 dan membuat distribusi kategori layak dilaporkan.

| Aspek | Kondisi saat ini | Minimum yang diperlukan |
|---|---|---|
| Jumlah hari | **1 hari** | ≥ 5 hari sekolah |
| Baris bermakna | 6 dari 60 (90% nol) | Perbaiki validasi dulu (sudah dikerjakan di kode) |
| Jumlah transaksi | 6 | ≥ 100 |

**Penting:** perbaikan validasi pada kode **sudah selesai** — sesi dengan bobot 0 kg kini ditolak, dan pengiriman hasil simulasi tidak lagi disimpan. Namun perbaikan itu **belum aktif di produksi** karena migrasi basis data belum dijalankan (lihat `PANDUAN_EKSEKUSI_OPERATOR.md` (di folder `docs/`)).

---

#### B6. Etika & tata kelola data

| Butir | Kondisi | Kebutuhan |
|---|---|---|
| Persetujuan sekolah | Belum ada | Surat persetujuan |
| Persetujuan orang tua/wali | Belum ada | Mekanisme & bentuk |
| Kebijakan retensi citra | Belum ada | Durasi simpan & prosedur hapus |
| Pernyataan UU PDP No. 27/2022 | Belum ada | Pernyataan kepatuhan |

**Wajib sebelum submit ke jurnal mana pun** untuk penelitian yang melibatkan citra anak di bawah umur.

**Mitigasi yang sudah ada dan dapat dinyatakan:** skema basis data **tidak menyimpan** nama, nomor induk, atau identitas siswa — hanya tanggal, kategori, bobot, dan cap waktu.

---

### Bagian C — Keputusan strategis

> **KEPUTUSAN: JALAN A — kerangka perancangan sistem & kelayakan.**
>
> Bagian I dokumen ini sudah disusun ulang dengan kerangka ini.
> Konsekuensinya: **Bagian B1 dan B2 di bawah menjadi opsional** (nilai tambah),
> bukan syarat kelayakan submit. Yang tetap wajib adalah **Bagian A** dan
> **Bagian B6 (etika)**.
>
> Dengan Jalan A, klaim yang dipegang hanya: arsitektur terbangun & berjalan,
> deteksi multikelas berjalan, telemetri andal, sistem menyimpan data kuantitatif,
> dan komponen berbiaya rendah. Seluruh klaim besaran dampak dinyatakan belum diuji.
>
> Angka WRI 81,78–82,29% **tidak lagi muncul sama sekali** di draf final, sehingga
> keputusan atribusinya (butir A1) tidak lagi menghambat submit. Namun bila angka
> itu tetap ingin disebut sebagai pembanding literatur, A1 tetap perlu dijawab.

| Aspek | Tanpa data tambahan (Jalan A murni) | Bila sempat menambah data |
|---|---|---|
| Klaim dampak biologis | Dinyatakan belum diuji | Dapat diklaim dengan B1 |
| Akurasi model | Dinyatakan belum diukur | Dapat diklaim per kelas dengan B2 |
| Presisi penimbangan | Dinyatakan belum dikarakterisasi | Dapat diklaim dengan B3 |
| Kelayakan submit | **Sudah layak setelah Bagian A + B6 selesai** | Lebih kuat |

**Yang harus dihindari dalam kondisi apa pun:** submit dengan angka biologis yang tidak pernah diukur. Itu bukan "data simulasi", melainkan **fabrikasi**, dan merupakan risiko terbesar pada naskah.

---

### Daftar centang sebelum submit

**Wajib (Jalan A):**
- [ ] Daftar pustaka lengkap (A2)
- [ ] Tinjauan pustaka terisi (A3)
- [ ] `maggot_harvests` = 0 → klaim biomassa/pupuk dihapus atau data disediakan
- [ ] `menu_uploads` = 0 → klaim korelasi menu dihapus atau data disediakan
- [ ] Etika & tata kelola citra dilengkapi (B6)
- [ ] Tidak ada placeholder `[PERLU DATA]` yang tersisa tanpa penjelasan
- [ ] Judul sesuai cakupan data
- [ ] Gambar 1 disisipkan

**Nilai tambah bila waktu memungkinkan:**
- [ ] Eksperimen maggot 3 wadah termasuk kontrol (B1)
- [ ] Kalibrasi load cell terekam (B3)
- [ ] Latensi Roboflow terukur (B4)
- [ ] Akurasi per kelas + baseline mayoritas-kelas (B2)
- [ ] Estimasi biaya per unit, sebagai dukungan klaim arsitektur berbiaya rendah

**Sebelum data lapangan dikumpulkan:**
- [ ] Jalankan 4 migrasi basis data (`PANDUAN_EKSEKUSI_OPERATOR.md` (di folder `docs/`))
- [ ] Deploy backend versi baru — agar sesi tanpa nilai tidak lagi tersimpan
- [ ] Pastikan rentang tanggal data yang dikutip hanya memuat baris bermakna

---

### Satu hal yang perlu diperhatikan saat mengumpulkan data baru

Sistem saat ini membagi bobot ke jenis makanan berdasarkan **luas kotak pembatas** saja, tanpa memperhitungkan densitas jenis makanan. Audit mengukur dampaknya pada deteksi nyata: **nasi +30,3%** dan **sayur −28,4%** dibanding metode yang memperhitungkan densitas. Karena luaran utama sistem adalah peringkat makanan terbuang, selisih ini **berpotensi mengubah peringkat dan rekomendasi menu**.

Selama peringkat menjadi salah satu luaran yang dilaporkan, perbaikan ini perlu dikerjakan sebelum data dikumpulkan dalam jumlah besar. Rancangannya tersedia di `WEIGHT_ESTIMATION_DESIGN.md` (di folder `docs/`), dan aktivasi awalnya tidak memerlukan kalibrasi (cukup memakai ambang keyakinan deteksi).

