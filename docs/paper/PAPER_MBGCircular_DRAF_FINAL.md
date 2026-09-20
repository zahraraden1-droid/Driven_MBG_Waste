# MBGCircular: Perancangan Sistem AIoT untuk Deteksi Multikelas Sisa Makanan dan Telemetri Pengelolaan Sampah Organik Sekolah

**DRAF FINAL — kerangka: perancangan sistem & kelayakan (system design & feasibility)**

**Untuk diisi sebelum submit:** lihat `DAFTAR_PERBAIKAN_DAN_DATA_HILANG.md`. Setiap penanda `[PERLU DATA]` dan `[PERLU REFERENSI]` tidak boleh diisi dengan angka perkiraan.

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
