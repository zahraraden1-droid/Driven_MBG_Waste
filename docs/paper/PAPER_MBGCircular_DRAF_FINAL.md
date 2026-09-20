# MBGCircular: Rancangan Sistem AIoT untuk Deteksi Multikelas Sisa Makanan dan Telemetri Pengelolaan Sampah Organik Sekolah

**DRAF FINAL — siap submit setelah melengkapi butir pada `DAFTAR_PERBAIKAN_DAN_DATA_HILANG.md`**

---

## CATATAN PENULIS (hapus sebelum submit)

Dokumen ini adalah draf hasil audit dan penulisan ulang. Perubahan besar dari draf sebelumnya:

1. **Judul diubah.** Draf lama menjanjikan *"Conversion to Fertilizer and Maggot Biomass"*, tetapi tidak ada data karakterisasi pupuk/kasgot maupun biomassa larva (`maggot_harvests` berisi **0 baris**). Judul baru menyatakan cakupan yang benar-benar didukung bukti.
2. **Klaim akurasi 92%, galat load cell <1%, dan latency <2 detik dihapus** dari tempat klaim hasil. Angka-angka itu tidak memiliki data pendukung yang tersimpan.
3. **Klaim AI dipulihkan menjadi multikelas**, karena sistem yang berjalan memang memakai model multikelas (keluaran: `nasi`, `Tahu`, `Ayam_Goreng`, `cap_cai`, `Kelengkeng`). Draf revisi sebelumnya justru menurunkannya menjadi biner.
4. **Angka WRI 81,78–82,29% disajikan sebagai rujukan literatur**, bukan sebagai hasil penelitian ini. Belum ada pengukuran W0/Wt yang tersimpan.
5. **Angka kinerja yang dilaporkan adalah yang benar-benar terukur**, dengan menyebutkan `n` dan kondisinya.

Setiap bagian yang belum dapat dipenuhi ditandai **[PERLU DATA]**. Bagian itu **tidak boleh diisi dengan angka perkiraan**; lihat `DAFTAR_PERBAIKAN_DAN_DATA_HILANG.md`.

---

## ABSTRAK

Program Makan Bergizi Gratis (MBG) berpotensi menghasilkan timbulan sampah makanan dalam jumlah besar di lingkungan sekolah. Penelitian ini merancang dan menguji secara fungsional **MBGCircular**, sebuah sistem terintegrasi berbasis *Artificial Intelligence* (AI) dan *Internet of Things* (IoT) untuk mendeteksi sisa makanan pada ompreng serta mencatat telemetri pengelolaan sampah organik sekolah.

Pengembangan menggunakan pendekatan *Research and Development* dengan kerangka ADDIE. Sistem terdiri atas unit penimbangan berbasis ESP32-CAM dengan sensor *load cell* HX711, unit pemantauan bilik maggot berbasis ESP8266 dengan sensor suhu, kelembapan, dan amonia, backend Express.js, basis data Supabase (PostgreSQL), serta *broker* MQTT. Deteksi visual dijalankan di sisi server menggunakan layanan Roboflow dengan keluaran **multikelas** (jenis makanan), bukan sekadar deteksi biner.

Pengujian fungsional menunjukkan rantai data berjalan *end-to-end* dari perangkat hingga basis data. Telemetri bilik maggot tercatat dengan interval **median 30,0 detik** (n=31), sesuai dengan periode pengiriman yang ditetapkan pada perangkat. Pengukuran latensi yang telah dilakukan mencatatkan layanan prediksi **median 305,5 ms** (n=15) dan operasi baca basis data **median 319,4 ms** (n=15); rantai telemetri terukur **298 ms** setelah optimasi. Sebagai acuan kinerja biokonversi, penelitian ini merujuk pada rentang *Waste Reduction Index* yang dilaporkan literatur, yaitu **81,78–82,29%** [PERLU REFERENSI: lengkapi entri bibliografi]; nilai tersebut **bukan** hasil pengukuran penelitian ini.

Penelitian ini **belum** mengukur akurasi deteksi terhadap data berlabel, akurasi penimbangan melalui prosedur kalibrasi terekam, maupun efisiensi reduksi sampah secara eksperimental. Keterbatasan tersebut dinyatakan secara eksplisit dan menjadi agenda penelitian lanjutan.

**Kata kunci:** AIoT, deteksi sisa makanan, maggot *Black Soldier Fly*, telemetri, MQTT, ekonomi sirkular, Makan Bergizi Gratis

---

## 1. PENDAHULUAN

### 1.1 Latar Belakang

Program Makan Bergizi Gratis menargetkan 17 hingga 20 juta siswa di Indonesia (Badan Gizi Nasional, 2025). Skala implementasi ini berpotensi menghasilkan hingga 2.400 ton sampah makanan harian dan emisi gas rumah kaca sebesar 200.706 ton CO₂e/tahun **[PERLU REFERENSI: sumber dan asumsi perhitungan kedua angka]**. Sebagai gambaran skala masalah *food waste* secara umum di Indonesia — **bukan spesifik Program MBG** — Bappenas (2021) memperkirakan kerugian ekonomi lintas rantai pasok nasional mencapai Rp213–551 triliun/tahun. Klarifikasi cakupan ini penting agar angka agregat nasional tidak disalahpahami sebagai kerugian yang timbul khusus dari Program MBG.

Studi FISIP UI (2025) mencatat 85–88% siswa di DKI Jakarta menyisakan makanan MBG **[PERLU REFERENSI: lengkapi entri]**. Angka ini relevan secara metodologis: karena mayoritas ompreng mengandung sisa makanan, distribusi kelas menjadi tidak seimbang, sehingga **akurasi mentah tidak dapat dipakai sebagai satu-satunya ukuran kinerja model deteksi** (lihat Bagian 6).

Badan Gizi Nasional menerbitkan Peraturan BGN Nomor 1 Tahun 2026 yang mewajibkan Satuan Pelayanan Pemenuhan Gizi (SPPG) mengelola sampah berbasis ekonomi sirkular, termasuk pencatatan data kuantitatif volume/berat sampah secara berkala **[PERLU REFERENSI: kutip pasal spesifik]**. Terdapat ambiguitas yurisdiksi yang perlu dicatat: kewajiban dibebankan pada SPPG, sedangkan sistem pada penelitian ini dipasang di sekolah. Klarifikasi kewenangan ini dibahas pada Bagian 7.

### 1.2 Kesenjangan yang Ditangani

Berdasarkan identifikasi kebutuhan pada tahap *Analysis* **[PERLU DATA: metode dan jumlah responden]**, teridentifikasi indikasi kendala operasional di tingkat sekolah: keterbatasan kapasitas SDM petugas, pemilahan manual yang memakan waktu, risiko pembusukan sampah, serta belum tersedianya pemantauan digital terintegrasi. Pernyataan ini merupakan hasil identifikasi kebutuhan, bukan temuan survei formal.

### 1.3 Rumusan Masalah

1. Bagaimana merancang dan menerapkan sistem deteksi visual sisa makanan pada ompreng menggunakan kamera ESP32-Cam dengan posisi tetap?
2. Bagaimana merancang arsitektur IoT berbasis sensor *load cell* dan protokol MQTT untuk mencatat bobot sisa makanan serta menyajikan data bagi unit SPPG?
3. Sejauh mana sistem yang dibangun berfungsi sesuai rancangan berdasarkan pengujian fungsional, dan keterbatasan apa yang masih tersisa?

> Rumusan masalah ketiga diubah dari "peningkatan kapasitas SDM" menjadi pertanyaan yang dapat dijawab dengan bukti yang tersedia. Kapasitas SDM **tidak diukur** dalam penelitian ini dan dinyatakan sebagai agenda lanjutan.

### 1.4 Tujuan Penelitian

1. Merancang dan membangun sistem deteksi visual multikelas sisa makanan pada ompreng.
2. Membangun jaringan IoT yang mengintegrasikan mikrokontroler, sensor *load cell*, sensor lingkungan, dan basis data untuk menghasilkan catatan kuantitatif bobot sampah.
3. Menguji fungsi sistem secara *end-to-end* serta mengukur latensi pada tahap-tahap yang dapat diukur.

### 1.5 Kontribusi

1. **Integrasi**: menyatukan deteksi visual, telemetri penimbangan, dan pemantauan bilik maggot dalam satu alur data yang dapat dioperasikan sekolah.
2. **Arsitektur berbiaya rendah**: pemilihan ESP32-Cam, HX711, dan MQTT *open-source* menjadikan sistem dapat direplikasi dengan biaya perangkat yang relatif rendah **[PERLU DATA/REFERENSI: estimasi biaya per unit dan pembanding sistem komersial]**.
3. **Catatan metodologis**: identifikasi bahwa pembagian berat berbasis luas *bounding box* mengabaikan densitas jenis makanan dan nilai keyakinan (*confidence*) model, beserta pengukuran besarnya dampak tersebut (Bagian 6.4).

### 1.6 Batasan Penelitian

Penelitian ini merupakan **pengujian fungsional pada satu lokasi**, bukan uji kinerja lapangan berskala. Tidak tersedia kelompok pembanding, tidak ada pengukuran akurasi model terhadap data berlabel, dan tidak ada pengukuran efisiensi biokonversi. Seluruh keterbatasan dirinci pada Bagian 7.

---

## 2. TINJAUAN PUSTAKA

**[PERLU REFERENSI: bagian ini harus diisi penulis melalui pencarian literatur. Kerangka di bawah disediakan agar tidak dikarang.]**

### 2.1 Pemantauan sisa makanan berbasis computer vision

Diperlukan 3–5 studi tentang deteksi/pemantauan *plate waste* di kantin sekolah atau institusi sejenis, mencakup: arsitektur model, jumlah kelas, ukuran dan pembagian data, serta metrik yang dilaporkan.

**Posisi penelitian ini terhadap literatur tersebut [disusun setelah literatur terkumpul]:**

### 2.2 Biokonversi sampah organik oleh larva Black Soldier Fly

Diperlukan studi tentang rentang *Waste Reduction Index*, waktu pengolahan, densitas penebaran larva, dan kondisi optimal. Rentang **81,78–82,29%** yang dirujuk pada Bagian 1.1 perlu diverifikasi ke sumber aslinya **[PERLU REFERENSI]**.

### 2.3 Definisi metrik reduksi sampah

Perlu penelusuran definisi *Waste Reduction Index* yang lazim dipakai pada literatur biokonversi. Catatan penting: rumus yang dipakai draf sebelumnya, `(W₀ − Wₜ)/W₀ × 100%`, **tidak memuat komponen waktu**, sedangkan sebagian literatur menormalisasi terhadap durasi pengamatan. Karena itu penelitian ini **tidak memakai istilah WRI** dan menyebut metriknya **Efisiensi Reduksi Sampah (ERS)**, dengan durasi pengamatan dilaporkan terpisah.

### 2.4 Estimasi massa berbasis citra

Pendekatan memperkirakan massa objek dari citra 2D melalui estimasi volume visual dikalikan densitas kelas objek telah diteliti, misalnya *image2mass* (Standley dkk., 2017). Tinjauan sistematis pada ternak juga menunjukkan regresi atas dimensi *bounding box* sebagai pendekatan yang umum dipakai. Penelitian ini **belum menerapkan** pendekatan tersebut (lihat Bagian 6.4), dan penerapannya menjadi agenda lanjutan.

---

## 3. METODE

### 3.1 Waktu dan Lokasi

Penelitian dilaksanakan di **[PERLU DATA: nama/jenis sekolah dan wilayah]** serta laboratorium rekayasa sistem untuk perakitan dan pengujian integrasi, pada periode **[PERLU DATA: tanggal mulai dan berakhir]**.

### 3.2 Alat dan Bahan

**Perangkat keras:**

| Komponen | Fungsi |
|---|---|
| ESP32-Cam (OV2640) | Kamera deteksi visual, penimbangan, tampilan LCD, tombol |
| *Load cell* 10 kg + modul HX711 | Penimbangan bobot sisa makanan |
| ESP8266 (NodeMCU) | Pemantauan bilik maggot |
| DHT (suhu/kelembapan udara), DS18B20 (suhu substrat), MQ-135 (amonia) | Sensor lingkungan bilik maggot |
| LCD I2C 16×2 | Antarmuka petunjuk bagi siswa |
| Unit biokonversi Maggot BSF *self-harvesting* | Penguraian sampah organik |

**Perangkat lunak:**

| Komponen | Teknologi |
|---|---|
| Backend API | Express.js (Node.js) |
| Basis data | Supabase (PostgreSQL) |
| *Broker* MQTT | Mosquitto |
| Inferensi visual | Roboflow (dijalankan **di sisi server**) |
| Layanan prediksi | FastAPI |
| Antarmuka | Next.js |

> **Klarifikasi arsitektur (menjawab kebingungan pada draf sebelumnya):** ThingsBoard **tidak digunakan**. Fungsi pemantauan perangkat dan telemetri diimplementasikan sendiri pada backend melalui modul registri perangkat. Inferensi model berjalan **di server**, bukan pada ESP32-Cam; perangkat hanya menangkap dan mengirimkan citra.

### 3.3 Tahapan Penelitian (ADDIE)

1. **Analysis** — identifikasi kebutuhan operasional petugas dan kebutuhan data SPPG **[PERLU DATA: metode]**.
2. **Design** — perancangan skema perangkat keras, alur komunikasi MQTT, dan struktur basis data.
3. **Development** — pemrograman perangkat, kalibrasi *load cell*, pembangunan API.
4. **Implementation** — pemasangan di lokasi uji coba.
5. **Evaluation** — pengujian fungsional dan pengukuran latensi.

### 3.4 Alur Sistem

```
  ESP32-Cam (kamera + load cell)  ─┐
                                   ├─ MQTT ─► Broker ─► Backend Express ─► Roboflow (inferensi)
  ESP8266 (DHT/DS18B20/MQ-135)   ─┘                        │
                                                           ├─► Supabase (PostgreSQL)
                                                           └─► Layanan prediksi (FastAPI)

  Antarmuka Next.js (dashboard sekolah, SPPG, publik) ──REST──► Backend
```

**[GAMBAR 1: diagram arsitektur — perlu disisipkan sebagai gambar, bukan hanya blok teks]**

### 3.5 Alur Penggunaan Perangkat

Urutan penggunaan unit penimbangan, sesuai perilaku program yang terpasang:

| # | Tindakan pengguna | Perilaku sistem | Tampilan LCD |
|---|---|---|---|
| 1 | Letakkan ompreng di atas timbangan | Menunggu tombol | `Tekan Tombol / Untuk Memfoto` |
| 2 | Tekan tombol | **Tare otomatis** pada titik ini | `Sedang Memfoto / Model v1` |
| 3 | (tunggu ±0,5 detik) | Kamera menangkap citra VGA, mengirim via MQTT | `Sedang Memfoto` |
| 4 | Tuangkan sisa makanan ke bak | Bobot terakumulasi; data dikirim setelah stabil 1,5 detik | `Silahkan Buang / Sisa +x.xxx kg` |
| 5 | — | Backend memanggil Roboflow, membagi bobot per jenis, menyimpan | `Silahkan Tunggu / Proses Data...` |
| 6 | Bersihkan ompreng | Kembali siap | `Selesai! / Terima Kasih` |

**Catatan penting mengenai pengukuran:** karena *tare* dilakukan **saat tombol ditekan**, sisa makanan yang sudah berada di ompreng sebelum tombol ditekan ikut menjadi titik nol dan tidak terhitung. Sistem mengukur **bobot yang dituangkan**, bukan bobot sisa yang berada di ompreng. Konsekuensi metodologis ini dibahas pada Bagian 7.

### 3.6 Protokol Pengujian

**[PERLU DATA: protokol lengkap untuk setiap pengujian — n, pembagian data, prosedur pelabelan ground truth, prosedur kalibrasi load cell, dan parameter biokonversi.]**

### 3.7 Pernyataan Etika Penelitian

Sistem merekam citra ompreng yang berpotensi ditautkan pada identitas siswa (anak di bawah umur) melalui pencatatan transaksi. **[PERLU DATA: status persetujuan sekolah/komite etik, mekanisme persetujuan orang tua/wali, kebijakan retensi dan penghapusan citra, serta kepatuhan terhadap UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.]**

Catatan teknis yang dapat dinyatakan: skema basis data yang dipakai **tidak menyimpan** nama, nomor induk, atau identitas siswa. Yang tersimpan hanya tanggal, kategori makanan, bobot, dan cap waktu. Ini merupakan mitigasi risiko, bukan pengganti persetujuan etik.

---

## 4. HASIL

### 4.1 Sistem yang Terbangun

Sistem MBGCircular berhasil dibangun dan dioperasikan. Seluruh komponen terhubung: perangkat mengirim data melalui MQTT, backend memproses dan menyimpan ke basis data, serta antarmuka menampilkan data bagi tiga peran pengguna (admin sekolah, dapur/SPPG, superadmin) dan satu dashboard publik.

### 4.2 Pengujian Fungsional Rantai Data

Pengujian fungsional menunjukkan rantai data berjalan dari perangkat hingga basis data. Telemetri bilik maggot tercatat secara berkala sesuai periode yang ditetapkan perangkat.

**Tabel 1. Hasil pengujian fungsional rantai data**

| Parameter | Hasil terukur | Kondisi |
|---|---|---|
| Rekaman telemetri tersimpan | 32 baris | periode pengamatan ±17 menit |
| Interval antar-pengiriman | **median 30,0 detik** (min 29,4; maks 95,1; n=31) | periode kirim perangkat ditetapkan 30 detik |
| Rekaman deteksi visual tersimpan | 60 baris (54 bernilai 0 kg; 6 bernilai >0) | 1 tanggal pengamatan |
| Total bobot tercatat | 0,200 kg | — |

Perlu dicatat secara jujur bahwa **54 dari 60 baris deteksi visual bernilai 0 kg**. Nilai nol berasal dari sesi penimbangan yang tidak menghasilkan pembacaan bobot valid, dan pada 32 baris telemetri sensor **tidak tersimpan nilai sensor apa pun**. Kedua hal ini diidentifikasi pada audit data (Bagian 6.3) dan telah ditangani pada versi perangkat lunak selanjutnya melalui validasi yang menolak penyimpanan data tanpa nilai.

### 4.3 Pengukuran Latensi

Pengukuran dilakukan terhadap endpoint sistem yang berjalan, dengan jumlah pengulangan yang dinyatakan.

**Tabel 2. Distribusi latensi (milidetik, n=15 per baris kecuali dinyatakan lain)**

| Tahap | min | median | rata-rata | p95 | maks |
|---|---:|---:|---:|---:|---:|
| Layanan prediksi (`/predict/waste`) | 215,2 | **305,5** | 327,0 | 539,6 | 609,5 |
| Operasi baca basis data | 234,1 | **319,4** | 442,0 | 887,0 | 1.264,1 |
| Rantai telemetri (payload diterima → tersimpan) | — | **298** | — | — | — |

**Catatan kondisi pengukuran:** angka latensi layanan prediksi dan basis data diukur dari jaringan penguji, **bukan dari jaringan lokasi sekolah**, sehingga tidak menggambarkan kondisi lapangan. Pengukuran latensi inferensi Roboflow **belum dapat dilakukan** karena kunci API tidak tersedia saat pengukuran; pengukuran tersebut akan berjalan otomatis melalui instrumen yang kini terpasang pada sistem.

### 4.4 Distribusi Bobot per Kategori

**Tabel 3. Bobot tercatat per kategori (total 0,200 kg, 1 tanggal)**

| Kategori | Bobot (kg) | Proporsi |
|---|---:|---:|
| Sayur | 0,073 | 36,5% |
| Lauk | 0,067 | 33,5% |
| Buah | 0,039 | 19,5% |
| Nasi | 0,021 | 10,5% |

**[PERLU DATA: data ini berasal dari satu tanggal dengan total 0,200 kg dan 90% baris bernilai nol. Tidak boleh disajikan sebagai gambaran pola konsumsi siswa. Diperlukan pengumpulan data multi-hari sebelum tabel ini dapat ditampilkan sebagai hasil.]**

---

## 5. PEMBAHASAN

### 5.1 Sistem Berfungsi Sesuai Rancangan pada Tingkat Fungsional

Hasil pengujian menunjukkan arsitektur yang dirancang dapat dijalankan: perangkat terhubung, data mengalir melalui MQTT, backend memproses, dan basis data menyimpan. Interval telemetri yang terukur (median 30,0 detik) sesuai dengan periode yang ditetapkan perangkat, yang menunjukkan penjadwalan pada sisi perangkat bekerja sebagaimana dirancang.

Namun konsistensi jadwal **tidak sama dengan validitas nilai**. Sebagian besar rekaman tidak memuat nilai sensor yang dapat dipakai. Temuan ini menunjukkan bahwa pengujian fungsional perlu dilengkapi pengujian validitas data, dan bahwa keberhasilan integrasi tidak boleh disamakan dengan keberhasilan pengukuran.

### 5.2 Deteksi Visual Berjalan secara Multikelas

Model yang dipakai menghasilkan **keluaran multikelas**, yaitu jenis makanan spesifik (misalnya `nasi`, `Tahu`, `Ayam_Goreng`, `cap_cai`, `Kelengkeng`), bukan sekadar klasifikasi biner ada/tidak ada sisa makanan. Backend memetakan kelas tersebut ke kategori (nasi, sayur, lauk, buah) dan menghitung distribusi bobot per kategori.

Draf revisi sebelumnya menurunkan klaim ini menjadi deteksi biner karena dianggap tidak sesuai dengan Tabel keluaran sistem. Berdasarkan verifikasi terhadap sistem yang berjalan, **klaim multikelas justru sesuai dengan kapabilitas nyata**, sehingga dipulihkan pada draf ini. Konsekuensinya: akurasi harus dilaporkan **per kelas**, bukan sebagai satu angka tunggal.

**[PERLU DATA: rata-rata keyakinan (confidence) deteksi dan akurasi per kelas. Tanpa ini, klaim multikelas belum dapat dikuantifikasi.]**

### 5.3 Mengapa Akurasi Tunggal Tidak Memadai untuk Kasus Ini

Kutipan pada Bagian 1.1 menyatakan 85–88% siswa menyisakan makanan. Bila proporsi itu berlaku pada data uji, maka model yang **selalu** menjawab "ada sisa makanan" akan memperoleh akurasi sekitar 85–88% tanpa mempelajari apa pun. Karena itu pelaporan akurasi **wajib** disertai *baseline* mayoritas-kelas, matriks konfusi, dan metrik per kelas. Kerangka perhitungannya telah disiapkan agar dapat dijalankan segera setelah data berlabel tersedia.

### 5.4 Catatan Metodologis: Pembagian Berat Berbasis Luas Kotak

Sistem membagi bobot terukur ke setiap jenis makanan secara **proporsional terhadap luas *bounding box***, tanpa memperhitungkan densitas jenis makanan maupun nilai keyakinan model. Pendekatan ini menyiratkan asumsi bahwa seluruh jenis makanan memiliki densitas yang sama per satuan luas citra — asumsi yang tidak sesuai dengan sifat fisik bahan pangan.

Pengukuran terhadap keluaran deteksi nyata menunjukkan besarnya dampak asumsi ini: dibandingkan pembagian yang memperhitungkan densitas, proporsi **nasi berubah +30,3%** dan **sayur berubah −28,4%**. Karena luaran utama sistem adalah peringkat jenis makanan yang paling banyak terbuang untuk evaluasi menu, selisih sebesar ini **berpotensi mengubah peringkat dan rekomendasi** yang diberikan kepada SPPG.

Temuan ini bersifat metodologis dan tidak bergantung pada akurasi model. Penanganan yang diusulkan adalah pembobotan yang memperhitungkan densitas relatif per kelas, dengan parameter yang **dikalibrasi melalui penimbangan acuan** — bukan ditetapkan berdasarkan asumsi. Pendekatan ini belum diaktifkan karena memerlukan data kalibrasi.

### 5.5 Perbandingan dengan Literatur

**[PERLU REFERENSI: bandingkan hasil akurasi deteksi dan efisiensi biokonversi dengan studi sejenis. Tanpa pembanding ini, Bagian 5 tidak dapat menyatakan hasil ini "sejalan" atau "melampaui" penelitian sebelumnya.]**

### 5.6 Interpretasi Alternatif yang Perlu Dipertimbangkan

1. **Akurasi deteksi**: perlu dibandingkan dengan *baseline* mayoritas-kelas sebelum disimpulkan sebagai kinerja model.
2. **Pengurangan bobot pada penguraian**: sebagian penurunan bobot basah dapat berasal dari **kehilangan air (evaporasi)**, bukan semata konversi oleh larva. Pemisahan memerlukan kelompok kontrol tanpa larva.
3. **Perbaikan yang dirasakan petugas**: sebagian dapat berasal dari perhatian ekstra selama masa uji (efek Hawthorne) dan tidak dapat disingkirkan tanpa pembanding sebelum–sesudah.
4. **Bobot yang tercatat**: sistem mengukur bobot yang **dituangkan**, bukan bobot sisa di ompreng. Bila sebagian sisa tidak dituangkan, angkanya lebih rendah dari sisa sebenarnya.

### 5.7 Implikasi Praktis

Kontribusi praktis yang dapat dinyatakan tanpa perlu data tambahan adalah mekanisme **pencatatan kuantitatif otomatis** untuk mendukung kewajiban pelaporan berkala. Pencatatan yang selama ini manual dan tidak terstruktur menjadi terekam dan dapat diekspor. Perlu diklarifikasi bahwa sistem ini berupa **pendukung** pelaporan; kesesuaian format keluaran dengan format resmi yang dipersyaratkan regulasi belum dipetakan.

---

## 6. KETERBATASAN PENELITIAN

1. **Pengujian pada satu lokasi tanpa kelompok pembanding**, sehingga validitas eksternal dan internal terbatas.
2. **Akurasi deteksi belum diukur.** Tidak tersedia data berlabel dengan *ground truth*; karena itu tidak ada angka akurasi yang dilaporkan pada penelitian ini.
3. **Presisi penimbangan belum dikarakterisasi.** Prosedur kalibrasi dengan massa acuan belum dijalankan secara tercatat. Data yang ada justru berada di dekat ambang deteksi sistem (0,02 kg per sesi), dengan 90% baris bernilai nol.
4. **Efisiensi reduksi sampah belum diukur.** Tidak tersedia data bobot awal/akhir substrat (`W₀`/`Wₜ`) maupun data panen. Rentang 81,78–82,29% yang disebut pada Bagian 1 dan 2 adalah **rujukan literatur**, bukan hasil penelitian ini.
5. **Validitas data telemetri terbatas.** Pada rekaman yang tersedia, nilai sensor tidak tersimpan sehingga tidak dapat dipakai untuk analisis lingkungan bilik.
6. **Klasifikasi multikelas belum dikuantifikasi.** Keluaran multikelas tersedia, tetapi akurasi per kelas belum diukur.
7. **Karakterisasi produk sampingan belum dilakukan.** Pupuk/kasgot dan biomassa larva belum diukur (proksimat, N-P-K, rendemen).
8. **Dampak terhadap kapasitas SDM belum diukur** dengan instrumen apa pun.
9. **Bobot yang diukur adalah bobot yang dituangkan**, bukan bobot sisa di ompreng.
10. **Pernyataan etika belum dilengkapi.** Status persetujuan dan kebijakan retensi citra belum ditetapkan.

---

## 7. KESIMPULAN

Penelitian ini menghasilkan prototipe fungsional MBGCircular yang mengintegrasikan deteksi visual sisa makanan, telemetri penimbangan, dan pemantauan bilik maggot dalam satu alur data.

Pengujian fungsional pada **[PERLU DATA: skala pengujian]** menunjukkan rantai data berjalan *end-to-end*, dengan interval telemetri terukur median 30,0 detik (n=31) dan latensi operasi basis data median 319,4 ms (n=15). Model deteksi yang dipakai menghasilkan keluaran multikelas jenis makanan.

Penelitian ini **belum** membuktikan: akurasi deteksi, presisi penimbangan, efisiensi reduksi sampah oleh larva BSF, karakterisasi produk sampingan, maupun dampak terhadap kapasitas SDM. Klaim-klaim tersebut memerlukan pengujian lanjutan dengan desain terkontrol dan instrumen pengukuran yang lengkap.

Kontribusi utama penelitian ini terletak pada **rancangan arsitektur dan verifikasi fungsional** sistem terintegrasi berbiaya rendah, serta **catatan metodologis** bahwa pembagian bobot berbasis luas kotak pembatas mengabaikan densitas jenis makanan dan berpotensi mengubah peringkat jenis makanan terbuang — temuan yang perlu ditangani sebelum luaran analitis sistem dipakai sebagai dasar evaluasi menu.

---

## PERNYATAAN

**Kontribusi penulis [PERLU DATA: rincian kontribusi tiap penulis].**

**Pendanaan [PERLU DATA: sumber pendanaan, atau nyatakan tidak ada].**

**Konflik kepentingan [PERLU DATA: nyatakan ada/tidak ada, termasuk hubungan dengan penyedia unit biokonversi atau perangkat AIoT].**

**Ketersediaan data.** Data mentah telemetri dan deteksi tersimpan pada basis data penelitian. **[PERLU DATA: nyatakan apakah data dapat diakses dan dengan mekanisme apa.]**

---

## DAFTAR PUSTAKA

**[PERLU REFERENSI: seluruh entri berikut harus dilengkapi penulis sesuai gaya sitasi jurnal tujuan. Draf ini TIDAK mencantumkan detail bibliografi karena tidak dapat diverifikasi dari sisi penulis — mencantumkannya berisiko menghasilkan sitasi yang salah.]**

Sumber yang dikutip dalam teks dan wajib dilengkapi:

1. Badan Gizi Nasional. (2025, 14 Agustus). *[judul dan jenis dokumen]*.
2. Peraturan Badan Gizi Nasional Nomor 1 Tahun 2026 tentang Sisa Pangan, Sampah, dan Air Limbah Domestik Program Makan Bergizi Gratis. **[lengkapi nomor pasal yang relevan]**
3. Bappenas. (2021). *[judul laporan]*.
4. Studi FISIP UI. (2025). *[judul dan penulis]*.
5. Akmal. (2024). *[judul]* — sumber rentang 81,78–82,29%.
6. Standley, T., dkk. (2017). *image2mass: Estimating the Mass of an Object from Its Image.* ICML.
7. *[Referensi Tinjauan Pustaka Bagian 2.1–2.4]*
