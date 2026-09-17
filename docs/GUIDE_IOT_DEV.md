# Panduan IoT Developer — SPPG MBG

Dokumen untuk developer perangkat keras (ESP32-CAM & ESP8266) dan pipeline data IoT: firmware,
pinout, protokol MQTT, apa yang harus dikembangkan/diuji, dan **checklist verifikasi**.

---

## 1. Arsitektur IoT

```
ESP32-CAM (Smart Container)  ———┐
   foto + Load Cell + LCD       │  MQTT (utama)
                                ▼
ESP8266 (Maggot Chamber)   ———▶ Broker MQTT ◀──▶ Backend Express (:4000)
   DHT22, MQ-135, DS18B20,      └── subscribe & proses → Supabase
   HX711 wadah atas
```

- **Transport utama:** MQTT (`PubSubClient`). Perangkat publish, backend subscribe.
- **Fallback:** REST (`POST /api/iot/smart-container`, `POST /api/iot/maggot-chamber`) masih ada
  untuk pengujian lewat curl, header `x-device-api-key`.
- Backend memproses lalu membalas lewat topic `…/result` (dipakai ESP32-CAM untuk LCD).

File firmware:
```
firmware/
├── smart_container_esp32cam/smart_container_esp32cam.ino
├── maggot_chamber_esp8266/maggot_chamber_esp8266.ino
└── WIRING_PINOUT.md          ← panduan kabel + skema topic (baca wajib)
```

---

## 2. Smart Container — ESP32-CAM AI-Thinker

**Hardware:** kamera OV2640 (photo), HX711 + Load Cell 1 (berat sisa), LCD 16x2 I2C, Step-Up XL6009.

| Komponen | Pin | Catatan |
|----------|-----|---------|
| Kamera | pin bawaan AI-Thinker (XCLK=GPIO0, dst.) | resolusi QVGA, JPEG q12 |
| LCD I2C | SDA=GPIO13, SCL=GPIO14, addr 0x27 | ganti ke 0x3F jika modul lain |
| HX711 | DT=GPIO16, **SCK=GPIO15** | ⚠ SCK TIDAK di GPIO0 (bentrok XCLK kamera) |
| Load Cell 1 | di bawah piringan/ompreng | kalibrasi `CALIBRATION_FACTOR` |
| Catu | XL6009 → 5V | jangan self-power saat kamera flash |

**State machine LCD** (5 tahap):
1. `IDLE` → "Silahkan Taruh / Ompreng"; jika berat stabil > 0,05 kg → tare → CAPTURE.
2. `CAPTURE` → foto QVGA → "Sedang Memfoto / Model v1" → DUMP.
3. `DUMP` → "Silahkan Buang / Makanan Sisa"; tunggu delta berat > 0,02 kg stabil → WEIGH_UPLOAD.
4. `WEIGH_UPLOAD` → publish `meta` {beratKg} lalu `foto` (byte JPEG) → tunggu `result` (timeout 15 detik).
5. `DONE` → "Selesai! / Terima Kasih" (sukses) atau "Gagal Kirim / Coba Lagi" → 2 dtk → IDLE.

**MQTT yang dipakai ESP32-CAM:**
- publish: `mbg/smart-container/meta`, `…/foto`
- subscribe: `mbg/smart-container/result`, `mbg/maintenance`
- buffer MQTT di-set 65536 byte (untuk menampung JPEG). Client ID `mbg-container-<efuseMac>`.

---

## 3. Maggot Chamber — ESP8266 NodeMCU ESP-12E

**Hardware:** sensor 4 macam + timbangan wadah atas.

| Sensor | Pin NodeMCU | Baca |
|--------|-------------|------|
| DHT22 | DATA=D2 (GPIO4) | suhu udara bilik & kelembaban |
| MQ-135 | AO=A0 (VCC 5V) | kadar amonia (ppm) |
| DS18B20 | DATA=D7 (GPIO13) + pull-up 4,7kΩ ke VCC | suhu substrat pakan |
| HX711 + Load Cell 2 | DT=D5 (GPIO14), SCK=D6 (GPIO12) | berat maggot prepupa matang di wadah atas |

- Kirim JSON tiap **30 detik** ke `mbg/maggot-chamber`.
- Subscribe `mbg/maintenance`; jika `{"aktif":true}` perangkat **berhenti mengirim**,
  {aktif:false} → lanjut mengirim.
- Auto-reconnect WiFi + MQTT. Client ID `mbg-chamber-<chipId>`.
- Payload telemetri:
  ```json
  { "batchId": "...",
    "suhuBilikC": 28.4, "kelembabanPersen": 68.0,
    "kadarAmoniaPpm": 12.3, "suhuSubstratC": 33.1,
    "beratMaggotPanenKg": 145.600 }
  ```

---

## 4. Protokol MQTT (referensi)

| Arah | Topic | Payload |
|------|-------|---------|
| ESP32-CAM → broker | `mbg/smart-container/meta` | JSON `{"beratKg":1.23}` |
| ESP32-CAM → broker | `mbg/smart-container/foto` | byte JPEG (binary) |
| Backend → ESP32-CAM | `mbg/smart-container/result` | JSON `{"status":"sukses",...}` |
| ESP8266 → broker | `mbg/maggot-chamber` | JSON telemetri |
| Backend → ESP8266 | `mbg/maggot-chamber/result` | JSON `{"aman":true,"rekomendasi":...}` |
| Backend → semua | `mbg/maintenance` | JSON `{"aktif":false}` (**retained**) |

Prefix default `mbg` (konstanta `MQTT_PREFIX` / env `MQTT_TOPIC_PREFIX` di backend).
Urutan kirim ESP32-CAM penting: **meta dulu, baru foto** (backend men-cache meta terakhir 30 dtk).

---

## 5. Yang harus dikembangkan / diperbarui berikutnya

1. **Wajib saat perakitan:**
   - Isi `WIFI_SSID`/`WIFI_PASS`, `MQTT_SERVER`/`MQTT_PORT`/`MQTT_USER`/`MQTT_PASS`, dan `BATCH_ID`
     (ESP8266, UUID batch aktif — boleh kosong untuk tahap awal).
   - Kalibrasi **HX711**: timbang benda bermassa diketahui → sesuaikan `CALIBRATION_FACTOR` kedua perangkat.
   - Kalibrasi **MQ-135**: cek nilai `MQ135_R0` di udara bersih agar angka ppm masuk akal.
2. **Production MQTT:**
   - Ganti ke **TLS** (`mqtts://`, port 8883) pakai `WiFiClientSecure` + fingerprint/`setInsecure()` —
     terutama penting jika broker remote (EMQX/HiveMQ). Jangan buka port 1883 ke internet.
   - Gunakan **akun terpisah per perangkat** di broker (username/password) untuk audit & revoke.
3. **Robustness:**
   - Offline buffer: jika broker sulit diakses (WiFi mati), ESP8266 bisa simpan 1–2 reading di RTC
     memory lalu kirim saat kembali online.
   - ESP32-CAM: tambahkan retry hasil jika `result` tidak tiba dalam 15 dtk (saat ini cukup
     menampilkan "Gagal Kirim" lalu kembali IDLE).
   - Baterai: aktifkan deep-sleep antar pemakaian (ESP8266 saat interval 30 dtk) + pantau tegangan
     via pembagi baterai; ini menambah masa pakai lapangan.
4. **Verifikasi hardware est.:** uji ketepatan timbangan vs timbangan referensi dan bandingkan
   ±0,01 kg; validasi DS18B20 dengan termometer (error ±1°C).

---

## 6. Checklist verifikasi IoT (coret jika sudah sesuai)

**A. Kompilasi & flash**
- [ ] Arduino IDE: board `NodeMCU 1.0 (ESP-12E)` / `ESP32 Dev Module` terinstall Core-nya.
- [ ] Library terpasang: `PubSubClient`, `LiquidCrystal_I2C`, `HX711`, `DHT sensor library`,
  `OneWire`, `DallasTemperature` (untuk ESP32: `esp_camera` bawaan Core).
- [ ] `smart_container_esp32cam.ino` dan `maggot_chamber_esp8266.ino` **compile tanpa error**.
- [ ] Kedua board ter-flash dan serial monitor menampilkan boot + koneksi WiFi.

**B. MQTT round-trip (uji dengan `mosquitto_sub/publish`)**
```bash
# pantau semua balasan dari backend
mosquitto_sub -h <broker> -t 'mbg/#' -v
# kirim telemetri chamber palsu
mosquitto_pub -h <broker> -t 'mbg/maggot-chamber' -m '{"suhuBilikC":28,"kelembabanPersen":70,"kadarAmoniaPpm":22,"suhuSubstratC":33,"beratMaggotPanenKg":120}'
# cek balasan aman/rekomendasi di …/maggot-chamber/result
```
- [ ] Balasan `maggot-chamber/result` datang dengan `aman` dan `rekomendasi` benar (22 ppm → aman:false).
- [ ] ESP8266 asli → muncul di `mbg/maggot-chamber` tiap 30 detik.
- [ ] ESP32-CAM setelah buang sisa → muncul `meta` lalu `foto`; LCD berubah ke "Selesai!/ Terima Kasih".

**C. REST fallback**
```bash
curl -X POST http://localhost:4000/api/iot/maggot-chamber \
  -H 'x-device-api-key: sppg-mbg-iot-secure-key-2026' \
  -H 'Content-Type: application/json' \
  -d '{"suhuBilikC":28,"kadarAmoniaPpm":12}'
```
- [ ] Endpoint REST merespons JSON `{aman, rekomendasi, tersimpan}`.

**D. Mode pemeliharaan**
- [ ] Toggle di dashboard admin (`/admin-sekolah`) → ESC8266 berhenti mengirim; toggle off → lanjut.
- [ ] ESP32-CAM di IDLE menampilkan "Mode Pemeliharaan / Harian" saat `mbg/maintenance` = aktif.

**E. Nilai sensor valid**
- [ ] Suhu udara ≈ termometer referensi (±1°C); kelembaban wajar.
- [ ] Amonia naik signifikan saat ada amonia/dekasi sampah.
- [ ] Suhu substrat naik saat baru diberi pakan baru.
- [ ] Berat di LCD smart container ≈ berat makan di timbangan referensi (±0,01 kg).
- [ ] Foto yang dikirim tampil/cocok dengan isi ompreng (uji klasifikasi → kategori benar di DB).

---

## 7. Troubleshooting cepat

| Gejala | Kemungkinan penyebab | Solusi |
|--------|----------------------|--------|
| LCD blank / kotak-kotak | alamat I2C salah | coba `0x3F`; pastikan VCC 5V |
| Kamera gagal init | PSRAM/kabel/frame terlalu besar | pakai QVGA q12; cek serial `esp_camera_init` |
| Publish foto selalu gagal | buffer MQTT kurang (`setBufferSize`) | naikkan ke 65536; perkecil JPEG |
| HX711 berat tidak stabil | ground/noise/solder | share GND, kabel pendek, isolasi |
| DS18B20 tidak terbaca | tanpa pull-up 4,7kΩ | pasang pull-up DATA→VCC |
| WiFi drop saat kamera aktif | catu daya kurang / flash | catu 5V dari XL6009 stabil, jangan dari USB board |
| Tidak dapat sambung broker | kredensial/port salah | uji dulu dgn `mosquitto_sub -h <broker> -v` dari laptop |

---

## 8. Definition of done (IoT)

- [ ] Kedua firmware compile & ter-flash; boot stabil > 24 jam di suhu ruang.
- [ ] MQTT round-trip verified (topik `meta`→`foto`→`result`, chamber→`result`).
- [ ] Timbangan & sensor MQ-135/DS18B20 terkalibrasi dgn nilai masuk akal.
- [ ] Mode pemeliharaan bekerja dua arah (backend→perangkat).
- [ ] Kabel & dokumentasi `WIRING_PINOUT.md` TERDAPAT sama dgn build fisik.