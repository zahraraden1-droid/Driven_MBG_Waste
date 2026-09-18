#include "esp_camera.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
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
#define BTN_DEBOUNCE_MS 50
#define CALIBRATION_FACTOR 450.0
#define DUMP_DELTA_KG 0.02
#define STABLE_MS 1500
#define RESULT_TIMEOUT_MS 15000
#define CALIB_MODE 1

const char *WIFI_SSID = "R-408";
const char *WIFI_PASS = "*ruang408";
// PRODUCTION: broker MQTT di Railway via TCP proxy tambahan (bukan domain HTTP).
const char *MQTT_SERVER = "tramway.proxy.rlwy.net";
const uint16_t MQTT_PORT = 55251;
const char *MQTT_USER = "mbg_device";
const char *MQTT_PASS = "5vfa4wltLH3v30B2WqlUlTp";
const char *MQTT_PREFIX = "mbg";

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
HX711 scale;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicMeta[128];
char topicFoto[128];
char topicResult[128];
char topicMaintenance[64];

enum State
{
  STATE_IDLE,
  STATE_CAPTURE,
  STATE_DUMP,
  STATE_WEIGH_UPLOAD,
  STATE_DONE
};
State state = STATE_IDLE;

unsigned long stateStart = 0;
unsigned long lastStable = 0;
unsigned long lastMqttAttempt = 0;
bool btnPerluRelease = false;
float tareKg = 0;
float sampleKg = 0;
bool uploadOk = false;
bool gotResult = false;
bool sentData = false;
bool maintenanceAktif = false;
camera_fb_t *fotoFb = NULL;
Preferences prefs;
float scaleFaktor = CALIBRATION_FACTOR;

float readRawGrams()
{
  scale.set_scale(scaleFaktor);
  float gram = scale.get_units(5);
  if (isnan(gram) || gram < 0)
    gram = 0;
  return gram;
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
  if (factor > 0)
  {
    Serial.printf("Memakai faktor tersimpan: %.2f\n", factor);
    return factor;
  }
  Serial.printf("Pakai default CALIBRATION_FACTOR: %.2f\n", CALIBRATION_FACTOR);
  return CALIBRATION_FACTOR;
}

void initCamera()
{
  camera_config_t config;
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

  esp_camera_init(&config);
}

bool capturePhoto()
{
  fotoFb = esp_camera_fb_get();
  return fotoFb != NULL;
}

float readFilteredKg()
{
  scale.set_scale(scaleFaktor);
  float gram = scale.get_units(5);
  if (isnan(gram) || gram < 0)
    gram = 0;
  return gram / 1000.0;
}

void kalibrasiLoop()
{
  Serial.println("=== MODE KALIBRASI & DEBUG ===");
  Serial.println("COMAND (ketik + Enter):");
  Serial.println("  W          -> baca berat sekarang (gram)");
  Serial.println("  T          -> tare (nol-kan)");
  Serial.println("  S <gram>   -> tempatkan massa DIKETAHUI lalu ketik S <gram> (mis: S 1000)");
  Serial.println("  C          -> ambil & simpan foto, tampilkan ukuran byte (tes kamera)");
  Serial.println("  M          -> status WiFi/MQTT/berat/mode");
  Serial.println("  D          -> tampilkan faktor kalibrasi aktif");
  Serial.println("  B          -> pindai LCD alamat I2C");
  Serial.println("  X          -> keluar kalibrasi, lanjut ke mode produksi");

  float rawGram = 0;
  while (true)
  {
    while (Serial.available())
    {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      char c = toupper(cmd[0]);
      if (c == 'W')
      {
        rawGram = readRawGrams();
        Serial.printf("BERAT: %.2f gram (raw scale units)\n", rawGram);
      }
      else if (c == 'T')
      {
        scale.tare();
        Serial.println("TARE OK - nol ditetapkan");
      }
      else if (c == 'S')
      {
        int knownGram = cmd.substring(2).toInt();
        if (knownGram <= 0)
        {
          Serial.println("Gunakan: S <gram> (contoh S 1000)");
        }
        else
        {
          float raw = scale.get_value(10);
          if (raw <= 0)
          {
            Serial.println("Baca raw = 0. Pastikan terdapat massa & sudah tare.");
          }
          else
          {
            float factor = raw / knownGram;
            simpanKalibrasi(factor);
            scale.set_scale(factor);
            Serial.printf("Faktor baru: %.2f (raw=%f / massa=%dg)\n", factor, raw, knownGram);
          }
        }
      }
      else if (c == 'C')
      {
        if (capturePhoto())
        {
          Serial.printf("FOTO OK: %u byte (VGA). Buffer MQTT 128KB.\n", fotoFb->len);
          esp_camera_fb_return(fotoFb);
          fotoFb = NULL;
        }
        else
        {
          Serial.println("FOTO GAGAL - cek pin kamera / kamera");
        }
      }
      else if (c == 'M')
      {
        Serial.printf("WiFi=%s RSSI=%d | MQTT=%d (%s) | maintenance=%s\n",
                      WiFi.isConnected() ? "OK" : "GAGAL",
                      WiFi.RSSI(),
                      mqttClient.connected() ? 1 : 0,
                      mqttClient.connected() ? "terhubung" : "putus",
                      maintenanceAktif ? "ON" : "OFF");
      }
      else if (c == 'D')
      {
        prefs.begin("sppg", false);
        float f = prefs.getFloat("SCALE_FACTOR", CALIBRATION_FACTOR);
        prefs.end();
        Serial.printf("Faktor aktif: %.2f\n", f);
      }
      else if (c == 'B')
      {
        byte err, addr;
        int found = 0;
        for (addr = 1; addr < 127; addr++)
        {
          Wire.beginTransmission(addr);
          err = Wire.endTransmission();
          if (err == 0)
          {
            Serial.printf("I2C device di 0x%02X\n", addr);
            found++;
          }
        }
        if (!found) Serial.println("Tidak ada perangkat I2C ditemukan.");
      }
      else if (c == 'X')
      {
        Serial.println("Keluar mode kalibrasi -> produksi");
        return;
      }
    }
    mqttClient.loop();
    delay(20);
  }
}

void lcdBaris(const char *atas, const char *bawah)
{
  lcd.setCursor(0, 0);
  lcd.print(atas);
  lcd.print("                ");
  lcd.setCursor(0, 1);
  lcd.print(bawah);
  lcd.print("                ");
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String t = String(topic);
  String msg;
  for (unsigned int i = 0; i < length; i++)
  {
    msg += (char)payload[i];
  }

  if (t == String(topicResult))
  {
    gotResult = true;
    uploadOk = msg.indexOf("\"status\":\"sukses\"") >= 0;
  }
  else if (t == String(topicMaintenance))
  {
    maintenanceAktif = msg.indexOf("\"aktif\":true") >= 0;
  }
}

void publishWaste()
{
  String meta = String("{\"beratKg\":") + String(sampleKg, 3) + String("}");
  mqttClient.publish(topicMeta, meta.c_str(), false);
  Serial.printf("PUBLISH meta: %.3f kg\n", sampleKg);

  if (fotoFb)
  {
    bool ok = mqttClient.publish(topicFoto, fotoFb->buf, fotoFb->len, false);
    Serial.printf("PUBLISH foto: %u byte -> %s\n", fotoFb->len, ok ? "OK" : "GAGAL");
  }
}

void setup()
{
  Serial.begin(115200);

  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();

  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scaleFaktor = muatKalibrasi();
  scale.set_scale(scaleFaktor);
  scale.tare();

  pinMode(BTN_PIN, INPUT_PULLUP);

  snprintf(topicMeta, sizeof(topicMeta), "%s/smart-container/meta", MQTT_PREFIX);
  snprintf(topicFoto, sizeof(topicFoto), "%s/smart-container/foto", MQTT_PREFIX);
  snprintf(topicResult, sizeof(topicResult), "%s/smart-container/result", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);

  mqttClient.setBufferSize(131072);
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
  }

  initCamera();
  Serial.printf("Kamera OK (VGA). MAC: %llX\n", (uint64_t)ESP.getEfuseMac());

  if (CALIB_MODE)
  {
    kalibrasiLoop();
  }

  lcdBaris("Tekan Tombol", "/ Untuk Memfoto");
  state = STATE_IDLE;
}

void loop()
{
  float w = readFilteredKg();
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED)
  {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }

  if (!mqttClient.connected() && now - lastMqttAttempt > 5000)
  {
    lastMqttAttempt = now;
    String clientId = String("mbg-container-") + String((uint32_t)ESP.getEfuseMac());
    mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  }
  mqttClient.loop();

  switch (state)
  {
  case STATE_IDLE:
    if (digitalRead(BTN_PIN) == LOW)
    {
      if (lastStable == 0)
        lastStable = now;
      if (now - lastStable >= BTN_DEBOUNCE_MS && !maintenanceAktif)
      {
        if (btnPerluRelease)
        {
          lcdBaris("Tunggu Proses", "/ Sebelumnya Belum");
          lastStable = 0;
        }
        else
        {
          btnPerluRelease = true;
          tareKg = readFilteredKg();
          lastStable = 0;
          lcdBaris("Sedang Memfoto", "/ Model v1");
          stateStart = now;
          state = STATE_CAPTURE;
        }
      }
    }
    else
    {
      if (btnPerluRelease)
      {
        btnPerluRelease = false;
        lcdBaris("Tekan Tombol", "/ Untuk Memfoto");
      }
      lastStable = 0;
    }
    break;

  case STATE_CAPTURE:
    if (now - stateStart >= 500)
    {
      if (capturePhoto())
      {
        lcdBaris("Silahkan Buang", "/ Makanan Sisa");
        stateStart = now;
        lastStable = 0;
        state = STATE_DUMP;
      }
      else
      {
        btnPerluRelease = false;
        lcdBaris("Gagal Foto", "/ Tekan Lagi");
        state = STATE_IDLE;
      }
    }
    break;

  case STATE_DUMP:
    if (w - tareKg > DUMP_DELTA_KG)
    {
      if (lastStable == 0)
        lastStable = now;
      if (now - lastStable >= STABLE_MS)
      {
        sampleKg = w - tareKg;
        if (sampleKg < 0)
          sampleKg = 0;
        lcdBaris("Silahkan Tunggu", "/ Proses Data...");
        stateStart = now;
        lastStable = 0;
        gotResult = false;
        uploadOk = false;
        sentData = false;
        state = STATE_WEIGH_UPLOAD;
      }
    }
    else
    {
      lastStable = 0;
    }
    break;

  case STATE_WEIGH_UPLOAD:
    if (now - stateStart < 300)
      break;

    if (!sentData)
    {
      sentData = true;
      publishWaste();
    }

    if (gotResult && now - stateStart >= 800)
    {
      if (fotoFb)
      {
        esp_camera_fb_return(fotoFb);
        fotoFb = NULL;
      }
      lcdBaris(uploadOk ? "Selesai!" : "Gagal Kirim", uploadOk ? "/ Terima Kasih" : "/ Coba Lagi");
      stateStart = now;
      state = STATE_DONE;
    }
    else if (!gotResult && now - stateStart >= RESULT_TIMEOUT_MS)
    {
      if (fotoFb)
      {
        esp_camera_fb_return(fotoFb);
        fotoFb = NULL;
      }
      lcdBaris("Gagal Kirim", "/ Coba Lagi");
      stateStart = now;
      state = STATE_DONE;
    }
    break;

  case STATE_DONE:
    if (now - stateStart >= 2000)
    {
      tareKg = 0;
      lastStable = 0;
      lcdBaris("Tekan Tombol", "/ Untuk Memfoto");
      state = STATE_IDLE;
    }
    break;
  }

  delay(20);
}