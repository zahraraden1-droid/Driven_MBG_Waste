# Panduan AI Developer — SPPG MBG

Dokumen ini menjelaskan bagian-bagian kecerdasan buatan di proyek: **deteksi foto sisa makanan
(Roboflow)**, **evaluasi kondisi bilik maggot**, dan **layanan AI lokal** (prediksi limbah &
korelasi menu). Termasuk apa yang harus kamu kembangkan dan **checklist verifikasi**.

---

## 1. Ada 3 "AI" dalam sistem

| Modul | File | Tugas | Input → Output |
|-------|------|-------|----------------|
| Deteksi foto sisa makanan | `backend/src/services/roboflowService.js` | Klasifikasi/deteksi obyek di foto ompreng → kategori + estimasi berat | Foto JPEG + total kg → `deteksi[]` |
| Evaluasi kondisi bilik | `backend/src/services/sensorEvaluationService.js` | Aturan ambang batas → status aman / rekomendasi | 4 angka sensor → `{aman, rekomendasi}` |
| Prediksi & korelasi | `backend/src/services/aiService.js` → AI lokal port 8000 | Prediksi volume limbah & jadwal panen, korelasi menu | riwayat → prediksi/peringkat |

---

## 2. Deteksi foto sisa makanan (Roboflow) — `roboflowService.js`

### 2.1 Cara kerja
1. Backend menerima **byte JPEG** (via MQTT `…/smart-container/foto` atau REST `POST /api/iot/smart-container`).
2. `detectFoodWaste(imageBuffer, totalWeightKg)` POST ke:
   ```
   https://detect.roboflow.com/{ROBOFLOW_MODEL}/{ROBOFLOW_VERSION}?api_key={ROBOFLOW_API_KEY}
   ```
   body = multipart `/` field `file` (JPEG). (Fungsi ini mengirim langsung byte buffer.)
3. Respons Roboflow dibentuk:
   ```json
   { "predictions": [ { "class": "nasi", "width": 180, "height": 150, "confidence": 0.94 } ] }
   ```
4. Per piksel: `luas = width × height`, `proporsi_i = luas_i / Σ luas`,
   `berat_i = totalWeightKg × proporsi_i`.
5. Kelas hasil dimasukkan ke kategori DB dengan `mapClassToKategori()`:
   - `nasi`, `rice` → `nasi`
   - `sayur`, `buncis`, `bayam`, `kangkung`, `vegetable`, … → `sayur`
   - `lauk`, `ayam`, `ikan`, `tempe`, `tahu`, `telur`, … → `lauk`
   - `buah`, `pisang`, `melon`, … → `buah`
   - selain itu → `lainnya`
6. **Fallback mock cerdas:** jika `ROBOFLOW_API_KEY`/`ROBOFLOW_MODEL` kosong ATAU request gagal,
   `detectFoodWaste` menghasilkan 6 prediksi pseudo-random deterministik (seed dari berat) supaya
   sistem tetap bisa demo. Hasil bertanda `mode: "mock"` vs `mode: "roboflow"`.

### 2.2 Yang harus dikembangkan berikutnya
1. **Dataset & training model Roboflow.** Target kelas minimum:
   `nasi`, `sayur_*` (buncis, bayam, kangkung), `lauk_*` (ayam, ikan, tempe, tahu), `buah_*`.
   Unggah foto asli ompreng siswa (bukan foto internet) supaya akurat di kondisi kantin sekolah.
2. **Isi env** hasil deploy model:
   ```env
   ROBOFLOW_API_KEY=isi-api-key
   ROBOFLOW_MODEL=isi-model-id
   ROBOFLOW_VERSION=1
   ```
3. **Evaluasi akurasi.** Bandingkan `berat_i` estimasi vs berat timbangan Load Cell
   (delta berat sudah tersedia sebagai label dari ESP32-CAM) → pantau error proporsi.
4. **Kalibrasi ambigu:** kelas yang saling mirip (sayur bayam vs kangkung) bisa digabung jadi satu
   kategori `sayur` di model agar mengurangi salah deteksi.

---

## 3. Evaluasi kondisi bilik maggot — `sensorEvaluationService.js`

Aturan ambang batas (sudah diterapkan):

| Parameter | Rentang aman | Tindakan otomatis saat anomali |
|-----------|--------------|--------------------------------|
| Suhu udara bilik (DHT22) | 24–32°C | <24°C → tutup ventilasi; >32°C → buka ventilasi |
| Suhu substrat pakan (DS18B20) | 28–36°C | >36°C → aerasi/pembalikan substrat; <28°C → tutup substrat |
| Kelembaban udara (DHT22) | 60–80% | di luar rentang → atur sirkulasi/penyiraman |
| Amonia (MQ-135) | < 15 ppm | >15 ppm → tabur dedak/arang aktif |

Output: `{ aman: true, rekomendasi: null }` jika aman, atau `{ aman: false, rekomendasi: "teks saran" }`.

**Yang bisa dikembangkan:** gabungkan dengan model machine learning sederhana (mis. logika fuzzy atau
threshold adaptif musiman), tapi jangan hapus fallback rule-based — dipakai untuk keputusan ESP.

---

## 4. Layanan AI lokal (prediksi & korelasi) — `aiService.js`

Backend memanggil layanan AI terpisah di `AI_SERVICE_URL` (default `http://localhost:8000`):

| Endpoint yang dipanggil backend | Dipakai halaman | Output yang diharapkan |
|--------------------------------|-----------------|------------------------|
| `POST /predict/waste` | `AiPredictionPanel` (admin sekolah) | `{ estimasiVolumeLimbahHarianKg, prediksiJadwalPanen, catatan }` |
| `POST /analyze/menu-correlation` | (cadangan, SPPG) | daftar korelasi menu vs sisa |

Body dipakai: `{ riwayat }` (riwayat = `efficiencyTrend` demo saat ini).
Jika AI lokal mati → `aiService` mengembalikan `{ error: true, message }` dan frontend menampilkan pesan ramah.

> Perhatian: halaman SPPG saat ini mengambil data **analisis-sisa dari DB** (`/api/dapur-mbg/analisis-sisa`)
> yang murni statistik (total kg + %), BUKAN dari AI lokal — karena rencana meniadakan rekomendasi
> otomatis. Tugas AI dev: jadikan `/analyze/menu-correlation` pelengkap (opsional) tanpa menyisipkan
> teks subjektif di UI.

### 4.1 Yang harus dikembangkan
1. Implementasikan service `:8000` dengan endpoint tersebut (FastAPI/Node dll), atau
   `AI_SERVICE_URL` menunjuk ke model ter-deploy (mis. HuggingFace API).
2. Kirimkan **riwayat `waste_records` yang nyata** (bukan data demo) setelah Supabase terisi.
3. Pantau `perluPesanTelurBaru` (terdeteksi di `status-siklus`) — bisa jadi masukan model prediksi panen.

---

## 5. Checklist verifikasi AI (coret jika sudah sesuai)

**A. Deteksi foto (Roboflow)**
- [ ] Tanpa API key, `POST /api/iot/smart-container` tetap merespons `status:"sukses"` dengan `mode:"mock"` dan `deteksi[]`.
- [ ] Dengan API key terisi, respons `mode:"roboflow"` dan setiap `deteksi` punya `kategori` yang valid (nasi/sayur/lauk/buah/lainnya).
- [ ] `proporsi` total ≈ 100% (± pembulatan) dan `berat_i` ≈ `totalBeratKg × proporsi_i`.

**B. Evaluasi sensor**
- [ ] `evaluateChamberConditions({suhuBilikC:28, suhuSubstratC:32, kadarAmoniaPpm:10, kelembabanPersen:70})` → `{aman:true, rekomendasi:null}`.
- [ ] `kadarAmoniaPpm:22` → `aman:false` + saran dedak/arang.
- [ ] `suhuSubstratC:40` → `aman:false` + saran aerasi.
- [ ] `suhuBilikC:22` → `aman:false` + saran tutup ventilasi.

**C. AI lokal**
- [ ] `curl -X POST localhost:8000/predict/waste -d '{"riwayat":[]}'` balas JSON sesuai skema.
- [ ] Backend `GET /api/admin-sekolah/prediksi` memakai hasil itu (bukan hanya demo) saat `DEMO_MODE=false`. (
  Jika AI mati, frontend menampilkan pesan bahwa AI belum bisa dihubungi — bukan error crash.)

---

## 6. Catatan penting

- Jangan menyimpan API key Roboflow di frontend; hanya di `.env` backend (service-role).
- The `mock` mode dipakai supaya demo lomba tetap jalan tanpa internet/key — tandai dengan `mode:"mock"`
  dan tampilkan di UI jika perlu.
- Konsistensi kategori (nasi/sayur/lauk/buah/lainnya) sangat penting karena langsung dipakai
  filter analisis sisa SPPG.