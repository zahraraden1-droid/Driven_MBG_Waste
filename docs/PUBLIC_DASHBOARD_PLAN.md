# Rencana Dashboard Publik & Dashboard Operasional

**Konteks:** ThingsBoard **tidak dipakai** pada sistem ini. Fungsinya (monitoring perangkat, telemetri, status online, kontrol) sudah dipindahkan ke dashboard sendiri melalui `backend/src/config/deviceRegistry.js` dan halaman `/admin-sekolah/perangkat`. Dokumen ini merencanakan pengembangan dashboard selanjutnya, dibagi tegas antara **publik** dan **operasional**.

**Referensi bukti:** `docs/AUDIT_INTEGRITAS_DATA.md`, `docs/LAPORAN_PENGUKURAN_PAPER.md`

---

## 1. Kondisi saat ini (terverifikasi dari kode)

### 1.1 Yang sudah ada

| Bagian | Implementasi | Lokasi |
|---|---|---|
| Landing page publik | 1 halaman, memuat 3 KPI, grafik kategori, kartu edukasi | `frontend/app/page.js` |
| Endpoint publik | `/public/kpi`, `/public/waste-by-category`, `/public/education` | `backend/src/routes/public.js:8,18,36` |
| Dashboard superadmin | Ringkasan KPI + toggle mode demo | `frontend/app/superadmin/page.js` |
| Dashboard admin sekolah | Monitoring sensor, prediksi AI, penjualan, batch, perangkat | `frontend/app/admin-sekolah/*` |
| Dashboard SPPG (dapur) | Korelasi menu AI, efisiensi, unduh laporan CSV | `frontend/app/dapur-mbg/*` |
| Monitoring perangkat | Status online/offline, kalibrasi, kontrol perintah | `DeviceStatusPanel`, `DeviceControlPanel` |

### 1.2 Yang belum ada

| Kebutuhan | Status | Dampak |
|---|---|---|
| Ranking persentase sisa **per kategori** untuk publik | **belum** | Nilai transparansi yang dijanjikan paper belum terekspos |
| Tren harian/mingguan publik | **belum** | Tidak ada gambaran waktu |
| Indikator cakupan data (n, rentang tanggal) | **belum** | Pembaca tidak tahu seberapa besar data di balik angka |
| Indikator kualitas/kesegaran data | **belum** | Angka basi atau hasil simulasi tidak dapat dibedakan pembaca |
| Halaman status sistem | **belum** | Tidak ada transparansi ihwal perangkat hidup/mati |
| Rekap kepatuhan untuk SPPG | **belum** | Janji regulatif (BGN No. 1/2026) belum terwujud di UI |
| Halaman privasi | **belum** | Relevan dengan UU PDP No. 27/2022 |

---

## 2. Prinsip pemisahan publik vs operasional

Ini prinsip yang harus dipegang, karena kesalahan di sini berisiko hukum dan reputasi.

| Data | Publik? | Alasan |
|---|---|---|
| Total berat limbah terolah (agregat) | ✅ | Tidak sensitif; justru inti transparansi |
| Persentase sisa per **kategori** | ✅ | Agregat, tidak menunjuk individu |
| Tren harian/mingguan | ✅ | Agregat |
| Jumlah transaksi & rentang tanggal | ✅ | Justru **wajib** agar angka dapat ditafsirkan |
| Status perangkat (hidup/mati) | ✅ | Informasi operasional umum |
| Foto ompreng / foto sisa makanan | ❌ | **Berpotensi memuat identitas siswa** |
| Nama siswa, NIS, kelas | ❌ | Data pribadi anak di bawah umur |
| ID transaksi yang dapat ditelusuri ke siswa | ❌ | Tidak pernah ke endpoint publik |
| Ranking penjualan, biaya, harga | ❌ | Data komersial |
| Detail konfigurasi perangkat & kalibrasi | ❌ | Dapat dipakai menyusun serangan |
| Kata sandi, token, kunci API | ❌ | Sudah jelas |

> **Catatan audit:** pada skema database saat ini **tidak ditemukan PII siswa** (nama/NIS) — tabel hanya memuat agregat kategori, bobot, dan cap waktu. Ini mitigasi yang baik dan dapat dinyatakan di paper. **Namun** bucket `menu-foto` bersifat publik; pastikan hanya foto menu yang masuk ke sana, tidak pernah foto ompreng siswa.

---

## 3. Rancangan endpoint publik

Semua agregasi dilakukan **di sisi server**. Endpoint tidak boleh mengirim ribuan baris mentah ke browser.

| Endpoint | Isi | Sumber agregasi | Catatan |
|---|---|---|---|
| `GET /api/public/kpi` | KPI utama + `cakupanData` | RPC `get_public_kpi()` (sudah diperbarui memfilter `is_simulated=false` dan `berat_kg>0`) | Sudah menyertakan cakupan data |
| `GET /api/public/waste-by-category` | Berat + **persentase** per kategori | **Perlu diperbaiki**: saat ini mengambil semua baris lalu mengelompokkan di Node | Pindahkan ke SQL |
| `GET /api/public/tren` | Tren harian/mingguan | RPC baru | Belum ada |
| `GET /api/public/peringkat-menu` | Ranking kategori (% sisa) | RPC baru | Inti nilai untuk SPPG |
| `GET /api/public/status-sistem` | Status perangkat, kesegaran data terakhir | `deviceRegistry` (hanya field aman) | Jangan bocorkan kalibrasi/kredensial |
| `GET /api/public/kualitas-data` | n, rentang tanggal, jumlah hari, apakah ada data simulasi | RPC baru | **Pembeda kredibilitas** |

### 3.1 Perbaikan yang diperlukan pada endpoint yang sudah ada

`backend/src/routes/public.js:18-34` saat ini:

```js
const { data, error } = await supabase
  .from('waste_records')
  .select('kategori, berat_kg')   // mengambil SELURUH tabel
```

Masalah: untuk data satu tahun, ini memindahkan puluhan ribu baris ke memori Node hanya untuk menjumlahkan. Harus diganti agregasi SQL. Rancangan:

```sql
create or replace function get_public_waste_by_category()
returns table (kategori text, berat_kg numeric, persentase numeric, jumlah_transaksi bigint)
language sql stable as $$
  with dasar as (
    select kategori, sum(berat_kg) as berat_kg, count(*) as jumlah_transaksi
    from waste_records
    where is_simulated = false and berat_kg > 0
    group by kategori
  ), total as (select sum(berat_kg) as t from dasar)
  select
    d.kategori,
    round(d.berat_kg, 3),
    round((d.berat_kg / nullif(t.t, 0)) * 100, 1) as persentase,
    d.jumlah_transaksi
  from dasar d, total t
  order by d.berat_kg desc;
$$;
```

Keuntungan tambahan: bila difilter `is_simulated=false` dan `berat_kg>0`, kategori dengan berat nol tidak lagi muncul di grafik — memperbaiki masalah "grafik penuh kategori bernilai nol" yang ditemukan pada audit.

---

## 4. Rancangan halaman

### 4.1 Halaman publik (tidak perlu login)

**Struktur yang disarankan:**

```
/                    Landing: misi, KPI utama, grafik kategori, edukasi
/publik/dampak       Dampak lingkungan & operasional (tren, total, konversi)
/publik/peringkat    Ranking jenis makanan paling banyak tersisa
/publik/transparansi Kualitas & cakupan data + status sistem
/publik/privasi      Kebijakan privasi & tata kelola citra
```

**Komponen wajib di setiap halaman publik — kartu cakupan data:**

```
┌──────────────────────────────────────────────────┐
│  Cakupan data                                    │
│  Periode       : 19 Sep 2026 – 19 Sep 2026       │
│  Transaksi     : 6 sesi penimbangan bermakna     │
│  Hari observasi: 1                               │
│  Status        : ⚠ Data simulasi pernah terdeteksi│
│                  dan telah dikecualikan           │
└──────────────────────────────────────────────────┘
```

Mengapa ini penting: audit menemukan bahwa angka KPI saat ini (**0,2 kg**) berasal dari data yang 90% bernilai nol dan hanya mencakup **1 hari**. Menampilkan cakupan data secara terbuka:
- mencegah pembaca menyimpulkan lebih dari yang didukung data;
- **memperkuat** kredibilitas, karena sistem tidak menyembunyikan keterbatasan;
- selaras dengan semangat dokumen revisi paper yang menuntut kejujuran data.

**Aturan tampilan yang harus dipatuhi:**
1. Jangan menampilkan angka bila `n = 0`; tampilkan "belum ada data".
2. Bila `n < ambang` (mis. 30), tampilkan penanda "data awal, belum mewakili".
3. Jangan **pernah** menampilkan persentase akurasi model sampai ada pengukuran resmi (lihat `docs/VALIDASI_PENGUJIAN.md`).
4. Tampilkan tanggal pembaruan terakhir.
5. Grafik kosong harus punya pesan, bukan ruang kosong.

### 4.2 Dashboard operasional (perlu login)

Yang perlu ditambahkan/diperbaiki:

| Prioritas | Item | Alasan |
|---|---|---|
| Tinggi | **Peringatan otomatis** saat perangkat offline > ambang, atau inferensi gagal berulang | Saat ini tidak ada alerting sama sekali |
| Tinggi | **Indikator mode data** (nyata/simulasi) yang mencolok bagi operator | Mencegah operator salah menafsirkan data simulasi sebagai nyata |
| Tinggi | **Rekap kesegaran data** per jalur (terakhir kirim, jumlah kegagalan) | Audit menemukan 32 baris telemetri tanpa nilai, dan hal itu tidak terlihat di UI |
| Sedang | Ekspor laporan dengan periode yang dapat dipilih | Saat ini `/reports/csv` mengekspor seluruh tabel |
| Sedang | Riwayat perintah perangkat (siapa, kapan, hasil) | Audit trail tindakan operator belum ada |
| Sedang | Halaman pemetaan format pelaporan BGN | Janji regulatif paper |
| Rendah | Mode gelap, peningkatan aksesibilitas | Lihat §6 |

---

## 5. Rencana teknis bertahap

| Tahap | Pekerjaan | Dependensi | Perkiraan |
|---|---|---|---|
| 1 | RPC agregasi SQL (`get_public_waste_by_category`, `get_public_tren`, `get_public_kualitas_data`) | Migrasi provenance sudah dijalankan | 1-2 hari |
| 2 | Perbaiki `/public/waste-by-category` agar memakai RPC, sertakan persentase | Tahap 1 | 0,5 hari |
| 3 | Halaman `/publik/peringkat` + kartu cakupan data | Tahap 2 | 2 hari |
| 4 | Halaman `/publik/transparansi` (kualitas data + status sistem) | Tahap 3 | 1-2 hari |
| 5 | Endpoint `status-sistem` dengan filter field aman | — | 0,5 hari |
| 6 | Halaman `/publik/privasi` | Perlu keputusan kebijakan retensi | 0,5 hari |
| 7 | Alerting perangkat offline & inferensi gagal | Observability (Fase 3) | 2 hari |
| 8 | Ekspor laporan berperiode + pemetaan format BGN | — | 2-3 hari |

**Rollback:** seluruh halaman bersifat aditif (route baru), sehingga rollback = hapus route. Perubahan RPC bersifat aditif dengan `create or replace`; versi lama dapat dikembalikan.

---

## 6. Aksesibilitas dan kualitas tampilan

Temuan dari audit frontend yang relevan untuk halaman baru:

| Isu | Perbaikan |
|---|---|
| `@import` Google Fonts di CSS memblokir render dan menghubungi pihak ketiga | Ganti ke `next/font` |
| Banyak input tanpa `<label>` yang terhubung | Tambahkan `<label htmlFor>` atau `aria-label` |
| Status disampaikan hanya lewat warna (hijau/merah) | Tambahkan teks/ikon; jangan bergantung pada warna saja (WCAG 1.4.1) |
| Tabel tanpa `<caption>`/`<th scope>` | Tambahkan agar terbaca pembaca layar |
| Polling 3 detik dari dua komponen sekaligus pada endpoint `/devices` | Satukan poller; berhenti saat tab tidak aktif (`visibilitychange`) |
| Tidak ada penanganan error di tingkat halaman (`error.js`) | Tambahkan `error.js` dan `loading.js` |

---

## 7. Kriteria penerimaan

- [ ] Tidak ada endpoint publik yang mengembalikan foto, identitas siswa, atau data komersial.
- [ ] Setiap halaman publik menampilkan cakupan data (`n` + rentang tanggal).
- [ ] Tidak ada angka akurasi model ditampilkan sebelum ada pengukuran resmi.
- [ ] Grafik menampilkan pesan yang jelas saat data kosong.
- [ ] Agregasi berjalan di SQL; tidak ada endpoint publik yang memuat seluruh tabel ke memori.
- [ ] Data `is_simulated=true` tidak pernah muncul di halaman publik.
- [ ] Halaman privasi tersedia dan memuat kebijakan retensi citra.
- [ ] Uji tampilan pada lebar layar ponsel (mayoritas pengguna lapangan).

---

*Rencana ini belum diimplementasikan. Perubahan pada endpoint publik yang sudah ada (`/public/waste-by-category`) perlu disertai pengujian bahwa angka yang tampil tetap konsisten dengan `get_public_kpi()`.*
