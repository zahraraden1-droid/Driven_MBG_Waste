# Panduan Product Manager / Paper — SPPG MBG (SFT 2026)

Dokumen untuk PM & penulis paper (proposal): memahami nilai produk, peta fitur aktual vs rencana,
hal yang harus ditulis/diperbarui di dokumen lomba, dan **checklist kesesuaian** sebelum submit.

---

## 1. Identitas produk

- **Nama proyek:** SPPG MBG — **Smart Sisa Pangan & Maggot BSF** (Smart Container + Maggot Chamber + Dashboard).
- **Tim:** "Becanda ya", SMK Negeri 1 Jakarta (SFT 2026).
- **Masalah:** sisa makanan siswa di sekolah (MBG) sering terbuang tanpa data; limbah tidak terolah.
- **Solusi:**
  1. **Smart Container** — siswa menaruh/membuang sisa di ompreng; ESP32-CAM foto + Load Cell timbang,
     AI klasifikasi kategori, data tersimpan otomatis.
  2. **Maggot Chamber** — biokonversi sisa jadi maggot BSF; ESP8266 pantau 5 sensor (suhu/kelembaban/amonia/
     substrat/berat panen) dengan peringatan dini.
  3. **Dashboard SPPG** — analisis % makanan yang paling tidak disukai siswa → umpan balik ke dapur;
     admin sekolah mengelola batch telur & penjualan maggot (ekonomi sirkular).

---

## 2. Diagram alur nilai

```
Siswa membuang sisa → Smart Container (foto + berat + AI kategori)
        │
        ▼
  Waste Records (DB) ──► Dashboard SPPG: ranking menu tidak disukai (% sisa)
        │
        ▼
  Maggot Chamber (biokonversi, sensor aman)
        │
        ▼
  Panen maggot → jual segar/kering → pendapatan sekolah (sales_records)
```

**Terminal benefit yang diangkat di paper:** pengurangan sampah, pakan protein lokal, penghematan CO₂e,
dan transparansi data untuk perbaikan kebijakan menu.

---

## 3. Teknologi (yang sedang berjalan)

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 16 (App Router), Tailwind, recharts |
| Backend | Express.js, JWT, multer, node-cron (terpasang), Roboflow client, MQTT client |
| Database | Supabase PostgreSQL (RLS) + Storage bucket `menu-foto` |
| Transport IoT | MQTT (utama) + REST fallback |
| Device | ESP32-CAM (foto + Load Cell + LCD), ESP8266 NodeMCU (DHT22, MQ-135, DS18B20, HX711) |
| AI | Roboflow object detection (foto sisa) + AI lokal :8000 (prediksi) + rule-based evaluasi sensor |

README proyek + `supabase/schema.sql` + dokumen di `docs/` adalah sumber kebenaran teknis terbaru.

---

## 4. Peta fitur: RENCANA (plan) vs STATUS

Kode status: ✅ sudah sesuai / 🚧 sebagian / ❌ belum.

| Fitur dari rencana | Status | Catatan untuk PM |
|--------------------|--------|------------------|
| Frontend fungsional dashboard admin (batch, sensor, panen, promo) | ✅ | Satu dashboard, tanpa styling mewah (sesuai arahan fungsional) |
| Banner peringatan `perluPesanTelurBaru` | ✅ | Muncul jika umur batch ≥ 15 hari / berat wadah atas naik |
| Mode pemeliharaan toggle | ✅ | SIMPAN status via MQTT retained `mbg/maintenance` |
| Monitoring 5 sensor + `aman`/`rekomendasi` | ✅ | Rekomendasi hanya tampil jika anomali (bersih saat aman) |
| Analisis sisa SPPG tanpa rekomendasi subjektif | ✅ | Ranking + bar %, total kg |
| Backend Express lengkap + route IoT | ✅ | REST + MQTT dual transport |
| Schema Supabase (maggot_batches baru + RLS) | ✅ | Perlu migrasi jika DB lama sudah dibuat |
| Roboflow key & model | 🚧 | Key/model belum diisi — pakai fallback mock; AI dev harus isi |
| AI lokal `:8000` (predict & menu-correlation) | 🚧 | Belum ada service; prediksi masih demo |
| Firmware ESP (kedua) | ✅ | Kode lengkap; belum diuji flash di hardware |
| Dashboard superadmin & laporan lengkap | 🚧 | Perlu cek kesesuaian kebutuhan lomba di `app/superadmin` & `dapur-mbg/laporan` |

---

## 5. Hal yang harus ditulis / diperbarui di paper

1. **Masalah & data pendukung** — kutip data kantin/siswa (volume sisa, kategori dominan). Ini
   memperkuat kebutuhan dashboard.
2. **Arsitektur** — gunakan diagram alur pada bagian 2 + skema topic MQTT (`docs/WIRING_PINOUT.md`).
3. **Profit/ekonomi** — hitung model: `biaya telur per batch` vs `harga jual maggot segar/kering`
   (data sementara di `SalesManager`, demo `salesRecords`). Buat BEP sederhana.
4. **Metrik dampak** — `totalLimbahTerolahKg`, `totalPanenMaggotKg`, `penghematanEmisiCo2e`
   (×0,52 per kg limbah) sudah dihitung di `get_public_kpi`.
5. **Timeline & demo** — siapkan skenario demo lomba (lihat bagian 7).
6. **Catatan pembeda:** REST + MQTT hybrid, AI klasifikasi berbasis foto nyata ompreng, mode
   pemeliharaan yang melibatkan inspeksi harian petugas.

---

## 6. Checklist kesesuaian produk (PM verifikasi sebelum submit)

**A. Kesiapan demo end-to-end**
- [ ] Browser: halaman `/` publik tampil; login demo berhasil.
- [ ] Admin: toggle maintenance, buat batch, tombol panen, kartu sensor berisi 5 angka.
- [ ] SPPG: ranking menu (%) tampil dan berubah jika ada data baru.
- [ ] Backend `npm run dev` + `health` OK; log MQTT terhubung (atau REST fallback aktif).
- [ ] Perangkat ter-simulasi: terima hasil `smart-container/result` dan `maggot-chamber/result`.

**B. Kesesuaian data & kebijakan**
- [ ] `sensor_readings` punya `suhu_substrat_c` dan `batch_id`.
- [ ] `maggot_batches` memakai kolom `batch_kode`, `berat_telur_gram`, `biaya_beli`, `status`.
- [ ] RLS aktif untuk semua tabel data (termasuk `maggot_batches`).
- [ ] Tidak ada teks rekomendasi otomatis di halaman SPPG (kebijakan produk).

**C. Materi lomba**
- [ ] Paper mencantumkan arsitektur, skema, model ekonomi, dan metrik dampak.
- [ ] Surat orisinalitas & talent agreement direview (file PDF di folder lomba).
- [ ] Demo script lengkap (bagian 7), termasuk skenario gagal-aman (broker mati → REST fallback).

---

## 7. Saran skrip demo (2–3 menit)

1. **Landing** — tunjukkan KPI dampak (limbah terolah, panen, CO₂e).
2. **Smart container** — idle → taruh ompreng → "Sedang Memfoto" → buang → "Proses Data…" → "Selesai!"
   (log LCD). Tunjukkan deteksi kategori + kg masuk ke DB.
3. **SPPG dashboard** — buka ranking; tandai "47% sayur terbuang → rekomendasi menu untuk dapur".
4. **Maggot chamber** — buka kartu 5 sensor; naikkan amonia simulasi → muncul peringatan + saran dedak.
5. **Batch & ekonomi** — buat batch baru; tampilkan banner "PERINGATAN SIKLUS"; buka manajemen penjualan.

---

## 8. Kriteria "berhasil" (definition of done)

- Semua checklist bagian 6 hijau.
- Data demo tersedia untuk dibawakan di pameran tanpa bergantung internet (mode demo).
- Skema DB bisa dipakai project baru dengan sekali eksekusi `supabase/schema.sql` + seed.
- Firmware sudah di-flash & terhubung ke broker yang dipilih di lokasi lomba.