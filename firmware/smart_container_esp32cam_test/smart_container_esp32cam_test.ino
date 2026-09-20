/*
 * ESP32-CAM FULL TEST - smart container
 * HX711 (berat) + LCD I2C (bit-bang) + kamera + MQTT (Railway) -> backend Roboflow
 *
 * Bagian yang diubah dari versi sebelumnya ditandai dengan komentar "FIX:".
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
#define HX711_DT_PIN 2 // FIX: GPIO16 = CS PSRAM di ESP32-CAM, jangan dipakai. GPIO2 strapping pin: kalau upload gagal, lepas kabel DT sebentar.
#define HX711_SCK_PIN 15
#define BTN_PIN 12 // tombol ke GND (aman untuk strapping pin GPIO12)
#define CALIBRATION_FACTOR 450.0

// ---------------- Parameter perilaku ----------------
#define RESULT_TIMEOUT_MS 20000
#define WIFI_TIMEOUT_MS 30000
#define HX711_TIMEOUT_MS 1000
#define BTN_DEBOUNCE_MS 50
#define FOTO_FRAME_SIZE FRAMESIZE_VGA // FIX: sebelumnya UXGA padahal pesan/log bilang VGA. Boleh dinaikkan (SVGA/XGA/UXGA), publish sekarang di-stream.
#define MQTT_BUFFER 4096              // FIX: cukup untuk header + pesan result; foto dikirim per-chunk
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
//  I2C bit-bang (dipakai karena pin default Wire bentrok dengan kamera)
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

  // FIX: dipakai untuk scan I2C yang benar-benar lewat pin LCD (13/14)
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
  using Print::write; // FIX: supaya overload write() bawaan Print tidak tersembunyi

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
  // FIX: sebelumnya hanya mengubah variabel, baru berlaku di tulis berikutnya
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

  // FIX: tulis tepat _cols karakter (dipotong / diisi spasi), tidak menulis melebihi lebar layar
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

Preferences prefs;
float scaleFaktor = CALIBRATION_FACTOR;
camera_fb_t *fotoFb = NULL;
bool kameraAktif = false;
volatile bool gotResult = false;
bool latestStatusOk = false;
String latestResultDetail = "";
unsigned long resultStart = 0;
bool modeProduksi = false; // FIX: mode tombol sekarang berupa flag, bukan while(true) yang mengunci serial

// =====================================================================
//  LCD helper
// =====================================================================
void lcdBaris(const char *atas, const char *bawah)
{
  lcd.printLine(0, atas);
  lcd.printLine(1, bawah);
}

void lcdBarisString(const String &atas, const String &bawah)
{
  lcdBaris(atas.c_str(), bawah.c_str());
}

// =====================================================================
//  Timbangan
// =====================================================================
// FIX: sebelumnya get_units() bisa menggantung selamanya kalau HX711 tidak terpasang,
// dan hasil error diam-diam dianggap 0 gram. Sekarang ada timeout dan status sukses/gagal.
bool readGrams(float &g)
{
  if (!scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    return false;
  float v = scale.get_units(5); // rata-rata 5 sampel (sebelumnya 1 sampel = noisy)
  if (isnan(v) || isinf(v) || fabsf(v) > 1000000.0f)
    return false;
  g = v;
  return true;
}

void simpanKalibrasi(float factor)
{
  prefs.begin("sppg", false);
  prefs.putFloat("SCALE_FACTOR", factor);
  prefs.end();
  scaleFaktor = factor;
  scale.set_scale(scaleFaktor);
  Serial.printf("KALIBRASI TERSIMPAN: %.2f\n", factor);
}

float muatKalibrasi()
{
  prefs.begin("sppg", false);
  float factor = prefs.getFloat("SCALE_FACTOR", 0);
  prefs.end();
  return factor > 0 ? factor : CALIBRATION_FACTOR;
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
  config.frame_size = FOTO_FRAME_SIZE;

  // FIX: sebelumnya kamera di-SKIP total kalau PSRAM tidak ada, sehingga cabang fallback di bawah tidak pernah jalan.
  if (psram)
  {
    config.jpeg_quality = 10;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_LATEST;
  }
  else
  {
    config.jpeg_quality = 12;
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
  kameraAktif = true;

  // FIX: beberapa frame pertama sering gelap/over-exposed sebelum auto-exposure stabil
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
  if (!kameraAktif)
    return false;
  if (fotoFb)
  {
    esp_camera_fb_return(fotoFb);
    fotoFb = NULL;
  }
  // FIX: buang 1 frame lama di buffer supaya foto = kondisi terkini
  camera_fb_t *stale = esp_camera_fb_get();
  if (stale)
    esp_camera_fb_return(stale);
  fotoFb = esp_camera_fb_get();
  return fotoFb != NULL;
}

// =====================================================================
//  WiFi & MQTT
// =====================================================================
// FIX: WiFi sekarang bisa disambung ulang dari mana saja (sebelumnya hanya di autoTest & perintah M)
bool ensureWifi(uint32_t timeoutMs = WIFI_TIMEOUT_MS)
{
  if (WiFi.status() == WL_CONNECTED)
    return true;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // upload foto lebih stabil tanpa modem sleep
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs)
  {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
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
  Serial.printf("MQTT RX [%s]: %s\n", topic, msg.c_str());

  if (strcmp(topic, topicResult) == 0)
  {
    // FIX: toleran terhadap spasi di JSON ("status": "sukses")
    String compact = msg;
    compact.replace(" ", "");
    latestStatusOk = compact.indexOf("\"status\":\"sukses\"") >= 0;
    latestResultDetail = msg;
    gotResult = true;
  }
  else if (strcmp(topic, topicMaintenance) == 0)
  {
    Serial.printf("MAINTENANCE: %s\n", msg.c_str());
  }
}

bool ensureMqtt()
{
  if (mqttClient.connected())
    return true;
  if (!ensureWifi())
  {
    Serial.println("WiFi belum tersambung, MQTT dilewati.");
    return false;
  }

  for (int tries = 0; tries < 5 && !mqttClient.connected(); tries++)
  {
    String clientId = String("mbg-test-container-") + String((uint32_t)ESP.getEfuseMac());
    bool ok = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    // FIX: connect() mengembalikan bool; kode alasan sebenarnya ada di state()
    Serial.printf("MQTT connect... %s (state=%d)\n", ok ? "OK" : "GAGAL", mqttClient.state());
    if (!ok)
      delay(1000);
  }

  if (mqttClient.connected())
  {
    mqttClient.subscribe(topicMaintenance);
    mqttClient.subscribe(topicResult);
    Serial.println("MQTT TERHUBUNG & subscribe topic.");
    // FIX: buang pesan lama (mis. retained) yang langsung dikirim broker setelah subscribe
    pumpMqtt(300);
    gotResult = false;
    return true;
  }
  Serial.println("MQTT GAGAL - cek broker Railway/username");
  return false;
}

// FIX: foto dikirim per-chunk lewat beginPublish/write/endPublish.
// Sebelumnya publish() harus memuat seluruh foto di buffer 128KB; foto UXGA
// sering lebih besar dari itu sehingga publish diam-diam GAGAL.
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
      Serial.println("Tulis foto ke socket gagal - putuskan koneksi MQTT.");
      mqttClient.disconnect(); // stream MQTT sudah rusak, harus reconnect
      return false;
    }
    sent += n;
  }
  return mqttClient.endPublish();
}

// =====================================================================
//  I2C scan
// =====================================================================
// FIX: sebelumnya memakai Wire.begin() di pin default (SDA=21, SCL=22) yang adalah pin kamera,
// dan sama sekali tidak menyentuh bus LCD (13/14). Sekarang scan lewat bus bit-bang yang sama dengan LCD.
void scanI2C()
{
  Serial.printf("Scan I2C bit-bang (SDA=%d, SCL=%d)...\n", LCD_SDA_PIN, LCD_SCL_PIN);
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++)
  {
    if (lcdBus.probe(addr))
    {
      Serial.printf("  Device di 0x%02X\n", addr);
      found++;
    }
  }
  if (!found)
    Serial.println("  Tidak ditemukan. Cek kabel SDA/SCL, VCC, dan pull-up.");
  else
    Serial.printf("  Total %d device.\n", found);
}

// =====================================================================
//  Full test: meta + foto -> backend -> result
// =====================================================================
void testPublishFoto(float beratKg)
{
  if (!kameraAktif)
  {
    Serial.println("Kamera tidak aktif (init gagal). Perintah foto dilewati.");
    lcdBaris("Kamera di-skip", "init gagal");
    return;
  }
  if (!ensureMqtt())
  {
    lcdBaris("MQTT GAGAL", "kirim dibatalkan");
    return;
  }
  if (beratKg < 0)
    beratKg = 0;

  gotResult = false;
  latestStatusOk = false;
  latestResultDetail = "";

  // FIX: ambil foto DULU, baru publish meta. Sebelumnya meta terkirim lebih dulu
  // sehingga kalau foto gagal, backend menerima meta yatim tanpa foto.
  lcdBaris("Ambil foto...", "");
  if (!capturePhoto())
  {
    Serial.println("FOTO GAGAL - meta tidak dikirim, cek kamera.");
    lcdBaris("Foto GAGAL", "cek kamera");
    return;
  }

  String meta = String("{\"beratKg\":") + String(beratKg, 3) + String("}");
  bool okMeta = mqttClient.publish(topicMeta, meta.c_str(), false);
  Serial.printf("PUBLISH meta: %s -> %s\n", meta.c_str(), okMeta ? "OK" : "GAGAL");

  delay(100);
  Serial.printf("FOTO: %u byte (%ux%u). Publish ke %s ...\n",
                (unsigned)fotoFb->len, (unsigned)fotoFb->width, (unsigned)fotoFb->height, topicFoto);
  lcdBaris("Kirim foto...", "");
  bool okFoto = publishFoto(fotoFb->buf, fotoFb->len);
  Serial.printf("Publish foto: %s\n", okFoto ? "OK" : "GAGAL");
  esp_camera_fb_return(fotoFb);
  fotoFb = NULL;

  if (!okMeta || !okFoto)
  {
    lcdBaris("Kirim GAGAL", "cek MQTT/WiFi");
    return;
  }

  lcdBaris("Menunggu hasil", "Roboflow...");
  resultStart = millis();
  while (!gotResult && millis() - resultStart < RESULT_TIMEOUT_MS)
  {
    if (!mqttClient.loop()) // FIX: berhenti menunggu kalau koneksi putus
    {
      Serial.println("MQTT terputus saat menunggu result.");
      break;
    }
    delay(20);
  }

  if (gotResult)
  {
    Serial.printf("RESULT diterima: status=%s detail=%s\n",
                  latestStatusOk ? "SUKSES" : "GAGAL",
                  latestResultDetail.c_str());
    if (latestStatusOk)
      lcdBaris("TEST OK!", "/ Kirim Sukses");
    else
      lcdBaris("TEST Result", "/ Gagal");
  }
  else
  {
    Serial.printf("TIMEOUT %d ms tanpa result. Cek backend/roboflow.\n", RESULT_TIMEOUT_MS);
    lcdBaris("TEST:", "Timeout Result");
  }
}

void autoTest()
{
  delay(500);
  Serial.println("--- AUTO TEST DIMULAI ---");

  lcdBaris("Menghubungkan", "WiFi ...");
  Serial.print("WiFi connect");
  if (ensureWifi())
  {
    String ip = WiFi.localIP().toString();
    Serial.printf("WiFi OK, IP=%s RSSI=%d\n", ip.c_str(), WiFi.RSSI());
    lcdBaris("WiFi OK!", ip.c_str());
  }
  else
  {
    Serial.println("WiFi GAGAL - cek SSID/pass");
    lcdBaris("WiFi GAGAL", "cek SSID/pass");
  }
  delay(1500);

  if (WiFi.status() == WL_CONNECTED)
  {
    lcdBaris("Hubung MQTT", "Railway broker");
    if (ensureMqtt())
    {
      lcdBaris("MQTT OK", "subscribe siap");
      delay(1200);
    }
    else
    {
      lcdBaris("MQTT GAGAL", "cek broker/akun");
      delay(2000);
    }
  }

  lcdBaris("Tare Loadcell", "tunggu...");
  if (scale.wait_ready_timeout(3000, 100))
  {
    scale.tare();
    Serial.println("TARE OK (auto)");
    lcdBaris("Tare OK", "siap ukur gram");
  }
  else
  {
    Serial.println("HX711 TIDAK SIAP - skip tare (cek VCC/GND/kabel)");
    lcdBaris("HX711 tak siap", "cek VCC/GND/kabel");
  }
  delay(1200);

  scale.set_scale(scaleFaktor);
  float g = 0;
  if (readGrams(g))
  {
    Serial.printf("BERAT saat ini: %.1f gram\n", g);
  }
  else
  {
    g = 0; // untuk full test, jalur kamera+MQTT tetap dites dengan berat 0
    Serial.println("HX711 gagal dibaca - test foto tetap jalan dengan berat 0 g.");
  }

  if (mqttClient.connected())
  {
    if (kameraAktif)
    {
      lcdBaris("Kirim Foto", "ke Roboflow...");
      delay(800);
      testPublishFoto(g / 1000.0f);
    }
    else
    {
      lcdBaris("Kamera di-skip", "init gagal");
      Serial.println("Full test foto dilewati (kamera tidak aktif).");
      delay(1500);
    }
  }
  else
  {
    lcdBaris("SKIP Full Test", "MQTT belum OK");
    delay(1500);
  }

  Serial.println("--- AUTO TEST SELESAI ---");
}

// =====================================================================
//  Mode produksi (tombol GPIO12)
// =====================================================================
// FIX: sebelumnya while(true) tanpa debounce, tanpa menunggu tombol dilepas (menahan tombol = kirim berulang),
// dan tidak bisa keluar. Sekarang dipanggil dari loop(), ada debounce, dan 'X' bisa toggle.
void handleButton()
{
  if (digitalRead(BTN_PIN) != LOW)
    return;
  delay(BTN_DEBOUNCE_MS);
  if (digitalRead(BTN_PIN) != LOW)
    return; // hanya noise

  float g;
  if (readGrams(g))
  {
    Serial.printf("Manual trigger: kirim %.3f kg\n", g / 1000.0f);
    testPublishFoto(g / 1000.0f);
  }
  else
  {
    Serial.println("HX711 TIDAK SIAP - pengiriman dibatalkan (cek VCC/GND/kabel).");
    lcdBaris("HX711 tak siap", "cek kabel");
  }

  while (digitalRead(BTN_PIN) == LOW) // tunggu dilepas
  {
    mqttClient.loop();
    delay(20);
  }
  delay(BTN_DEBOUNCE_MS);
}

// =====================================================================
//  Perintah serial
// =====================================================================
void handleCommand(String cmd)
{
  cmd.trim();
  if (cmd.length() == 0)
    return;
  char c = toupper(cmd[0]);
  String arg = cmd.substring(1); // FIX: "S1000" dan "S 1000" sama-sama terbaca
  arg.trim();

  if (c == 'W')
  {
    float g;
    if (readGrams(g))
    {
      Serial.printf("BERAT: %.1f gram\n", g);
      lcdBarisString("Berat:", String(g, 1) + " g");
    }
    else
    {
      Serial.println("HX711 TIDAK SIAP - cek VCC/GND/kabel");
      lcdBaris("HX711 tak siap", "cek VCC/GND/kabel");
    }
  }
  else if (c == 'T')
  {
    if (scale.wait_ready_timeout(3000, 100))
    {
      scale.tare();
      Serial.println("TARE OK");
    }
    else
    {
      Serial.println("HX711 TIDAK SIAP - cek VCC/GND/kabel");
    }
  }
  else if (c == 'S')
  {
    long known = arg.toInt();
    if (known <= 0)
    {
      Serial.println("Gunakan: S 1000  (tare tanpa beban dulu, lalu letakkan beban 1000 g)");
    }
    else if (!scale.wait_ready_timeout(3000, 100))
    {
      Serial.println("HX711 TIDAK SIAP - cek VCC/GND/kabel");
    }
    else
    {
      float raw = scale.get_value(10);
      if (raw <= 0)
      {
        Serial.println("Raw <= 0. Pastikan sudah tare tanpa beban & beban sudah di atas timbangan. "
                       "Kalau tetap negatif, tukar kabel sinyal load cell (A+/A-).");
      }
      else
      {
        float factor = raw / (float)known;
        simpanKalibrasi(factor);
        Serial.printf("Faktor baru: %.2f (raw=%.1f / %ldg)\n", factor, raw, known);
      }
    }
  }
  else if (c == 'Z')
  {
    Serial.printf("Faktor aktif: %.2f | tersimpan: %.2f\n", scaleFaktor, muatKalibrasi());
  }
  else if (c == 'B')
  {
    scanI2C();
  }
  else if (c == 'C')
  {
    if (capturePhoto())
    {
      Serial.printf("FOTO: %u byte, %ux%u\n", (unsigned)fotoFb->len,
                    (unsigned)fotoFb->width, (unsigned)fotoFb->height);
      esp_camera_fb_return(fotoFb);
      fotoFb = NULL;
    }
    else
    {
      Serial.println("FOTO GAGAL.");
    }
  }
  else if (c == 'M')
  {
    bool wifiOk = ensureWifi();
    bool mqttOk = wifiOk && ensureMqtt();
    Serial.printf("WiFi: %s RSSI %d | MQTT: %d\n",
                  wifiOk ? "OK" : "GAGAL", WiFi.RSSI(), mqttOk ? 1 : 0);
  }
  else if (c == 'P')
  {
    float berat = 0.2f;
    if (arg.length() > 0)
      berat = arg.toFloat();
    Serial.printf("FULL TEST: kirim berat=%.3f kg\n", berat);
    testPublishFoto(berat); // ensureMqtt() dipanggil di dalamnya
  }
  else if (c == 'Y')
  {
    scale.set_scale(scaleFaktor);
    float g;
    if (readGrams(g))
    {
      Serial.printf("LIVE BERAT: %.2f gram -> kirim %.3f kg\n", g, g / 1000.0f);
      testPublishFoto(g / 1000.0f);
    }
    else
    {
      Serial.println("HX711 TIDAK SIAP - test dibatalkan (cek VCC/GND/kabel).");
    }
  }
  else if (c == 'X')
  {
    modeProduksi = !modeProduksi;
    if (modeProduksi)
      Serial.println("Mode produksi manual AKTIF: tekan tombol GPIO12 untuk foto & publish. Ketik X lagi untuk keluar.");
    else
      Serial.println("Mode produksi manual NONAKTIF.");
  }
  else
  {
    Serial.println("Perintah tidak dikenal.");
  }
}

// =====================================================================
//  setup / loop
// =====================================================================
void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP32-CAM FULL TEST ===");

  lcdBus.begin();
  if (!lcdBus.probe(LCD_ADDR))
    Serial.printf("[setup] PERINGATAN: LCD tidak merespon di 0x%02X - cek kabel SDA/SCL atau alamat (perintah B).\n", LCD_ADDR);
  lcd.begin(LCD_COLS, LCD_ROWS);
  lcd.setBacklight(true);
  lcdBaris("TEST MODE", "/ ESP32-CAM");
  Serial.println("[setup] LCD init selesai");

  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scaleFaktor = muatKalibrasi();
  Serial.printf("Scale factor: %.2f\n", scaleFaktor);
  scale.set_scale(scaleFaktor);
  // FIX: sebelumnya selalu mencetak "HX711 OK" tanpa memeriksa apa pun
  if (scale.wait_ready_timeout(1000, 10))
    Serial.println("[setup] HX711 OK");
  else
    Serial.println("[setup] HX711 TIDAK merespon - cek VCC/GND/kabel/pin");

  pinMode(BTN_PIN, INPUT_PULLUP);

  snprintf(topicMeta, sizeof(topicMeta), "%s/smart-container/meta", MQTT_PREFIX);
  snprintf(topicFoto, sizeof(topicFoto), "%s/smart-container/foto", MQTT_PREFIX);
  snprintf(topicResult, sizeof(topicResult), "%s/smart-container/result", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);

  initCamera();

  if (!mqttClient.setBufferSize(MQTT_BUFFER))
    Serial.println("[setup] PERINGATAN: alokasi buffer MQTT gagal");
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);    // FIX: default 15 dtk terlalu pendek untuk selang delay() panjang
  mqttClient.setSocketTimeout(15);
  Serial.println("[setup] MQTT config OK");

  autoTest();

  Serial.println("COMMAND (ketik + Enter):");
  Serial.println("  W        -> baca berat (gram)");
  Serial.println("  T        -> tare / nol-kan");
  Serial.println("  S <g>    -> kalibrasi: tare tanpa beban, letakkan massa <g>, ketik S 1000");
  Serial.println("  Z        -> status faktor kalibrasi");
  Serial.println("  B        -> scan I2C (bus LCD)");
  Serial.println("  C        -> capture foto & ukuran byte");
  Serial.println("  M        -> tes WiFi+MQTT (connect+subscribe)");
  Serial.println("  P [kg]   -> FULL TEST: publish meta+foto -> backend Roboflow -> terima result");
  Serial.println("  Y        -> FULL TEST berat live (baca HX711 lalu kirim)");
  Serial.println("  X        -> toggle mode produksi manual (tombol GPIO12)");
}

void loop()
{
  if (Serial.available())
  {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }

  if (modeProduksi)
    handleButton();

  mqttClient.loop();
  delay(20);
}