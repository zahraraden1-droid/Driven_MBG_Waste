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

const char *WIFI_SSID = "R-408";
const char *WIFI_PASS = "*ruang408";
// PRODUCTION: broker MQTT di Railway via TCP proxy tambahan (bukan domain HTTP).
const char *MQTT_SERVER = "tramway.proxy.rlwy.net";
const uint16_t MQTT_PORT = 55251;
const char *MQTT_USER = "mbg_device";
const char *MQTT_PASS = "5vfa4wltLH3v30B2WqlUlTp";
const char *MQTT_PREFIX = "mbg";
const char *BATCH_ID = ""; // CEK: selalu kosong. Pastikan backend memang mengisi batch aktif sendiri.

DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicChamber[128];
char topicMaintenance[64];

bool maintenanceAktif = false;
bool firstSend = true;
bool mqttTried = false;
unsigned long lastSend = 0;
unsigned long lastMqttTry = 0;
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
  if (strcmp(topic, topicMaintenance) != 0)
    return;

  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++)
    msg += (char)payload[i];
  msg.replace(" ", ""); // FIX: toleran terhadap spasi di JSON ("aktif": true)
  maintenanceAktif = msg.indexOf("\"aktif\":true") >= 0;
  Serial.printf("[dbg] maintenance=%s\n", maintenanceAktif ? "ON" : "OFF");
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

  bool due = firstSend || (millis() - lastSend >= SEND_INTERVAL_MS); // FIX: kirim pertama langsung, bukan menunggu 30 dtk
  if (mqttOk && !maintenanceAktif && due)
  {
    firstSend = false;
    lastSend = millis();
    sendTelemetry();
  }

  delay(100); // FIX: sebelumnya 1000 ms, membuat mqttClient.loop() jarang dipanggil
}