# Panduan Frontend Developer — SPPG MBG

Dokumen ini menjelaskan status web frontend (Next.js App Router + Tailwind), apa saja yang sudah
terintegerasi, apa yang masih harus dikembangkan, dan **checklist verifikasi** agar kamu bisa
mengecek sendiri apakah semua sudah sesuai rencana atau belum.

---

## 1. Ringkasan arsitektur

```
frontend/
├── app/
│   ├── page.js                  (landing publik: KPI + WasteChart + EducationCard)
│   ├── login/page.js            (login)
│   ├── admin-sekolah/           (halaman admin sekolah + layout + sub-halaman menu/)
│   ├── dapur-mbg/               (halaman SPPG + laporan/)
│   └── superadmin/              (halaman superadmin)
├── components/                  (komponen reusable)
├── context/                     (AuthContext, DemoModeContext)
└── lib/api.js                   (wrapper fetch ke backend)
```

- **Framework:** Next.js 16 (App Router), React 18, Tailwind CSS 3, recharts.
- **Komunikasi data:** semua lewat REST ke `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`).
  Frontend TIDAK terhubung langsung ke MQTT; data MQTT masuk lewat endpoint backend lalu ditampilkan.
- **Auth:** token JWT disimpan di `localStorage` (`sppg_token`), dikirim via header `Authorization: Bearer`.

---

## 2. Yang sudah terintegrasi (status: SUDAH)

| Fitur | Komponen / Endpoint | Status |
|-------|---------------------|--------|
| Dashboard admin sekolah | `app/admin-sekolah/page.js` | ✅ |
| Mode pemeliharaan (toggle) | `components/MaintenanceModeToggle.js` → `GET/POST /api/iot/maintenance-mode` | ✅ |
| Manajemen batch telur (banner peringatan + form + tabel + tombol panen) | `components/BatchManager.js` → `/api/admin-sekolah/batches` & `/status-siklus` | ✅ |
| Monitoring 5 sensor + status aman/rekomendasi | `components/SensorMonitor.js` → `/api/admin-sekolah/monitoring` | ✅ |
| Panel prediksi AI | `components/AiPredictionPanel.js` → `/api/admin-sekolah/prediksi` | ✅ |
| Manajemen penjualan maggot | `components/SalesManager.js` → `/api/admin-sekolah/penjualan` | ✅ |
| Input menu MBG + upload foto | `components/MenuUploadForm.js` (sub-halaman `admin-sekolah/menu`) | ✅ |
| Dashboard SPPG (peringkat sisa makanan + bar %) | `app/dapur-mbg/page.js` + `components/AiCorrelationTable.js` → `/api/dapur-mbg/analisis-sisa` | ✅ |
| Grafik efisiensi limbah | `components/EfficiencyChart.js` → `/api/dapur-mbg/efisiensi` | ✅ |
| Download laporan CSV | `components/ReportDownload.js` (sub-halaman `dapur-mbg/laporan`) | ✅ |
| Landing publik KPI | `app/page.js` + `components/KpiCard.js`, `WasteChart.js`, `EducationCard.js` | ✅ |
| Route guard + role | `components/RouteGuard.js` dengan `AuthContext` | ✅ |

> `components/AiCorrelationTable.js` sekarang menampilkan **tabel peringkat + bar persentase tanpa teks
> rekomendasi** (sesuai rencana). Jangan kembalikan kolom rekomendasi otomatis ke halaman ini.

---

## 3. Yang harus dikembangkan / diperbarui berikutnya

1. **Auto-refresh data real-time.**
   - `SensorMonitor`, `BatchManager`, dan `AiCorrelationTable` saat ini fetch sekali saat mount.
   - Tambahkan `setInterval` polling ringan (mis. tiap 10–15 detik) agar grafik sensor mengikuti
     data dari ESP yang mengirim tiap 30 detik. Beri cleanup interval saat komponen unmount.
2. **State loading & error per komponen** — tampilkan `skeleton`/`null` state bersih, bukan hanya `alert()`.
3. **Responsive & aksesibilitas** — beberapa form masih `grid-cols-4` di mobile; rapikan stacking.
4. **Superadmin dan laporan lanjutan** — cek kesesuaian `app/superadmin/page.js` dan
   `app/dapur-mbg/laporan/page.js` dengan kebutuhan demo.
5. **Konfigurasi produksi** — ganti `NEXT_PUBLIC_API_URL` dan Supabase anon key ke nilai produksi di
   `.env.local`, lalu build staging.

---

## 4. Variabel lingkungan (frontend)

`.env.local` di folder `frontend`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 5. Checklist verifikasi (coret jika sudah sesuai)

**A. Menjalankan & memeriksa halaman**

- [ ] `cd frontend && npm install && npm run dev` berjalan tanpa error build.
- [ ] Landing `/` menampilkan KPI publik tanpa error.
- [ ] Login demo berhasil: `admin@demo.local / demo123` (mode demo) atau akun dari Supabase (mode nyata).

**B. Dashboard admin sekolah (`/admin-sekolah`)**

- [ ] Tombol **Aktifkan/Nonaktifkan Mode Pemeliharaan** tampil dan memanggil `api.post('/iot/maintenance-mode', { aktif })`.
- [ ] **Banner peringatan siklus** muncul jika respons `/admin-sekolah/batches/status-siklus` memberi `peringatan.perluPesanTelurBaru: true`.
- [ ] Form batch baru (kode, tanggal, berat gram, biaya Rp, catatan) bisa menyimpan lalu tabel segar kembali.
- [ ] Tabel batch menampilkan: Kode Batch, Tanggal Masuk, Umur (hari), Fase, Berat Telur, Status, Aksi.
- [ ] Tombol "Selesai panen" memanggil `PUT /admin-sekolah/batches/:id/panen` dan status berubah.
- [ ] `SensorMonitor` menampilkan **5 kartu**: suhu bilik, kelembaban, amonia, suhu substrat, berat maggot panen.
- [ ] Label "Kondisi bilik: aman / perlu perhatian" muncul dari `data.aman`.
- [ ] Teks rekomendasi hanya muncul jika `data.rekomendasi !== null` (jangan tampilkan rekomendasi saat aman).

**C. Dashboard SPPG (`/dapur-mbg`)**

- [ ] Tabel peringkat berisi: Peringkat, Nama Menu/Kategori, Total Kg Terbuang, Persentase Sisa.
- [ ] Bar persentase memakai `beratKg`/`persentase` dari `/api/dapur-mbg/analisis-sisa`.
- [ ] Tidak ada teks rekomendasi otomatis di halaman ini.

**D. Konsistensi API helper (`lib/api.js`)**

- [ ] `api.get`, `api.post`, `api.put`, `api.postForm` dipakai sesuai kebutuhan; `put` khusus untuk `/batches/:id/panen`.

---

## 6. Catatan penting

- Jangan hardcode endpoint; selalu lewat `lib/api.js` supaya token JWT otomatis terpasang.
- Desain memakai utility custom di `styles/globals.css`: `hairline`, `pill`, `bg-surface`, `text-primarylight`,
  `bg-alert`, `bg-primary`. Ikuti pola komponen yang sudah ada.
- Data MQTT/ESP masuk ke backend dulu, jadi jika data kosong saat demo periksa backend dulu, bukan frontend.