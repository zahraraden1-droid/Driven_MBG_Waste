# Laporan Audit Paper — MBGCircular

**Objek audit:** (1) Draf asli `AIOT DRIVEN MBG WASTE.txt`; (2) `DOKUMEN REVISI PAPER AIoT.txt`; (3) seluruh sistem yang berjalan (kode, basis data produksi, firmware) sebagai sumber verifikasi klaim.
**Tanggal audit:** 20 September 2026
**Metode:** penilaian tiap bagian terhadap standar artikel ilmiah; setiap klaim yang dapat diuji diverifikasi langsung ke kode/database.
**Dokumen hasil:** `PAPER_MBGCircular_DRAF_FINAL.md`, `DAFTAR_PERBAIKAN_DAN_DATA_HILANG.md`

---

## A. Ringkasan Eksekutif

### A.1 Penilaian umum

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

### A.2 Tiga temuan terpenting

**Temuan 1 — Draf revisi justru melemahkan paper tanpa perlu.** Dokumen revisi menetapkan AI hanya "deteksi biner True/False" dan menyatakan analitik jenis makanan "belum diimplementasikan". Verifikasi terhadap sistem yang berjalan menunjukkan **kebalikannya**: model mengeluarkan kelas spesifik (`nasi`, `Tahu`, `Ayam_Goreng`, `cap_cai`, `Kelengkeng`), backend memetakan ke kategori, dan antarmuka menampilkan peringkat. Revisi ini diperbaiki dengan **memulihkan klaim multikelas**, disertai syarat pelaporan metrik per kelas.

**Temuan 2 — Angka 92%, <1%, <2 detik, dan WRI 81,78–82,29% tidak memiliki bukti tersimpan.** Tidak ada log akurasi, tidak ada prosedur kalibrasi terekam, tidak ada instrumentasi durasi saat pengukuran (kini sudah dipasang), dan `maggot_harvests` berisi **0 baris**. Keempatnya dihapus dari posisi klaim hasil.

**Temuan 3 — Data yang tersimpan tidak dapat menopang klaim kinerja.** Audit basis data produksi menemukan: 54 dari 60 baris deteksi bernilai **0 kg**, total seluruh korpus **0,200 kg**, dan **32 dari 32** baris telemetri tidak memuat satu pun nilai sensor. Sebagian besar angka pada tabel kinerja tidak dapat dihitung dari data ini.

---

## B. Audit per Bagian

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

## C. Audit Klaim (verifikasi terhadap sistem nyata)

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

## D. Audit Integritas Data

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

## E. Audit Konsistensi Internal

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

## F. Audit Etika & Kepatuhan

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

## G. Audit Format & Kesiapan Submit

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

## H. Kekuatan Paper (agar penilaian berimbang)

1. **Masalah nyata dan relevan** dengan kebijakan nasional, dengan dasar regulasi yang dapat dilacak keberadaannya.
2. **Integrasi tiga pilar** (deteksi visual, telemetri penimbangan, pemantauan biokonversi) merupakan kebaruan yang wajar dan bukan sekadar penambahan sensor.
3. **Perangkat keras berbiaya rendah** menjadikan sistem dapat direplikasi sekolah lain — kontribusi praktis yang dapat diverifikasi dari daftar komponen.
4. **Arsitektur benar-benar terbangun dan berjalan**, bukan sekadar rancangan di atas kertas. Ini keunggulan yang tidak dimiliki banyak paper perancangan.
5. **Draf revisi sudah menunjukkan kesediaan mengakui keterbatasan** — modal penting menghadapi reviewer.
6. **Temuan metodologis pada Bagian 5.4** (pembagian bobot mengabaikan densitas) adalah kontribusi nyata hasil audit, bukan sekadar kritik.

---

## I. Kesimpulan Audit

Paper ini **belum siap submit**, tetapi **dapat disiapkan** dengan dua jalur:

**Jalur cepat (system design & feasibility).** Fokuskan paper pada rancangan dan verifikasi fungsional — yang memang sudah terbukti. Hapus seluruh klaim kinerja biologis dan kuantitatif. Lengkapi tinjauan pustaka, daftar pustaka, etika, dan protokol. Nilai: jujur, dapat dipertahankan, kontribusi jelas.

**Jalur kuat (tambahkan data minimum).** Jalur cepat + dua pengukuran tambahan: (a) eksperimen maggot terkontrol 3 wadah dengan kelompok tanpa larva, 24–48 jam; (b) minimal 150 foto berlabel untuk akurasi per kelas. Nilai: jauh lebih kuat, tetapi memerlukan waktu lapangan.

Risiko terbesar bila tetap disubmit dalam kondisi sekarang adalah **klaim biologis tanpa data** — ini jenis temuan yang paling mudah dikenali reviewer dan paling sulit dipertahankan.
