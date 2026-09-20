/*
 * SMART CONTAINER - ESP32-CAM (AI Thinker)
 * HX711 (berat sisa) + LCD 16x2 bit-bang + kamera + MQTT (Railway) -> backend Roboflow
 *
 * FIX dari versi lama (disinkronkan dari sketch test yang sudah terbukti jalan):
 * - HX711 DT pindah dari GPIO16 -> GPIO2. GPIO16 pada AI-Thinker ESP32-CAM adalah
 *   chip-select PSRAM; jika di-ground/di-drive oleh HX711, akses PSRAM terganggu,
 *   heap korup -> crash LoadProhibited di allocator (cam_dma_config / wifi_calloc).
 * - LCD pakai I2C bit-bang (GPIO13/14), bukan Wire default -> bebas konflik bus SCCB kamera.
 * - Foto dikirim per-chunk (beginPublish/write/endPublish), tidak lagi publish(buf,len)
 *   yang butuh buffer besar dan bisa gagal diam-diam.
 * - initCamera punya fallback DRAM (1 buffer) kalau PSRAM tidak ada.
 * - WiFi/MQTT bisa reconnect; MQTT subscribe topic result + maintenance.
 * - Faktor kalibrasi dibaca dari NVS (disimpan sketch test), fallback CALIBRATION_FACTOR.
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <HX711.h>
#include <Preferences.h>

// ---------------- Pin kamera (AI Thinker ESP32-CAM) ----------------
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

// ---------------- Pin & konfigurasi periferal ----------------
#define LCD_ADDR 0x27
#define LCD_COLS 16
#define LCD_ROWS 2
#define LCD_SDA_PIN 13
#define LCD_SCL_PIN 14
#define HX711_DT_PIN 2  // FIX: bukan GPIO16! GPIO16 = CS PSRAM di ESP32-CAM.
#define HX711_SCK_PIN 15
#define BTN_PIN 12  // tombol ke GND (aman untuk strapping pin GPIO12)
#define CALIBRATION_FACTOR 450.0

// ---------------- Parameter perilaku ----------------
#define DUMP_DELTA_KG 0.02
#define STABLE_MS 1500
#define RESULT_TIMEOUT_MS 15000
#define WIFI_TIMEOUT_MS 30000
#define HX711_TIMEOUT_MS 1000
#define BTN_DEBOUNCE_MS 50
#define MQTT_BUFFER 4096  // cukup karena foto dikirim per-chunk; result JSON kecil
#define MQTT_CHUNK 1024

// ---------------------------------------------------------------------------
// Kredensial dibaca dari `secrets.h` di folder sketch ini.
//
// File `secrets.h` SENGAJA tidak di-commit (lihat .gitignore) supaya kredensial
// tidak pernah tersimpan di repositori. Untuk menyiapkannya:
//
//     cp firmware/secrets.h.example firmware/<folder-sketch>/secrets.h
//
// lalu isi nilai sebenarnya. Bila file itu belum ada, kompilasi akan GAGAL
// dengan pesan yang menjelaskan langkah di atas — ini disengaja agar kredensial
// tidak diam-diam kembali memakai nilai default yang salah.
// ---------------------------------------------------------------------------
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h belum ada di folder sketch ini. Jalankan: cp firmware/secrets.h.example firmware/<folder-sketch>/secrets.h lalu isi nilainya."
#endif

const char *WIFI_SSID = SECRET_WIFI_SSID;
const char *WIFI_PASS = SECRET_WIFI_PASS;
// Broker MQTT diakses lewat TCP proxy (bukan domain HTTP).
const char *MQTT_SERVER = SECRET_MQTT_SERVER;
const uint16_t MQTT_PORT = SECRET_MQTT_PORT;
const char *MQTT_USER = SECRET_MQTT_USER;
const char *MQTT_PASS = SECRET_MQTT_PASS;
const char *MQTT_PREFIX = SECRET_MQTT_PREFIX;

// =====================================================================
//  I2C bit-bang (dipakai karena pin default Wire bentrok dengan SCCB kamera)
// =====================================================================
class BitBangI2C
{
public:
  BitBangI2C(uint8_t sda, uint8_t scl) : _sda(sda), _scl(scl) {}
  void begin()
  {
    pinMode(_sda, OUTPUT);
    pinMode(_scl, OUTPUT);
    digitalWrite(_sda, HIGH);
    digitalWrite(_scl, HIGH);
  }
  bool start()
  {
    digitalWrite(_sda, HIGH);
    digitalWrite(_scl, HIGH);
    delayMicroseconds(5);
    digitalWrite(_sda, LOW);
    delayMicroseconds(5);
    digitalWrite(_scl, LOW);
    return true;
  }
  void stop()
  {
    digitalWrite(_sda, LOW);
    digitalWrite(_scl, HIGH);
    delayMicroseconds(5);
    digitalWrite(_sda, HIGH);
    delayMicroseconds(5);
  }
  bool writeByte(uint8_t data)
  {
    for (int i = 7; i >= 0; i--)
    {
      digitalWrite(_sda, (data >> i) & 1);
      delayMicroseconds(3);
      digitalWrite(_scl, HIGH);
      delayMicroseconds(5);
      digitalWrite(_scl, LOW);
      delayMicroseconds(2);
    }
    pinMode(_sda, INPUT);
    digitalWrite(_sda, HIGH);
    delayMicroseconds(3);
    digitalWrite(_scl, HIGH);
    delayMicroseconds(5);
    bool ack = digitalRead(_sda) == LOW;
    digitalWrite(_scl, LOW);
    digitalWrite(_sda, HIGH);
    pinMode(_sda, OUTPUT);
    digitalWrite(_sda, HIGH);
    delayMicroseconds(2);
    return ack;
  }
  void beginTransmission(uint8_t addr)
  {
    start();
    writeByte(addr << 1);
  }
  void write(uint8_t data) { writeByte(data); }
  void endTransmission() { stop(); }

  bool probe(uint8_t addr)
  {
    start();
    bool ack = writeByte(addr << 1);
    stop();
    return ack;
  }

private:
  uint8_t _sda;
  uint8_t _scl;
};

class PCF8574LCD : public Print
{
public:
  using Print::write;

  PCF8574LCD(uint8_t addr, BitBangI2C *bus)
      : _addr(addr), _cols(16), _rows(2), _backlight(0x08), _bus(bus) {}

  void begin(uint8_t cols, uint8_t rows)
  {
    _cols = cols;
    _rows = rows;
    _bus->begin();
    delay(50);
    writeNibble(0x03, false);
    delayMicroseconds(4500);
    writeNibble(0x03, false);
    delayMicroseconds(4500);
    writeNibble(0x03, false);
    delayMicroseconds(150);
    writeNibble(0x02, false);
    command(0x28);
    command(0x0C);
    command(0x06);
    command(0x01);
    delay(2);
  }
  void setBacklight(uint8_t on)
  {
    _backlight = (on ? 0x08 : 0x00);
    expanderWrite(0);
  }
  void setCursor(uint8_t col, uint8_t row) { command(0x80 | (row == 0 ? 0x00 : 0x40) | col); }
  virtual size_t write(uint8_t c)
  {
    writeByte(c, true);
    return 1;
  }
  void command(uint8_t value) { writeByte(value, false); }
  void clear()
  {
    command(0x01);
    delay(2);
  }

  void printLine(uint8_t row, const char *text)
  {
    setCursor(0, row);
    uint8_t i = 0;
    for (; text[i] && i < _cols; i++)
      write((uint8_t)text[i]);
    for (; i < _cols; i++)
      write((uint8_t)' ');
  }

private:
  void expanderWrite(uint8_t data)
  {
    _bus->beginTransmission(_addr);
    _bus->write(data | _backlight);
    _bus->endTransmission();
  }
  void pulseEnable(uint8_t data)
  {
    expanderWrite(data | 0x04);
    delayMicroseconds(1);
    expanderWrite(data & ~0x04);
    delayMicroseconds(50);
  }
  void writeNibble(uint8_t nibble, bool rs)
  {
    uint8_t out = (nibble & 0x0F) << 4;
    if (rs)
      out |= 0x01;
    pulseEnable(out);
  }
  void writeByte(uint8_t value, bool rs)
  {
    writeNibble(value >> 4, rs);
    writeNibble(value & 0x0F, rs);
  }
  uint8_t _addr;
  uint8_t _cols;
  uint8_t _rows;
  uint8_t _backlight;
  BitBangI2C *_bus;
};

// =====================================================================
//  Global
// =====================================================================
BitBangI2C lcdBus(LCD_SDA_PIN, LCD_SCL_PIN);
PCF8574LCD lcd(LCD_ADDR, &lcdBus);
HX711 scale;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicMeta[128];
char topicFoto[128];
char topicResult[128];
char topicMaintenance[64];
char topicStatus[128];
char topicCmd[128];

Preferences prefs;
float scaleFaktor = CALIBRATION_FACTOR;

enum State { STATE_IDLE, STATE_CAPTURE, STATE_DUMP, STATE_WEIGH_UPLOAD, STATE_DONE };
State state = STATE_IDLE;

unsigned long stateStart = 0;
unsigned long lastStable = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastHeartbeat = 0;
bool btnPerluRelease = false;
float tareKg = 0;
float sampleKg = 0;
bool uploadOk = false;
bool gotResult = false;
bool sentData = false;
bool maintenanceAktif = false;
camera_fb_t *fotoFb = NULL;

// =====================================================================
//  LCD helper
// =====================================================================
void lcdBaris(const char *atas, const char *bawah)
{
  lcd.printLine(0, atas);
  lcd.printLine(1, bawah);
}

// =====================================================================
//  Timbangan (dengan timeout & flag sukses, tidak pernah menggantung)
// =====================================================================
bool readKg(float &kg)
{
  if (!scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    return false;
  float v = scale.get_units(5); // rata-rata 5 sampel
  if (isnan(v) || isinf(v) || fabsf(v) > 1000000.0f)
    return false;
  kg = v / 1000.0f;
  return true;
}

void simpanKalibrasi(float factor)
{
  prefs.begin("sppg", false);
  prefs.putFloat("SCALE_FACTOR", factor);
  prefs.end();
  scaleFaktor = factor;
  scale.set_scale(scaleFaktor);
}

float muatKalibrasi()
{
  prefs.begin("sppg", false);
  float factor = prefs.getFloat("SCALE_FACTOR", 0);
  prefs.end();
  return factor > 0 ? factor : CALIBRATION_FACTOR;
}

// =====================================================================
//  Status & perintah (kalibrasi remote dari dashboard)
// =====================================================================
String jsonKeyValue(const String &msg, const char *key)
{
  String p = String("\"") + key + "\":";
  int i = msg.indexOf(p);
  if (i < 0)
    return "";
  int j = i + p.length();
  String val;
  while (j < msg.length() && msg[j] != ',' && msg[j] != '}' && msg[j] != '\n' && msg[j] != '\r')
  {
    char c = msg[j];
    if (c == '"')
    {
      j++;
      continue;
    }
    val += c;
    j++;
  }
  val.trim();
  return val;
}

void publishStatus(const char *cmd, bool ok, const String &catatan)
{
  if (!mqttClient.connected())
    return;
  String body = String("{\"perangkat\":\"smart-container\",\"cmd\":\"") + String(cmd) + "\",\"ok\":" + (ok ? "true" : "false");
  body += ",\"scaleFaktor\":" + String(scaleFaktor, 2);
  if (catatan.length() > 0)
  {
    body += ",\"catatan\":\"" + catatan + "\"";
  }
  body += "}";
  mqttClient.publish(topicStatus, body.c_str());
}

// =====================================================================
//  Kamera
// =====================================================================
void initCamera()
{
  bool psram = psramFound();
  if (psram)
    Serial.println("[camera] PSRAM OK.");
  else
    Serial.println("[camera] PSRAM TIDAK ADA -> mode DRAM (1 buffer). Aktifkan Tools->PSRAM di Arduino IDE untuk performa terbaik.");

  camera_config_t config = {0};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;

  if (psram)
  {
    config.jpeg_quality = 10;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_LATEST;
  }
  else
  {
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t res = esp_camera_init(&config);
  if (res != ESP_OK)
  {
    Serial.printf("KAMERA GAGAL INIT: 0x%x\n", res);
    return;
  }

  // hangatkan auto-exposure beberapa frame pertama
  for (int i = 0; i < 3; i++)
  {
    camera_fb_t *warm = esp_camera_fb_get();
    if (warm)
      esp_camera_fb_return(warm);
    delay(100);
  }
  Serial.println("Kamera OK.");
}

bool capturePhoto()
{
  if (fotoFb)
  {
    esp_camera_fb_return(fotoFb);
    fotoFb = NULL;
  }
  camera_fb_t *stale = esp_camera_fb_get(); // buang frame lama -> foto = kondisi terkini
  if (stale)
    esp_camera_fb_return(stale);
  fotoFb = esp_camera_fb_get();
  return fotoFb != NULL;
}

// =====================================================================
//  WiFi & MQTT
// =====================================================================
bool ensureWifi(uint32_t timeoutMs = WIFI_TIMEOUT_MS)
{
  if (WiFi.status() == WL_CONNECTED)
    return true;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs)
  {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

void pumpMqtt(uint32_t ms)
{
  uint32_t t0 = millis();
  while (millis() - t0 < ms)
  {
    mqttClient.loop();
    delay(10);
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++)
    msg += (char)payload[i];

  if (strcmp(topic, topicResult) == 0)
  {
    String compact = msg;
    compact.replace(" ", "");
    uploadOk = compact.indexOf("\"status\":\"sukses\"") >= 0;
    gotResult = true;
  }
  else if (strcmp(topic, topicMaintenance) == 0)
  {
    String compact = msg;
    compact.replace(" ", "");
    maintenanceAktif = compact.indexOf("\"aktif\":true") >= 0;
  }
  else if (strcmp(topic, topicCmd) == 0)
  {
    String compact = msg;
    compact.replace(" ", "");
    String cmd = jsonKeyValue(compact, "cmd");
    float val = jsonKeyValue(compact, "value").toFloat();

    if (cmd == "status")
    {
      publishStatus("status", true, "");
    }
    else if (cmd == "tare")
    {
      bool ok = scale.wait_ready_timeout(500, 10);
      if (ok)
        scale.tare();
      publishStatus("tare", ok, ok ? "" : "HX711 tidak siap");
    }
    else if (cmd == "set_scale_factor")
    {
      if (val > 0 && val < 1000000.0f)
      {
        simpanKalibrasi(val);
        publishStatus("set_scale_factor", true, String(val, 2));
      }
      else
      {
        publishStatus("set_scale_factor", false, "nilai tidak valid");
      }
    }
    else if (cmd == "reboot")
    {
      publishStatus("reboot", true, "");
      delay(500);
      ESP.restart();
    }
  }
}

bool ensureMqtt()
{
  if (mqttClient.connected())
    return true;
  if (!ensureWifi())
    return false;

  for (int tries = 0; tries < 5 && !mqttClient.connected(); tries++)
  {
    String clientId = String("mbg-container-") + String((uint32_t)ESP.getEfuseMac());
    bool ok = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    if (!ok)
      delay(1000);
  }

  if (mqttClient.connected())
  {
    mqttClient.subscribe(topicMaintenance);
    mqttClient.subscribe(topicResult);
    mqttClient.subscribe(topicCmd);
    pumpMqtt(300); // buang pesan lama (retained) yang langsung dikirim broker
    return true;
  }
  return false;
}

// Foto dikirim per-chunk supaya tidak butuh buffer besar dan tidak gagal diam-diam.
bool publishFoto(const uint8_t *buf, size_t len)
{
  if (!mqttClient.beginPublish(topicFoto, len, false))
    return false;
  size_t sent = 0;
  while (sent < len)
  {
    size_t n = len - sent;
    if (n > MQTT_CHUNK)
      n = MQTT_CHUNK;
    if (mqttClient.write(buf + sent, n) != n)
    {
      mqttClient.disconnect();
      return false;
    }
    sent += n;
  }
  return mqttClient.endPublish();
}

void publishWaste()
{
  String meta = String("{\"beratKg\":") + String(sampleKg, 3) + String("}");
  bool okMeta = mqttClient.publish(topicMeta, meta.c_str(), false);

  bool okFoto = false;
  if (fotoFb)
    okFoto = publishFoto(fotoFb->buf, fotoFb->len);

  if (!okMeta || !okFoto)
  {
    gotResult = true;
    uploadOk = false;
  }
}

// =====================================================================
//  Setup / loop
// =====================================================================
void setup()
{
  Serial.begin(115200);
  delay(300);

  lcdBus.begin();
  if (!lcdBus.probe(LCD_ADDR))
    Serial.printf("[setup] PERINGATAN: LCD tidak merespon di 0x%02X - cek kabel SDA/SCL atau alamat.\n", LCD_ADDR);
  lcd.begin(LCD_COLS, LCD_ROWS);
  lcd.setBacklight(true);
  lcdBaris("Smart Container", "/ Memuat...");

  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scaleFaktor = muatKalibrasi();
  scale.set_scale(scaleFaktor);
  if (scale.wait_ready_timeout(1000, 10))
    scale.tare();
  else
    Serial.println("[setup] HX711 TIDAK merespon - cek VCC/GND/kabel/pin");

  pinMode(BTN_PIN, INPUT_PULLUP);

  snprintf(topicMeta, sizeof(topicMeta), "%s/smart-container/meta", MQTT_PREFIX);
  snprintf(topicFoto, sizeof(topicFoto), "%s/smart-container/foto", MQTT_PREFIX);
  snprintf(topicResult, sizeof(topicResult), "%s/smart-container/result", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);
  snprintf(topicStatus, sizeof(topicStatus), "%s/smart-container/status", MQTT_PREFIX);
  snprintf(topicCmd, sizeof(topicCmd), "%s/smart-container/cmd", MQTT_PREFIX);

  if (!mqttClient.setBufferSize(MQTT_BUFFER))
    Serial.println("[setup] PERINGATAN: alokasi buffer MQTT gagal");
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(15);

  ensureWifi();
  ensureMqtt();

  initCamera();

  lcdBaris("Tekan Tombol", "/ Untuk Memfoto");
  state = STATE_IDLE;
}

void loop()
{
  static float lastKg = 0;
  float w = lastKg;             // pertahankan pembacaan terakhir jika HX711 gagal
  if (readKg(w)) lastKg = w;
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED)
    WiFi.begin(WIFI_SSID, WIFI_PASS);

  if (!mqttClient.connected() && now - lastMqttAttempt > 5000)
  {
    lastMqttAttempt = now;
    ensureMqtt();
  }
  mqttClient.loop();

  if (mqttClient.connected() && !maintenanceAktif && now - lastHeartbeat >= 60000)
  {
    lastHeartbeat = now;
    String body = String("{\"perangkat\":\"smart-container\",\"heartbeat\":true,\"beratKg\":");
    body += String(w, 3);
    body += ",\"scaleFaktor\":" + String(scaleFaktor, 2);
    body += ",\"uptimeMs\":" + String(millis()) + "}";
    mqttClient.publish(topicStatus, body.c_str());
  }

  switch (state) {
    case STATE_IDLE:
      if (digitalRead(BTN_PIN) == LOW) {
        if (lastStable == 0) lastStable = now;
        if (now - lastStable >= BTN_DEBOUNCE_MS && !maintenanceAktif) {
          if (btnPerluRelease) {
            lcdBaris("Tunggu Proses", "/ Sebelumnya Belum");
            lastStable = 0;
          } else {
            btnPerluRelease = true;
            tareKg = w;
            lastStable = 0;
            lcdBaris("Sedang Memfoto", "/ Model v1");
            stateStart = now;
            state = STATE_CAPTURE;
          }
        }
      } else {
        if (btnPerluRelease) {
          btnPerluRelease = false;
          lcdBaris("Tekan Tombol", "/ Untuk Memfoto");
        }
        lastStable = 0;
      }
      break;

    case STATE_CAPTURE:
      if (now - stateStart >= 500) {
        if (capturePhoto()) {
          lcdBaris("Silahkan Buang", "/ Makanan Sisa");
          stateStart = now;
          lastStable = 0;
          state = STATE_DUMP;
        } else {
          btnPerluRelease = false;
          lcdBaris("Gagal Foto", "/ Tekan Lagi");
          state = STATE_IDLE;
        }
      }
      break;

    case STATE_DUMP:
      {
        float delta = w - tareKg;
        if (delta < 0) delta = 0;
        char bawah[17];
        snprintf(bawah, sizeof(bawah), "Sisa +%.3f kg", delta);
        if (delta > DUMP_DELTA_KG) {
          if (lastStable == 0) lastStable = now;
          if (now - lastStable >= STABLE_MS) {
            sampleKg = delta;
            lcdBaris("Silahkan Tunggu", "/ Proses Data...");
            stateStart = now;
            lastStable = 0;
            gotResult = false;
            uploadOk = false;
            sentData = false;
            state = STATE_WEIGH_UPLOAD;
            break;
          }
        } else {
          lastStable = 0;
        }
        lcdBaris("Silahkan Buang", bawah);
      }
      break;

    case STATE_WEIGH_UPLOAD:
      if (now - stateStart < 300) break;

      if (!sentData) {
        sentData = true;
        publishWaste();
      }

      if (gotResult && now - stateStart >= 800) {
        if (fotoFb) {
          esp_camera_fb_return(fotoFb);
          fotoFb = NULL;
        }
        lcdBaris(uploadOk ? "Selesai!" : "Gagal Kirim", uploadOk ? "/ Terima Kasih" : "/ Coba Lagi");
        stateStart = now;
        state = STATE_DONE;
      } else if (!gotResult && now - stateStart >= RESULT_TIMEOUT_MS) {
        if (fotoFb) {
          esp_camera_fb_return(fotoFb);
          fotoFb = NULL;
        }
        lcdBaris("Gagal Kirim", "/ Coba Lagi");
        stateStart = now;
        state = STATE_DONE;
      }
      break;

    case STATE_DONE:
      if (now - stateStart >= 2000) {
        tareKg = 0;
        lastStable = 0;
        btnPerluRelease = false; // tekan berikutnya langsung tampil "Sedang Memfoto"
        lcdBaris("Tekan Tombol", "/ Untuk Memfoto");
        state = STATE_IDLE;
      }
      break;
  }

  delay(20);
}