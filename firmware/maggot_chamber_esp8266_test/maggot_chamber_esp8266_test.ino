#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <EEPROM.h>
#include <Wire.h>

#define DHT_PIN 4
#define DHT_TYPE DHT22
#define DS18B20_PIN 13
#define HX711_DT_PIN 14
#define HX711_SCK_PIN 12
#define CALIBRATION_FACTOR 450.0
#define MQ135_RL 10.0
#define MQ135_R0_DEFAULT 30.0
#define SEND_INTERVAL_MS 30000

const char *WIFI_SSID = "R-408";
const char *WIFI_PASS = "*ruang408";
const char *MQTT_SERVER = "tramway.proxy.rlwy.net";
const uint16_t MQTT_PORT = 55251;
const char *MQTT_USER = "mbg_device";
const char *MQTT_PASS = "5vfa4wltLH3v30B2WqlUlTp";
const char *MQTT_PREFIX = "mbg";
const char *BATCH_ID = "";

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
bool gotResult = false;
String latestResultDetail = "";
float scaleFaktor = CALIBRATION_FACTOR;
float mq135R0 = MQ135_R0_DEFAULT;
unsigned long resultStart = 0;

void loadCalibration()
{
  EEPROM.begin(16);
  float s = 0;
  EEPROM.get(0, s);
  float r = 0;
  EEPROM.get(8, r);
  EEPROM.end();
  if (s > 0)
  {
    scaleFaktor = s;
    Serial.printf("Faktor scale tersimpan: %.2f\n", scaleFaktor);
  }
  if (r > 0)
  {
    mq135R0 = r;
    Serial.printf("R0 MQ135 tersimpan: %.2f\n", mq135R0);
  }
  if (s <= 0 || r <= 0)
    Serial.printf("Pakai default: scale=%.2f R0=%.2f\n", scaleFaktor, mq135R0);
}

void saveScaleFactor(float f)
{
  EEPROM.begin(16);
  EEPROM.put(0, f);
  EEPROM.commit();
  EEPROM.end();
}

void saveMq135R0(float r)
{
  EEPROM.begin(16);
  EEPROM.put(8, r);
  EEPROM.commit();
  EEPROM.end();
}

void initWifi()
{
  WiFi.mode(WIFI_STA);
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
  String t = String(topic);
  String msg;
  for (unsigned int i = 0; i < length; i++)
    msg += (char)payload[i];

  if (t == String(topicChamberResult))
  {
    Serial.printf("MQTT RESULT: %s\n", msg.c_str());
    latestResultDetail = msg;
    gotResult = true;
  }
  else if (t == String(topicMaintenance))
  {
    maintenanceAktif = msg.indexOf("\"aktif\":true") >= 0;
    Serial.printf("MAINTENANCE: %s\n", msg.c_str());
  }
}

bool connectMqtt()
{
  int tries = 0;
  while (!mqttClient.connected() && tries < 10)
  {
    String clientId = String("mbg-test-chamber-") + String(ESP.getChipId());
    Serial.printf("MQTT connect rc=%d ...\n", mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS));
    if (!mqttClient.connected())
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
    return true;
  }
  Serial.println("MQTT GAGAL.");
  return false;
}

float readSuhuUdara()
{
  float t = dht.readTemperature();
  if (isnan(t))
    return -999;
  return t;
}

float readKelembaban()
{
  float h = dht.readHumidity();
  if (isnan(h))
    return -999;
  return h;
}

float readSuhuSubstrat()
{
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  if (isnan(t))
    return -999;
  return t;
}

float readNH3RawPpm()
{
  int raw = analogRead(A0);
  float vSensor = raw * (5.0f / 1023.0f);
  if (vSensor <= 0.02f)
    return 0.0f;
  float rs = ((5.0f * MQ135_RL) / vSensor) - MQ135_RL;
  if (rs <= 0)
    return 0.0f;
  return rs;
}

float readNH3Ppm()
{
  float rs = readNH3RawPpm();
  if (rs <= 0)
    return 0.0f;
  float ratio = rs / mq135R0;
  if (ratio <= 0.01f)
    return 99.0f;
  return 10.938f * powf(ratio, -1.774f);
}

float readBeratGram()
{
  scale.set_scale(scaleFaktor);
  float g = scale.get_units(5);
  if (isnan(g) || g < 0)
    g = 0;
  return g;
}

float readRawCounts()
{
  return scale.get_value(10);
}

void scanI2C()
{
  Wire.begin();
  Serial.println("Scan I2C...");
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
    Serial.println("  Tidak ada device.");
}

void dumpSensors()
{
  float t = readSuhuUdara();
  float h = readKelembaban();
  float su = readSuhuSubstrat();
  float rs = readNH3RawPpm();
  float ppm = readNH3Ppm();
  float berat = readBeratGram();
  float raw = readRawCounts();

  Serial.println("--- SENSOR DUMP ---");
  Serial.printf("DHT22  suhu udara : %.2f C\n", t);
  Serial.printf("DHT22  kelembaban : %.2f %%\n", h);
  Serial.printf("DS18B20 substrat  : %.2f C\n", su);
  Serial.printf("MQ135  Rs         : %.2f Ohm, R0=%.2f, ppm=%.2f\n", rs, mq135R0, ppm);
  Serial.printf("HX711  berat      : %.1f g (factor=%.2f, raw=%.0f)\n", berat, scaleFaktor, raw);
}

void sendTelemetry()
{
  float suhuUdara = dht.readTemperature();
  float kelembaban = dht.readHumidity();
  if (isnan(suhuUdara) || isnan(kelembaban))
  {
    suhuUdara = 0;
    kelembaban = 0;
  }
  float amonia = readNH3Ppm();
  float substrat = readSuhuSubstrat();
  float kg = readBeratGram() / 1000.0;

  String body = String("{");
  body += "\"batchId\":\"" + String(BATCH_ID) + "\",";
  body += "\"suhuBilikC\":" + String(suhuUdara, 1) + ",";
  body += "\"kelembabanPersen\":" + String(kelembaban, 1) + ",";
  body += "\"kadarAmoniaPpm\":" + String(amonia, 1) + ",";
  body += "\"suhuSubstratC\":" + String(substrat, 1) + ",";
  body += "\"beratMaggotPanenKg\":" + String(kg, 3);
  body += "}";

  Serial.printf("PUBLISH telemetry: %s\n", body.c_str());
  bool ok = mqttClient.publish(topicChamber, body.c_str());
  Serial.printf("Publish: %s\n", ok ? "OK" : "GAGAL");

  gotResult = false;
  resultStart = millis();
}

void telemetryLoop()
{
  sendTelemetry();
  unsigned long start = millis();
  while (millis() - start < 20000)
  {
    mqttClient.loop();
    if (gotResult)
    {
      Serial.printf("RESULT diterima: %s\n", latestResultDetail.c_str());
      gotResult = false;
    }
    delay(100);
  }
}

void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP8266 MAGGOT CHAMBER FULL TEST ===");

  pinMode(A0, INPUT);
  Serial.println("[1] pinMode A0 OK");
  dht.begin();
  Serial.println("[2] DHT22 OK");
  ds18b20.begin();
  Serial.println("[3] DS18B20 OK");
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  Serial.println("[4] HX711 begin OK");
  if (!scale.wait_ready_timeout(2000, 100))
  {
    Serial.println("[4b] HX711 TIDAK SIAP - skip tare (cek VCC 5V, GND sama, DT=D5 SCK=D6)");
  }
  else
  {
    scale.tare();
    Serial.println("[5] HX711 tare OK");
  }

  loadCalibration();
  scale.set_scale(scaleFaktor);
  Serial.println("[6] kalibrasi OK");

  snprintf(topicChamber, sizeof(topicChamber), "%s/maggot-chamber", MQTT_PREFIX);
  snprintf(topicChamberResult, sizeof(topicChamberResult), "%s/maggot-chamber/result", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  Serial.println("[7] MQTT config OK");

  initWifi();
  Serial.println("[8] WiFi selesai");

  Serial.println("COMAND (ketik + Enter):");
  Serial.println("  R   -> dump semua sensor (ada/tidak, nilai)");
  Serial.println("  T   -> tare HX711");
  Serial.println("  S <g>-> kalibrasi HX711: letakkan <g> gram lalu ketik S 1000");
  Serial.println("  Z   -> lokasi status kalibrasi (factor & R0)");
  Serial.println("  G   -> kalibrasi MQ135: gas bersih saat ini, hitung R0 (Rs/9.8) -> simpan");
  Serial.println("  A   -> set R0 manual: A <angka> (mis A 35.0) -> simpan");
  Serial.println("  B   -> scan I2C (DS18B20) ");
  Serial.println("  M   -> tes WiFi+MQTT (connect+subscribe)");
  Serial.println("  V   -> full test: kirim telemetry -> tunggu result backend");
  Serial.println("  S V -> kirim telemetry terus tiap 30s (loop produksi)");
}

void loop()
{
  if (Serial.available())
  {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    char c = toupper(cmd[0]);

    if (c == 'R')
    {
      dumpSensors();
    }
    else if (c == 'T')
    {
      scale.tare();
      Serial.println("TARE OK");
    }
    else if (c == 'S' && cmd.length() > 2)
    {
      int known = cmd.substring(2).toInt();
      if (known <= 0)
      {
        Serial.println("Gunakan S 1000");
      }
      else
      {
        float raw = readRawCounts();
        if (raw <= 0)
        {
          Serial.println("Raw=0. Cek HX711/beban. Tare dulu?");
        }
        else
        {
          float factor = raw / known;
          scaleFaktor = factor;
          scale.set_scale(scaleFaktor);
          saveScaleFactor(factor);
          Serial.printf("Faktor baru: %.2f -> tersimpan.\n", factor);
        }
      }
    }
    else if (c == 'Z')
    {
      Serial.printf("Factor scale: %.2f | R0 MQ135: %.2f\n", scaleFaktor, mq135R0);
    }
    else if (c == 'G')
    {
      float rs = readNH3RawPpm();
      float r0 = rs / 9.8f;
      mq135R0 = r0;
      saveMq135R0(r0);
      Serial.printf("Rs=%.2f -> R0 baru=%.2f (asumsi udara bersih) -> tersimpan.\n", rs, r0);
    }
    else if (c == 'A')
    {
      float r0 = cmd.substring(2).toFloat();
      if (r0 > 0)
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
      scanI2C();
    }
    else if (c == 'M')
    {
      if (WiFi.status() != WL_CONNECTED)
        initWifi();
      connectMqtt();
      Serial.printf("WiFi: %s | MQTT: %d | maintenance=%s\n",
                    WiFi.isConnected() ? "OK" : "GAGAL",
                    mqttClient.connected() ? 1 : 0,
                    maintenanceAktif ? "ON" : "OFF");
    }
    else if (c == 'V')
    {
      if (!mqttClient.connected())
        connectMqtt();
      if (mqttClient.connected())
      {
        telemetryLoop();
      }
      else
      {
        Serial.println("MQTT belum terhubung. Ketik M dulu.");
      }
    }
  }

  mqttClient.loop();
  delay(20);
}