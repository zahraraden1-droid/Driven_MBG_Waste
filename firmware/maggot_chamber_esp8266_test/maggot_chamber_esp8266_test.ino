/*
 * Maggot chamber - ESP8266 FULL TEST
 * Dipakai untuk cek sensor, kalibrasi (HX711 & MQ135), dan uji kirim telemetry ke backend.
 *
 * Bagian yang diubah dari versi sebelumnya ditandai komentar "FIX:".
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <EEPROM.h>
// FIX: <Wire.h> dihapus. Proyek ini tidak punya perangkat I2C.

// ---------------- Pin ----------------
#define DHT_PIN 4        // D2
#define DHT_TYPE DHT22
#define DS18B20_PIN 13   // D7 (butuh pull-up 4.7k ke 3.3V)
#define HX711_DT_PIN 14  // D5
#define HX711_SCK_PIN 12 // D6

// ---------------- HX711 ----------------
#define CALIBRATION_FACTOR 450.0
#define HX711_TIMEOUT_MS 1000

// ---------------- MQ135 ----------------
#define MQ135_RL 10.0         // kOhm. CEK: banyak modul MQ135 memakai RL 1 kOhm, samakan dengan modulmu.
#define MQ135_R0_DEFAULT 30.0 // kOhm
#define MQ135_VCC 5.0
// FIX: 9.8 adalah rasio udara-bersih untuk MQ-2. Untuk MQ135 nilai yang lazim dipakai adalah 3.6 (Rs/R0 di udara bersih).
#define MQ135_CLEAN_AIR_RATIO 3.6
// PENTING: tegangan AO sensor yang menghasilkan raw=1023 di A0. Nilai 5.0 hanya benar kalau ada pembagi
// tegangan 5V -> 3.3V antara AO dan A0 (mis. 10k seri + 20k ke GND). Tanpa pembagi, A0 bisa rusak.
#define ADC_FULLSCALE_AO_V 5.0
#define ADC_SAMPLES 16
#define NH3_PPM_MAX 500.0

// ---------------- MQTT / umum ----------------
#define SEND_INTERVAL_MS 30000
#define EEPROM_ADDR_SCALE 0
#define EEPROM_ADDR_R0 8

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
const char *BATCH_ID = SECRET_BATCH_ID;

DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicChamber[128];
char topicChamberResult[128];
char topicMaintenance[64];

bool maintenanceAktif = false;
volatile bool gotResult = false;
String latestResultDetail = "";
float scaleFaktor = CALIBRATION_FACTOR;
float mq135R0 = MQ135_R0_DEFAULT;
bool produksiLoop = false;
unsigned long lastSend = 0;
unsigned long lastReconnect = 0;

// ======================================================================
//  Kalibrasi (EEPROM)
// ======================================================================
bool validCal(float v)
{
  return !isnan(v) && !isinf(v) && v > 0.1f && v < 1000000.0f;
}

void loadCalibration()
{
  EEPROM.begin(16);
  float s = 0, r = 0;
  EEPROM.get(EEPROM_ADDR_SCALE, s);
  EEPROM.get(EEPROM_ADDR_R0, r);
  EEPROM.end();
  // FIX: nilai divalidasi (flash kosong/sampah bisa lolos cek "> 0")
  if (validCal(s))
  {
    scaleFaktor = s;
    Serial.printf("Faktor scale tersimpan: %.2f\n", scaleFaktor);
  }
  if (validCal(r))
  {
    mq135R0 = r;
    Serial.printf("R0 MQ135 tersimpan: %.2f\n", mq135R0);
  }
  if (!validCal(s) || !validCal(r))
    Serial.printf("Pakai default: scale=%.2f R0=%.2f\n", scaleFaktor, mq135R0);
}

void saveScaleFactor(float f)
{
  EEPROM.begin(16);
  EEPROM.put(EEPROM_ADDR_SCALE, f);
  EEPROM.commit();
  EEPROM.end();
}

void saveMq135R0(float r)
{
  EEPROM.begin(16);
  EEPROM.put(EEPROM_ADDR_R0, r);
  EEPROM.commit();
  EEPROM.end();
}

// ======================================================================
//  WiFi & MQTT
// ======================================================================
void initWifi()
{
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connect");
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t < 100)
  {
    delay(250);
    Serial.print(".");
    t++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("WiFi OK, IP=%s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("WiFi GAGAL - cek SSID/pass");
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++)
    msg += (char)payload[i];

  if (strcmp(topic, topicChamberResult) == 0)
  {
    Serial.printf("MQTT RESULT: %s\n", msg.c_str());
    latestResultDetail = msg;
    gotResult = true;
  }
  else if (strcmp(topic, topicMaintenance) == 0)
  {
    String compact = msg;
    compact.replace(" ", ""); // FIX: toleran terhadap spasi di JSON
    maintenanceAktif = compact.indexOf("\"aktif\":true") >= 0;
    Serial.printf("MAINTENANCE: %s\n", msg.c_str());
  }
}

bool connectMqtt()
{
  int tries = 0;
  while (!mqttClient.connected() && tries < 10)
  {
    String clientId = String("mbg-test-chamber-") + String(ESP.getChipId());
    bool ok = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    // FIX: connect() mengembalikan bool; kode alasan ada di state()
    Serial.printf("MQTT connect %s (state=%d)\n", ok ? "OK" : "GAGAL", mqttClient.state());
    if (!ok)
    {
      delay(1000);
      tries++;
    }
  }
  if (mqttClient.connected())
  {
    mqttClient.subscribe(topicMaintenance);
    mqttClient.subscribe(topicChamberResult);
    Serial.println("MQTT OK & subscribe.");
    // FIX: buang pesan lama (mis. retained) yang langsung dikirim broker setelah subscribe
    unsigned long t0 = millis();
    while (millis() - t0 < 300)
    {
      mqttClient.loop();
      delay(10);
    }
    gotResult = false;
    return true;
  }
  Serial.println("MQTT GAGAL.");
  return false;
}

// ======================================================================
//  Sensor (NAN = pembacaan gagal)
// ======================================================================
bool readDht(float &t, float &h)
{
  for (int i = 0; i < 2; i++)
  {
    t = dht.readTemperature();
    h = dht.readHumidity();
    if (!isnan(t) && !isnan(h))
      return true;
    delay(2100); // DHT22 minimal 2 detik antar pembacaan
  }
  t = NAN;
  h = NAN;
  return false;
}

// FIX: getTempCByIndex() mengembalikan -127.0 (DEVICE_DISCONNECTED_C) saat sensor lepas, bukan NaN.
float readSuhuSubstrat()
{
  for (int i = 0; i < 2; i++)
  {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C || isnan(t))
      return NAN;
    if (t != 85.0f) // 85.0 = nilai power-on/konversi belum selesai
      return t;
  }
  return NAN;
}

float readAdcAvg()
{
  long sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++)
  {
    sum += analogRead(A0);
    delay(2);
  }
  return sum / (float)ADC_SAMPLES;
}

// FIX: sebelumnya bernama readNH3RawPpm() padahal mengembalikan Rs (kOhm), bukan ppm.
float readMq135Rs()
{
  float v = readAdcAvg() * (ADC_FULLSCALE_AO_V / 1023.0f);
  if (v <= 0.02f || v >= MQ135_VCC)
    return NAN;
  return MQ135_RL * (MQ135_VCC - v) / v;
}

float readNH3Ppm()
{
  float rs = readMq135Rs();
  if (isnan(rs) || mq135R0 <= 0)
    return NAN;
  float ratio = rs / mq135R0;
  float ppm = 10.938f * powf(ratio, -1.774f);
  if (isnan(ppm))
    return NAN;
  if (ppm > NH3_PPM_MAX)
    ppm = NH3_PPM_MAX;
  return ppm;
}

// FIX: semua pembacaan HX711 sekarang punya timeout. Sebelumnya get_units()/get_value()/tare()
// menggantung selamanya kalau HX711 tidak terpasang (perintah R, S, T, V dan telemetry bisa hang).
bool readBeratGram(float &g)
{
  if (!scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    return false;
  scale.set_scale(scaleFaktor);
  float v = scale.get_units(5);
  if (isnan(v) || isinf(v))
    return false;
  g = v < 0 ? 0 : v;
  return true;
}

bool readRawCounts(float &raw)
{
  if (!scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    return false;
  raw = scale.get_value(10);
  return !isnan(raw) && !isinf(raw);
}

// FIX: sebelumnya scanI2C() memakai Wire.begin() di pin default (SDA=GPIO4 = pin DHT!) dan tidak ada
// perangkat I2C di proyek ini. DS18B20 memakai 1-Wire, jadi scan yang benar adalah 1-Wire.
void scanOneWire()
{
  Serial.printf("Scan 1-Wire di GPIO%d...\n", DS18B20_PIN);
  uint8_t addr[8];
  int found = 0;
  oneWire.reset_search();
  while (oneWire.search(addr))
  {
    Serial.print("  Device: ");
    for (int i = 0; i < 8; i++)
      Serial.printf("%02X", addr[i]);
    bool crcOk = OneWire::crc8(addr, 7) == addr[7];
    Serial.printf(" (%s%s)\n", addr[0] == 0x28 ? "DS18B20" : "family lain", crcOk ? "" : ", CRC salah");
    found++;
  }
  oneWire.reset_search();
  if (!found)
    Serial.println("  Tidak ada device. Cek kabel data dan resistor pull-up 4.7k ke 3.3V.");
}

String fmt(float v, int decimals)
{
  return isnan(v) ? String("GAGAL") : String(v, decimals);
}

void dumpSensors()
{
  float t, h;
  readDht(t, h);
  float su = readSuhuSubstrat();
  float rs = readMq135Rs();
  float ppm = readNH3Ppm();
  float berat = NAN, raw = NAN;
  float tmp;
  if (readBeratGram(tmp))
    berat = tmp;
  if (readRawCounts(tmp))
    raw = tmp;

  Serial.println("--- SENSOR DUMP ---");
  Serial.printf("DHT22   suhu udara : %s C\n", fmt(t, 2).c_str());
  Serial.printf("DHT22   kelembaban : %s %%\n", fmt(h, 2).c_str());
  Serial.printf("DS18B20 substrat   : %s C\n", fmt(su, 2).c_str());
  Serial.printf("MQ135   Rs         : %s kOhm, R0=%.2f, ppm=%s\n", fmt(rs, 2).c_str(), mq135R0, fmt(ppm, 2).c_str());
  Serial.printf("HX711   berat      : %s g (factor=%.2f, raw=%s)\n", fmt(berat, 1).c_str(), scaleFaktor, fmt(raw, 0).c_str());
}

// ======================================================================
//  Telemetry
// ======================================================================
void addField(String &body, const char *name, float value, int decimals, bool last)
{
  body += "\"";
  body += name;
  body += "\":";
  if (isnan(value))
    body += "null";
  else
    body += String(value, decimals);
  if (!last)
    body += ",";
}

// FIX: format & perlakuan error disamakan dengan sketch produksi (null, bukan 0 / -127).
void sendTelemetry()
{
  float suhuUdara, kelembaban;
  readDht(suhuUdara, kelembaban);
  float amonia = readNH3Ppm();
  float substrat = readSuhuSubstrat();
  float berat = NAN;
  float g;
  if (readBeratGram(g))
    berat = g / 1000.0f;

  String body = String("{");
  body += "\"batchId\":\"" + String(BATCH_ID) + "\",";
  addField(body, "suhuBilikC", suhuUdara, 1, false);
  addField(body, "kelembabanPersen", kelembaban, 1, false);
  addField(body, "kadarAmoniaPpm", amonia, 1, false);
  addField(body, "suhuSubstratC", substrat, 1, false);
  addField(body, "beratMaggotPanenKg", berat, 3, true);
  body += "}";

  Serial.printf("PUBLISH telemetry: %s\n", body.c_str());
  bool ok = mqttClient.publish(topicChamber, body.c_str());
  Serial.printf("Publish: %s\n", ok ? "OK" : "GAGAL");
  gotResult = false;
}

void telemetryLoop()
{
  sendTelemetry();
  unsigned long start = millis();
  while (millis() - start < 20000)
  {
    if (!mqttClient.loop())
    {
      Serial.println("MQTT terputus saat menunggu result.");
      break;
    }
    if (gotResult)
    {
      Serial.printf("RESULT diterima: %s\n", latestResultDetail.c_str());
      gotResult = false;
      return;
    }
    delay(100);
  }
  if (!gotResult)
    Serial.println("Tidak ada result dalam 20 dtk. Cek backend.");
}

// ======================================================================
//  Perintah serial
// ======================================================================
void handleCommand(String cmd)
{
  cmd.trim();
  if (cmd.length() == 0)
    return;
  char c = toupper(cmd[0]);
  String arg = cmd.substring(1); // FIX: "S1000" dan "S 1000" sama-sama terbaca
  arg.trim();

  if (c == 'R')
  {
    dumpSensors();
  }
  else if (c == 'T')
  {
    if (scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    {
      scale.tare();
      Serial.println("TARE OK");
    }
    else
    {
      Serial.println("HX711 TIDAK SIAP - cek VCC/GND/kabel/pin");
    }
  }
  else if (c == 'S')
  {
    // FIX: "S V" ada di daftar perintah tapi sebelumnya tidak pernah diimplementasikan
    // (jatuh ke cabang kalibrasi dan mencetak "Gunakan S 1000").
    if (arg.equalsIgnoreCase("V"))
    {
      produksiLoop = !produksiLoop;
      lastSend = millis() - SEND_INTERVAL_MS; // kirim pertama langsung
      Serial.printf("Loop produksi %s (kirim tiap %d dtk). Ketik S V lagi untuk toggle.\n",
                    produksiLoop ? "AKTIF" : "NONAKTIF", SEND_INTERVAL_MS / 1000);
    }
    else
    {
      long known = arg.toInt();
      if (known <= 0)
      {
        Serial.println("Gunakan: S 1000  (tare tanpa beban dulu, lalu letakkan beban 1000 g)");
      }
      else
      {
        float raw;
        if (!readRawCounts(raw))
        {
          Serial.println("HX711 TIDAK SIAP - cek VCC/GND/kabel/pin");
        }
        else if (raw <= 0)
        {
          Serial.println("Raw <= 0. Pastikan sudah tare tanpa beban & beban sudah di atas timbangan. "
                         "Kalau tetap negatif, tukar kabel sinyal load cell (A+/A-).");
        }
        else
        {
          float factor = raw / (float)known;
          scaleFaktor = factor;
          scale.set_scale(scaleFaktor);
          saveScaleFactor(factor);
          Serial.printf("Faktor baru: %.2f (raw=%.0f / %ld g) -> tersimpan.\n", factor, raw, known);
        }
      }
    }
  }
  else if (c == 'Z')
  {
    Serial.printf("Factor scale: %.2f | R0 MQ135: %.2f\n", scaleFaktor, mq135R0);
  }
  else if (c == 'G')
  {
    // Jalankan hanya di udara bersih setelah sensor preheat cukup lama.
    float rs = readMq135Rs();
    if (isnan(rs) || rs <= 0)
    {
      Serial.println("Rs tidak valid (sensor lepas / tegangan di luar rentang). Cek wiring & pembagi tegangan.");
    }
    else
    {
      float r0 = rs / MQ135_CLEAN_AIR_RATIO;
      mq135R0 = r0;
      saveMq135R0(r0);
      Serial.printf("Rs=%.2f -> R0 baru=%.2f (asumsi udara bersih, rasio %.1f) -> tersimpan.\n",
                    rs, r0, MQ135_CLEAN_AIR_RATIO);
    }
  }
  else if (c == 'A')
  {
    float r0 = arg.toFloat();
    if (validCal(r0))
    {
      mq135R0 = r0;
      saveMq135R0(r0);
      Serial.printf("R0 set ke %.2f -> tersimpan.\n", r0);
    }
    else
    {
      Serial.println("Gunakan A <angka> (mis A 35.0)");
    }
  }
  else if (c == 'B')
  {
    scanOneWire();
  }
  else if (c == 'M')
  {
    if (WiFi.status() != WL_CONNECTED)
      initWifi();
    if (WiFi.status() == WL_CONNECTED)
      connectMqtt();
    Serial.printf("WiFi: %s | MQTT: %d | maintenance=%s\n",
                  WiFi.isConnected() ? "OK" : "GAGAL",
                  mqttClient.connected() ? 1 : 0,
                  maintenanceAktif ? "ON" : "OFF");
  }
  else if (c == 'V')
  {
    if (WiFi.status() != WL_CONNECTED)
      initWifi();
    if (WiFi.status() == WL_CONNECTED && !mqttClient.connected())
      connectMqtt();
    if (mqttClient.connected())
      telemetryLoop();
    else
      Serial.println("MQTT belum terhubung. Ketik M dulu.");
  }
  else
  {
    Serial.println("Perintah tidak dikenal.");
  }
}

// ======================================================================
//  setup / loop
// ======================================================================
void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP8266 MAGGOT CHAMBER FULL TEST ===");

  pinMode(A0, INPUT);
  Serial.println("[1] pinMode A0 OK");
  dht.begin();
  Serial.println("[2] DHT22 begin OK");
  ds18b20.begin();
  Serial.printf("[3] DS18B20 begin OK (terdeteksi %d sensor)\n", ds18b20.getDeviceCount());
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  Serial.println("[4] HX711 begin OK");

  loadCalibration();
  scale.set_scale(scaleFaktor);
  Serial.println("[5] kalibrasi dimuat");

  if (!scale.wait_ready_timeout(2000, 100))
  {
    // Pin D5=DT, D6=SCK. Catatan: HX711 sebaiknya disuplai 3.3V agar level DT aman untuk ESP8266.
    Serial.println("[5b] HX711 TIDAK SIAP - skip tare (cek VCC, GND sama, DT=D5 SCK=D6)");
  }
  else
  {
    scale.tare();
    Serial.println("[6] HX711 tare OK");
  }

  snprintf(topicChamber, sizeof(topicChamber), "%s/maggot-chamber", MQTT_PREFIX);
  snprintf(topicChamberResult, sizeof(topicChamberResult), "%s/maggot-chamber/result", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);
  mqttClient.setBufferSize(512);
  Serial.println("[7] MQTT config OK");

  initWifi();
  Serial.println("[8] WiFi selesai");

  Serial.println("COMMAND (ketik + Enter):");
  Serial.println("  R    -> dump semua sensor (nilai / GAGAL)");
  Serial.println("  T    -> tare HX711");
  Serial.println("  S <g>-> kalibrasi HX711: tare tanpa beban, letakkan <g> gram lalu ketik S 1000");
  Serial.println("  Z    -> lihat kalibrasi tersimpan (factor & R0)");
  Serial.println("  G    -> kalibrasi MQ135 di udara bersih: R0 = Rs / 3.6 -> simpan");
  Serial.println("  A    -> set R0 manual: A <angka> (mis A 35.0) -> simpan");
  Serial.println("  B    -> scan 1-Wire (DS18B20)");
  Serial.println("  M    -> tes WiFi+MQTT (connect+subscribe)");
  Serial.println("  V    -> full test: kirim telemetry -> tunggu result backend");
  Serial.println("  S V  -> toggle kirim telemetry tiap 30 dtk (loop produksi)");
}

void loop()
{
  if (Serial.available())
  {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }

  if (produksiLoop)
  {
    if (WiFi.status() == WL_CONNECTED && !mqttClient.connected() && millis() - lastReconnect > 10000)
    {
      lastReconnect = millis();
      connectMqtt();
    }
    if (mqttClient.connected() && !maintenanceAktif && millis() - lastSend >= SEND_INTERVAL_MS)
    {
      lastSend = millis();
      sendTelemetry();
    }
  }

  mqttClient.loop();
  delay(20);
}