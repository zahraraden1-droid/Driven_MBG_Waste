/*
 * Maggot chamber - ESP8266 (PRODUKSI)
 * DHT22 + DS18B20 + MQ135 (A0) + HX711 -> MQTT (Railway)
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
#define MQ135_R0_DEFAULT 30.0 // kOhm. Diganti nilai hasil kalibrasi dari sketch test (EEPROM).
#define MQ135_VCC 5.0         // tegangan suplai modul (V)
// FIX/PENTING: tegangan AO sensor yang menghasilkan raw=1023 di A0.
// ESP8266 hanya bisa membaca 0-3.3V di A0 (NodeMCU/Wemos, sudah ada pembagi bawaan) atau 0-1.0V (chip telanjang).
// Nilai 5.0 hanya benar kalau ada pembagi tegangan eksternal yang memetakan 5V -> 3.3V (mis. 10k seri + 20k ke GND).
// Tanpa pembagi, A0 jenuh di 3.3V dan AO 5V bisa merusak pin A0: pasang pembagi, atau isi 3.3 kalau AO memang <= 3.3V.
#define ADC_FULLSCALE_AO_V 5.0
#define ADC_SAMPLES 16
#define NH3_PPM_MAX 500.0 // di atas ini di luar rentang kurva sensor

// ---------------- MQTT / umum ----------------
#define SEND_INTERVAL_MS 30000
#define MQTT_RETRY_MS 5000
#define EEPROM_ADDR_SCALE 0 // sama dengan sketch test
#define EEPROM_ADDR_R0 8    // sama dengan sketch test

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
const char *BATCH_ID = SECRET_BATCH_ID; // CEK: selalu kosong. Pastikan backend memang mengisi batch aktif sendiri.

DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicChamber[128];
char topicMaintenance[64];
char topicCmd[128];
char topicStatus[128];

bool maintenanceAktif = false;
bool firstSend = true;
bool mqttTried = false;
unsigned long lastSend = 0;
unsigned long lastMqttTry = 0;
unsigned long sendIntervalMs = SEND_INTERVAL_MS; // bisa diubah remote lewat perintah set_interval
float scaleFaktor = CALIBRATION_FACTOR;
float mq135R0 = MQ135_R0_DEFAULT;

// ======================================================================
//  Kalibrasi (EEPROM)
// ======================================================================
bool validCal(float v)
{
  return !isnan(v) && !isinf(v) && v > 0.1f && v < 1000000.0f;
}

// FIX: sebelumnya R0 MQ135 tidak pernah dibaca dari EEPROM (selalu 30.0), jadi hasil kalibrasi
// dari sketch test tidak terpakai di produksi. Nilai EEPROM juga divalidasi (flash kosong/sampah).
void loadCalibration()
{
  EEPROM.begin(16);
  float s = 0, r = 0;
  EEPROM.get(EEPROM_ADDR_SCALE, s);
  EEPROM.get(EEPROM_ADDR_R0, r);
  EEPROM.end();
  if (validCal(s))
  {
    scaleFaktor = s;
    Serial.printf("[dbg] pakai scale factor tersimpan: %.2f\n", scaleFaktor);
  }
  if (validCal(r))
  {
    mq135R0 = r;
    Serial.printf("[dbg] pakai R0 MQ135 tersimpan: %.2f\n", mq135R0);
  }
}

void saveScaleFactor(float f)
{
  EEPROM.begin(16);
  EEPROM.put(EEPROM_ADDR_SCALE, f);
  EEPROM.commit();
  EEPROM.end();
  scaleFaktor = f;
  scale.set_scale(scaleFaktor);
}

void saveMq135R0(float r)
{
  EEPROM.begin(16);
  EEPROM.put(EEPROM_ADDR_R0, r);
  EEPROM.commit();
  EEPROM.end();
  mq135R0 = r;
}

// ======================================================================
//  Status & perintah (kalibrasi remote dari dashboard)
// ======================================================================
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
  String body = String("{\"perangkat\":\"maggot-chamber\",\"cmd\":\"") + String(cmd) + "\",\"ok\":" + (ok ? "true" : "false");
  body += ",\"scaleFaktor\":" + String(scaleFaktor, 2);
  body += ",\"mq135R0\":" + String(mq135R0, 2);
  if (catatan.length() > 0)
  {
    body += ",\"catatan\":\"" + catatan + "\"";
  }
  body += "}";
  mqttClient.publish(topicStatus, body.c_str());
}

// ======================================================================
//  WiFi & MQTT
// ======================================================================
// FIX: sebelumnya loop tanpa batas waktu. Sekarang ada timeout; auto-reconnect ESP8266 tetap aktif.
bool connectWifi(uint32_t timeoutMs)
{
  if (WiFi.status() == WL_CONNECTED)
    return true;
  Serial.println("[dbg] WiFi mulai...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs)
    delay(250);
  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("[dbg] WiFi terhubung, IP=" + WiFi.localIP().toString());
    return true;
  }
  Serial.printf("[dbg] WiFi gagal, status=%d\n", WiFi.status());
  return false;
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++)
    msg += (char)payload[i];

  if (strcmp(topic, topicMaintenance) == 0)
  {
    msg.replace(" ", ""); // FIX: toleran terhadap spasi di JSON ("aktif": true)
    maintenanceAktif = msg.indexOf("\"aktif\":true") >= 0;
    Serial.printf("[dbg] maintenance=%s\n", maintenanceAktif ? "ON" : "OFF");
  }
  else if (strcmp(topic, topicCmd) == 0)
  {
    String compact = msg;
    compact.replace(" ", "");
    String cmd = jsonKeyValue(compact, "cmd");
    float val = jsonKeyValue(compact, "value").toFloat();

    Serial.printf("[dbg] cmd diterima: %s (value=%.2f)\n", cmd.c_str(), val);

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
      if (validCal(val))
      {
        saveScaleFactor(val);
        publishStatus("set_scale_factor", true, "");
      }
      else
      {
        publishStatus("set_scale_factor", false, "nilai tidak valid");
      }
    }
    else if (cmd == "set_r0")
    {
      if (validCal(val))
      {
        saveMq135R0(val);
        publishStatus("set_r0", true, "");
      }
      else
      {
        publishStatus("set_r0", false, "nilai tidak valid");
      }
    }
    else if (cmd == "set_interval")
    {
      if (val >= 1000 && val <= 3600000)
      {
        sendIntervalMs = (unsigned long)val;
        publishStatus("set_interval", true, String(val));
      }
      else
      {
        publishStatus("set_interval", false, "rentang 1000-3600000");
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

// FIX: sebelumnya connectMqtt() adalah while(!connected) tanpa akhir yang memblok seluruh loop().
// Sekarang satu percobaan per MQTT_RETRY_MS dan loop tetap berjalan.
bool ensureMqtt()
{
  if (mqttClient.connected())
    return true;
  if (mqttTried && millis() - lastMqttTry < MQTT_RETRY_MS)
    return false;
  mqttTried = true;
  lastMqttTry = millis();

  String clientId = String("mbg-chamber-") + String(ESP.getChipId());
  if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS))
  {
    mqttClient.subscribe(topicMaintenance);
    mqttClient.subscribe(topicCmd);
    Serial.println("[dbg] MQTT terhubung");
    return true;
  }
  Serial.printf("[dbg] MQTT gagal state=%d\n", mqttClient.state());
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

// FIX: getTempCByIndex() TIDAK mengembalikan NaN saat sensor lepas, tapi -127.0 (DEVICE_DISCONNECTED_C),
// jadi cek isnan() sebelumnya tidak pernah menangkap error dan -127 C terkirim sebagai data.
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

// Rs dalam kOhm, NAN kalau tegangan di luar rentang wajar (sensor lepas / jenuh)
float readMq135Rs()
{
  float v = readAdcAvg() * (ADC_FULLSCALE_AO_V / 1023.0f);
  if (v <= 0.02f || v >= MQ135_VCC)
    return NAN;
  return MQ135_RL * (MQ135_VCC - v) / v;
}

// FIX: sebelumnya sensor lepas menghasilkan 0 ppm (tampak "udara bersih") dan rasio kecil menghasilkan
// nilai sentinel 99 (tidak masuk akal). Sekarang NAN untuk sensor tak terbaca dan hasil di-clamp.
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

bool readBeratKg(float &kg)
{
  if (!scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    return false;
  float gram = scale.get_units(5);
  if (isnan(gram) || isinf(gram))
    return false;
  if (gram < 0)
    gram = 0; // buang noise negatif kecil di sekitar nol
  kg = gram / 1000.0f;
  return true;
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

// FIX: sebelumnya sensor gagal dikirim sebagai angka 0 (DHT), -127 (DS18B20) atau 0 kg (HX711),
// sehingga data palsu masuk ke backend. Sekarang dikirim null. CEK: pastikan backend menerima null;
// kalau tidak, ubah addField() agar melewati field tersebut atau kirim nilai terakhir yang valid.
void sendTelemetry()
{
  float suhuUdara, kelembaban;
  readDht(suhuUdara, kelembaban);
  float amonia = readNH3Ppm();
  float substrat = readSuhuSubstrat();
  float berat = NAN;
  float kg;
  if (readBeratKg(kg))
    berat = kg;

  Serial.printf("[dbg] suhu=%.1f hum=%.1f amonia=%.1f substrat=%.1f berat=%.3f\n",
                suhuUdara, kelembaban, amonia, substrat, berat);

  String body = String("{");
  body += "\"batchId\":\"" + String(BATCH_ID) + "\",";
  addField(body, "suhuBilikC", suhuUdara, 1, false);
  addField(body, "kelembabanPersen", kelembaban, 1, false);
  addField(body, "kadarAmoniaPpm", amonia, 1, false);
  addField(body, "suhuSubstratC", substrat, 1, false);
  addField(body, "beratMaggotPanenKg", berat, 3, true);
  body += "}";

  bool ok = mqttClient.publish(topicChamber, body.c_str());
  Serial.printf("[dbg] publish %s\n", ok ? "OK" : "GAGAL");

  String cal = String("{\"perangkat\":\"maggot-chamber\",\"scaleFaktor\":") + String(scaleFaktor, 2);
  cal += String(",\"mq135R0\":") + String(mq135R0, 2) + String("}");
  mqttClient.publish(topicStatus, cal.c_str());
}

// ======================================================================
//  setup / loop
// ======================================================================
void setup()
{
  Serial.begin(115200);
  Serial.println("\n[dbg] boot chamber");

  pinMode(A0, INPUT);
  dht.begin();
  ds18b20.begin();
  Serial.printf("[dbg] sensor temp count: %d\n", ds18b20.getDeviceCount());
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);

  loadCalibration();
  scale.set_scale(scaleFaktor);
  // CATATAN: tare tiap boot berarti berat di atas timbangan saat boot dianggap 0.
  // Kalau alat mati/restart saat ada maggot di atasnya, berat panen akan tereset.
  if (scale.wait_ready_timeout(HX711_TIMEOUT_MS, 10))
    scale.tare();
  else
    Serial.println("[dbg] HX711 TIDAK SIAP - tare dilewati (cek VCC/GND/kabel)");

  snprintf(topicChamber, sizeof(topicChamber), "%s/maggot-chamber", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);
  snprintf(topicCmd, sizeof(topicCmd), "%s/maggot-chamber/cmd", MQTT_PREFIX);
  snprintf(topicStatus, sizeof(topicStatus), "%s/maggot-chamber/status", MQTT_PREFIX);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);
  mqttClient.setBufferSize(512);

  WiFi.persistent(false); // jangan tulis kredensial ke flash tiap begin()
  WiFi.setAutoReconnect(true);
  connectWifi(30000);
  Serial.println("[dbg] setup selesai");
}

void loop()
{
  if (!connectWifi(20000))
  {
    delay(1000);
    return;
  }

  bool mqttOk = ensureMqtt();
  if (mqttOk)
    mqttClient.loop();

  bool due = firstSend || (millis() - lastSend >= sendIntervalMs); // FIX: kirim pertama langsung, bukan menunggu interval
  if (mqttOk && !maintenanceAktif && due)
  {
    firstSend = false;
    lastSend = millis();
    sendTelemetry();
  }

  delay(100); // FIX: sebelumnya 1000 ms, membuat mqttClient.loop() jarang dipanggil
}