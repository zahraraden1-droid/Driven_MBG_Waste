# Wiring & Pinout Firmware

Referensi cepat koneksi kabel untuk merakit kedua perangkat IoT. Warna kabel bersifat fleksibel asalkan posisi pin benar.

## 1. Smart Container (ESP32-CAM AI-Thinker)

File: `firmware/smart_container_esp32cam/smart_container_esp32cam.ino`

### 1.1 Koneksi LCD 16x2 I2C

| Modul | Pin ESP32-CAM | Fungsi |
|-------|---------------|--------|
| LCD SDA | GPIO 13 | Data I2C |
| LCD SCL | GPIO 14 | Clock I2C |
| LCD VCC | 5V | Daya backlight/logika |
| LCD GND | GND | Ground |

Alamat I2C default `0x27` (definisi `LCD_ADDR`, ganti ke `0x3F` jika modul memakai alamat itu).

### 1.2 Koneksi HX711 + Load Cell 1

| Modul | Pin ESP32-CAM | Fungsi |
|-------|---------------|--------|
| HX711 DT | GPIO 16 | Data |
| HX711 SCK | GPIO 15 | Clock |
| HX711 VCC | 3.3V | Daya |
| HX711 GND | GND | Ground |

> **Catatan penting:** Spesifikasi awal menuliskan SCK ke GPIO 0. **Jangan pakai GPIO 0** karena pada
> board AI-Thinker GPIO 0 sudah dipakai sebagai XCLK (clock kamera OV2640) sehingga akan konflik dan
> kamera tidak aktif. Gunakan **GPIO 15** di atas. Faktor kalibrasi timbangan diatur lewat
> `CALIBRATION_FACTOR` (gram mentah), sesuaikan dengan timbangan/acuan massa Anda.
>
> **Desain saat ini:** Load Cell 1 berada di **wadah buangan** (tempat siswa membuang sisa).
> Ompreng ditaruh di **rak terpisah** (bukan di atas load cell). Berat yang diukur = sisa yang
> *masuk* ke wadah setelah tombol ditekan.

### 1.3 Tombol pemicu foto (rak ompreng)

| Modul | Pin ESP32-CAM | Fungsi |
|-------|---------------|--------|
| Tombol 4-pin (kaki kiri) | GPIO 12 | Pemicu foto saat ditekan |
| Tombol 4-pin (kaki kanan) | GND | Ground |

> Pakai internal pull-up (`INPUT_PULLUP`), jadi cukup tombol ke GND tanpa resistor. Ditekan = foto.
> Pasang tombol di rak/meja ompreng, dekat posisi di depan kamera.

### 1.4 Catu Daya

| Modul | Input | Output | Koneksi |
|-------|-------|--------|---------|
| Step-Up XL6009 | Baterai 3.7V–7.4V | 5V | Vout → pin 5V ESP32-CAM, GND → GND |

## 2. Maggot Chamber (ESP8266 NodeMCU ESP-12E)

File: `firmware/maggot_chamber_esp8266/maggot_chamber_esp8266.ino`

### 2.1 Koneksi DHT22 (suhu & kelembaban udara bilik)

| Modul | Pin NodeMCU | GPIO | Fungsi |
|-------|-------------|------|--------|
| DHT22 DATA | D2 | GPIO 4 | Data |
| DHT22 VCC | 3.3V | - | Daya |
| DHT22 GND | GND | - | Ground |

### 2.2 Koneksi MQ-135 (kadar gas amonia)

| Modul | Pin NodeMCU | GPIO | Fungsi |
|-------|-------------|------|--------|
| MQ-135 AO | A0 | - | Output analog (bacaan ppm) |
| MQ-135 VCC | 5V | - | Pemanas sensor (lebih stabil di 5V) |
| MQ-135 GND | GND | - | Ground |

> `MQ135_RL` (beban 10kΩ) dan `MQ135_R0` (kalibrasi ambient) bisa disesuaikan agar angka ppm mendekati alat ukur pembanding.

### 2.3 Koneksi DS18B20 (suhu substrat pakan)

| Modul | Pin NodeMCU | GPIO | Fungsi |
|-------|-------------|------|--------|
| DS18B20 DATA | D7 | GPIO 13 | Data OneWire |
| DS18B20 VCC | 3.3V | - | Daya |
| DS18B20 GND | GND | - | Ground |

> Pasang resistor pull-up **4.7kΩ** antara pin DATA dan VCC (bus OneWire). Probe dicelupkan ke dalam substrat pakan.

### 2.4 Koneksi HX711 + Load Cell 2

| Modul | Pin NodeMCU | GPIO | Fungsi |
|-------|-------------|------|--------|
| HX711 DT | D5 | GPIO 14 | Data |
| HX711 SCK | D6 | GPIO 12 | Clock |
| HX711 VCC | 5V | - | Daya |
| HX711 GND | GND | - | Ground |

> Load Cell 2 dipasang di **wadah atas / collection bin** untuk menimbang maggot prepupa matang yang bermigrasi. Kalibrasi lewat `CALIBRATION_FACTOR`.

### 2.5 Catu Daya

| Modul | Input | Output | Koneksi |
|-------|-------|--------|---------|
| Step-Up XL6009 | Baterai 3.7V–7.4V | 5V | Vout → pin VIN NodeMCU, GND → GND |

## 3. Konfigurasi yang Wajib Diubah per Perangkat

| Konstanta | Smart Container | Maggot Chamber |
|-----------|-----------------|----------------|
| `WIFI_SSID` / `WIFI_PASS` | SSID & password WiFi lokasi | Sama |
| `MQTT_SERVER` / `MQTT_PORT` | Alamat broker MQTT | Alamat broker MQTT |
| `MQTT_USER` / `MQTT_PASS` | Kredensial akun broker | Sama |
| `BTN_PIN` | GPIO 12 (tombol foto) | - |
| `BATCH_ID` | - | UUID batch aktif dari `maggot_batches` (boleh kosong) |
| `CALIBRATION_FACTOR` | Disesuaikan timbangan | Disesuaikan timbangan |

## 4. Transport MQTT (pengganti HTTP REST)

Perangkat sudah memakai **MQTT** (bukan lagi HTTP POST). Kedua firmware memakai library `PubSubClient` dan
mengirim data ke broker MQTT. Backend Express berlangganan ke topic-topic berikut:

| Arah | Topic | Isi payload | Perangkat |
|------|-------|-------------|-----------|
| Kamera -> Broker | `mbg/smart-container/meta` | JSON `{"beratKg":1.23}` | ESP32-CAM |
| Kamera -> Broker | `mbg/smart-container/foto` | byte JPEG mentah (binary) | ESP32-CAM |
| Broker -> Kamera | `mbg/smart-container/result` | JSON `{"status":"sukses",...}` | Backend |
| Chamber -> Broker | `mbg/maggot-chamber` | JSON telemetri 5 sensor | ESP8266 |
| Broker -> Chamber | `mbg/maggot-chamber/result` | JSON `{"aman":true,"rekomendasi":...}` | Backend |
| Backend -> Semua | `mbg/maintenance` | JSON `{"aktif":false}` (retained) | Backend |

### 4.1 Broker untuk production

- **Production saat ini (Railway):** broker Mosquitto dibuild dari `deploy/mosquitto`, terhubung
  lewat TCP proxy Railway. Di firmware pakai:
  `MQTT_SERVER="tramway.proxy.rlwy.net"`, `MQTT_PORT=55251`, `MQTT_USER="mbg_device"`,
  `MQTT_PASS="5vfa4wltLH3v30B2WqlUlTp"` (nilai sama dengan env `MQTT_*` di service mosquitto & backend).
  > Jangan pakai domain `mosquitto-ae86.up.railway.app:1883` — domain HTTP Railway TIDAK meneruskan TCP.
- **Lokal (uji coba):** jalankan Mosquitto di laptop atau pakai broker publik seperti `broker.emqx.io:1883`.
- Keamanan perangkat dikendalikan oleh kredensial MQTT tiap perangkat; `DEVICE_API_KEY` tetap dipakai
  untuk fallback endpoint REST (`/api/iot/*`) yang masih tersedia untuk pengujian lewat curl.

### 4.2 Skema topic

```
mbg/smart-container/meta
mbg/smart-container/foto
mbg/smart-container/result
mbg/maggot-chamber
mbg/maggot-chamber/result
mbg/maintenance          (retained, dikonsumsi semua perangkat)
```

Prefix default `mbg` bisa diganti lewat konstanta `MQTT_PREFIX` di firmware dan `MQTT_TOPIC_PREFIX` di backend.