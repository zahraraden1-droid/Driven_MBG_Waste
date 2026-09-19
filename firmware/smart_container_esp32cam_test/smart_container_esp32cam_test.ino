#include "esp_camera.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <HX711.h>
#include <Preferences.h>

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

#define LCD_ADDR 0x27
#define LCD_COLS 16
#define LCD_ROWS 2
#define LCD_SDA_PIN 13
#define LCD_SCL_PIN 14
#define HX711_DT_PIN 16
#define HX711_SCK_PIN 15
#define BTN_PIN 12
#define CALIBRATION_FACTOR 450.0
#define RESULT_TIMEOUT_MS 20000

const char *WIFI_SSID = "R-408";
const char *WIFI_PASS = "*ruang408";
const char *MQTT_SERVER = "tramway.proxy.rlwy.net";
const uint16_t MQTT_PORT = 55251;
const char *MQTT_USER = "mbg_device";
const char *MQTT_PASS = "5vfa4wltLH3v30B2WqlUlTp";
const char *MQTT_PREFIX = "mbg";

class BitBangI2C
{
public:
  BitBangI2C(uint8_t sda, uint8_t scl) : _sda(sda), _scl(scl) {}
  void begin() { pinMode(_sda, OUTPUT); pinMode(_scl, OUTPUT); digitalWrite(_sda, HIGH); digitalWrite(_scl, HIGH); }
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
  void beginTransmission(uint8_t addr) { start(); writeByte(addr << 1); }
  void write(uint8_t data) { writeByte(data); }
  void endTransmission() { stop(); }

private:
  uint8_t _sda;
  uint8_t _scl;
};

class PCF8574LCD : public Print
{
public:
  PCF8574LCD(uint8_t addr, BitBangI2C *bus) : _addr(addr), _bus(bus), _backlight(0x08) {}
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
  void setBacklight(uint8_t on) { _backlight = (on ? 0x08 : 0x00); }
  void setCursor(uint8_t col, uint8_t row) { command(0x80 | (row == 0 ? 0x00 : 0x40) | col); }
  virtual size_t write(uint8_t c) { writeByte(c, true); return 1; }
  void command(uint8_t value) { writeByte(value, false); }
  void clear() { command(0x01); delay(2); }

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
bool gotResult = false;
bool latestStatusOk = false;
String latestResultDetail = "";
unsigned long resultStart = 0;

void lcdBaris(const char *atas, const char *bawah)
{
  lcd.setCursor(0, 0);
  lcd.print(atas);
  lcd.print("                ");
  lcd.setCursor(0, 1);
  lcd.print(bawah);
  lcd.print("                ");
}

void lcdBarisString(String atas, String bawah)
{
  lcd.setCursor(0, 0);
  lcd.print(atas);
  lcd.print("                ");
  lcd.setCursor(0, 1);
  lcd.print(bawah);
  lcd.print("                ");
}

float readLbs()
{
  float v = scale.get_units(1);
  if (isnan(v) || v > 1000000)
    v = 0;
  return v;
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

void probeSensorId()
{
  Serial.println("[probe] Scan SCCB di pin 26/27 (bus I2C0)...");
  Wire.begin(SIOD_GPIO_NUM, SIOC_GPIO_NUM);
  bool ada = false;
  for (uint8_t addr = 0x20; addr < 0x40; addr++)
  {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0)
    {
      ada = true;
      uint8_t regs[4] = {0x0A, 0x0B, 0x0C, 0x0D};
      Serial.printf("[probe] Sensor merespons di 0x%02X:", addr);
      for (int i = 0; i < 4; i++)
      {
        Wire.beginTransmission(addr);
        Wire.write(regs[i]);
        Wire.endTransmission(false);
        Wire.requestFrom(addr, (uint8_t)1);
        uint8_t v = Wire.available() ? Wire.read() : 0xFF;
        Serial.printf(" reg0x%02X=0x%02X", regs[i], v);
      }
      Serial.println();
    }
  }
  if (!ada)
  {
    Serial.println("[probe] TIDAK ADA sensor merespons di 0x20-0x3F.");
  }
  Wire.end();
}

void initCamera()
{
  probeSensorId();
  if (!psramFound())
  {
    Serial.println("[camera] PSRAM TIDAK ADA. Kamera DI-SKIP. Aktifkan Tools->PSRAM di Arduino IDE.");
    return;
  }
  Serial.println("[camera] PSRAM OK.");
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
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;

  esp_err_t res = esp_camera_init(&config);
  if (res != ESP_OK)
  {
    Serial.printf("KAMERA GAGAL INIT: 0x%x\n", res);
    return;
  }
  kameraAktif = true;
  Serial.println("Kamera OK (VGA).");
}

bool capturePhoto()
{
  if (fotoFb)
  {
    esp_camera_fb_return(fotoFb);
    fotoFb = NULL;
  }
  fotoFb = esp_camera_fb_get();
  return fotoFb != NULL;
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String t = String(topic);
  String msg;
  for (unsigned int i = 0; i < length; i++)
    msg += (char)payload[i];
  Serial.printf("MQTT RX [%s]: %s\n", topic, msg.c_str());

  if (t == String(topicResult))
  {
    latestStatusOk = msg.indexOf("\"status\":\"sukses\"") >= 0;
    latestResultDetail = msg;
    gotResult = true;
  }
  else if (t == String(topicMaintenance))
  {
    Serial.printf("MAINTENANCE: %s\n", msg.c_str());
  }
}

bool ensureMqtt()
{
  int tries = 0;
  while (!mqttClient.connected() && tries < 10)
  {
    String clientId = String("mbg-test-container-") + String((uint32_t)ESP.getEfuseMac());
    Serial.printf("MQTT connect... rc=%d\n", mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS));
    if (!mqttClient.connected())
    {
      delay(1000);
      tries++;
    }
  }
  if (mqttClient.connected())
  {
    mqttClient.subscribe(topicMaintenance);
    mqttClient.subscribe(topicResult);
    Serial.println("MQTT TERHUBUNG & subscribe topic.");
    return true;
  }
  Serial.println("MQTT GAGAL - cek broker Railway/username");
  return false;
}

void scanI2C()
{
  Serial.println("Scan I2C bus (via Wire default)...");
  Wire.begin();
  int found = 0;
  for (byte addr = 1; addr < 127; addr++)
  {
    Wire.beginTransmission(addr);
    byte err = Wire.endTransmission();
    if (err == 0)
    {
      Serial.printf("  Device di 0x%02X\n", addr);
      found++;
    }
  }
  if (!found)
    Serial.println("  Tidak ditemukan.");
  else
    Serial.printf("  Total %d device.\n", found);
  Wire.end();
}

void testPublishFoto(float beratKg)
{
  if (!kameraAktif)
  {
    Serial.println("Kamera tidak aktif (PSRAM?). Perintah foto dilewati.");
    lcdBaris("Kamera di-skip", "PSRAM tidak ada");
    return;
  }
  gotResult = false;
  latestStatusOk = false;

  String meta = String("{\"beratKg\":") + String(beratKg, 3) + String("}");
  Serial.printf("PUBLISH meta: %s\n", meta.c_str());
  mqttClient.publish(topicMeta, meta.c_str(), false);

  if (!capturePhoto())
  {
    Serial.println("FOTO GAGAL sebelum publish - cek kamera.");
    return;
  }

  delay(100);
  Serial.printf("FOTO: %u byte. Publish ke %s ...\n", fotoFb->len, topicFoto);
  bool ok = mqttClient.publish(topicFoto, fotoFb->buf, fotoFb->len, false);
  Serial.printf("Publish foto: %s\n", ok ? "OK (buffered)" : "GAGAL / fail");
  esp_camera_fb_return(fotoFb);
  fotoFb = NULL;

  resultStart = millis();
  while (millis() - resultStart < RESULT_TIMEOUT_MS)
  {
    mqttClient.loop();
    if (gotResult)
      break;
    delay(50);
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
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connect");
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t < 400)
  {
    delay(250);
    Serial.print(".");
    t++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
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
  float g = readLbs();
  Serial.printf("BERAT saat ini: %.1f gram\n", g);

  if (mqttClient.connected())
  {
    if (kameraAktif)
    {
      lcdBaris("Kirim Foto VGA", "ke Roboflow...");
      delay(800);
      testPublishFoto(g / 1000.0);
    }
    else
    {
      lcdBaris("Kamera di-skip", "PSRAM tidak ada");
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

void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP32-CAM FULL TEST ===");

  lcd.begin(LCD_COLS, LCD_ROWS);
  lcd.setBacklight(HIGH);
  lcdBaris("TEST MODE", "/ ESP32-CAM");
  Serial.println("[setup] LCD OK");

  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scaleFaktor = muatKalibrasi();
  Serial.printf("Scale factor: %.2f\n", scaleFaktor);
  scale.set_scale(scaleFaktor);
  Serial.println("[setup] HX711 OK");

  pinMode(BTN_PIN, INPUT_PULLUP);

  snprintf(topicMeta, sizeof(topicMeta), "%s/smart-container/meta", MQTT_PREFIX);
  snprintf(topicFoto, sizeof(topicFoto), "%s/smart-container/foto", MQTT_PREFIX);
  snprintf(topicResult, sizeof(topicResult), "%s/smart-container/result", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);

  mqttClient.setBufferSize(131072);
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  Serial.println("[setup] MQTT config OK");

  initCamera();

  autoTest();

  Serial.println("COMAND (ketik + Enter):");
  Serial.println("  W        -> baca berat (gram)");
  Serial.println("  T        -> tare / nol-kan");
  Serial.println("  S <g>    -> kalibrasi: letakkan massa <g> lalu ketik S 1000");
  Serial.println("  Z        -> status faktor kalibrasi");
  Serial.println("  B        -> scan I2C (LCD)");
  Serial.println("  C        -> capture foto & ukuran byte");
  Serial.println("  M        -> tes WiFi+MQTT (connect+subscribe)");
  Serial.println("  P [kg]   -> FULL TEST: publish meta+foto -> backend Roboflow -> terima result");
  Serial.println("  Y        -> FULL TEST berat live (baca HX711 lalu P)");
  Serial.println("  X        -> keluar/mode produksi manual");
}

void loop()
{
  String cmd;
  if (Serial.available())
  {
    cmd = Serial.readStringUntil('\n');
    cmd.trim();
    char c = toupper(cmd[0]);

    if (c == 'W')
    {
      float g = readLbs();
      Serial.printf("BERAT: %.1f gram\n", g);
      lcdBarisString("Berat:", String(g, 1) + " g");
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
      int known = cmd.substring(2).toInt();
      if (known <= 0)
      {
        Serial.println("Gunakan S 1000");
      }
      else
      {
        float raw = scale.get_value(10);
        if (raw <= 0)
        {
          Serial.println("Raw=0. Cek load cell/kolibrasi, pastikan ada beban. (tare dulu?)");
        }
        else
        {
          float factor = raw / known;
          simpanKalibrasi(factor);
          Serial.printf("Faktor baru: %.2f (raw=%.1f / %dg)\n", factor, raw, known);
        }
      }
    }
    else if (c == 'Z')
    {
      float f = muatKalibrasi();
      Serial.printf("Faktor aktif: %.2f\n", f);
    }
    else if (c == 'B')
    {
      scanI2C();
    }
    else if (c == 'C')
    {
      if (capturePhoto())
      {
        Serial.printf("FOTO: %u byte, WxH dibaca dari kamera.\n", fotoFb->len);
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
      if (WiFi.status() != WL_CONNECTED)
      {
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
      }
      ensureMqtt();
      Serial.printf("WiFi: %s RSSI %d | MQTT: %d\n",
                    WiFi.isConnected() ? "OK" : "GAGAL", WiFi.RSSI(),
                    mqttClient.connected() ? 1 : 0);
    }
    else if (c == 'P')
    {
      if (!mqttClient.connected())
        ensureMqtt();
      if (mqttClient.connected())
      {
        float berat = 0.2;
        if (cmd.length() > 2)
          berat = cmd.substring(2).toFloat();
        Serial.printf("FULL TEST: kirim berat=%.3f kg\n", berat);
        testPublishFoto(berat);
      }
      else
      {
        Serial.println("MQTT belum terhubung. Ketik M dulu.");
      }
    }
    else if (c == 'Y')
    {
      if (!mqttClient.connected())
        ensureMqtt();
      if (mqttClient.connected())
      {
        scale.set_scale(scaleFaktor);
        float g = readLbs();
        Serial.printf("LIVE BERAT: %.2f gram -> kirim %.3f kg\n", g, g / 1000.0);
        testPublishFoto(g / 1000.0);
      }
      else
      {
        Serial.println("MQTT belum terhubung. Ketik M dulu.");
      }
    }
    else if (c == 'X')
    {
      Serial.println("Mode produksi manual: tekan tombol gpio12 untuk foto & publish.");
      while (true)
      {
        if (digitalRead(BTN_PIN) == LOW)
        {
          if (!mqttClient.connected())
            ensureMqtt();
          if (mqttClient.connected())
          {
            float g = readLbs() / 1000.0;
            Serial.printf("Manual trigger: kirim %.3f kg\n", g);
            testPublishFoto(g);
          }
        }
        mqttClient.loop();
        delay(50);
      }
    }
  }

  mqttClient.loop();
  delay(20);
}