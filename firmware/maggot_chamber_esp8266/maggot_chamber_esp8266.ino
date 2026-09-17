#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>

#define DHT_PIN 4
#define DHT_TYPE DHT22
#define DS18B20_PIN 13
#define HX711_DT_PIN 14
#define HX711_SCK_PIN 12
#define CALIBRATION_FACTOR 450.0
#define MQ135_RL 10.0
#define MQ135_R0 30.0
#define SEND_INTERVAL_MS 30000

const char* WIFI_SSID = "GANTI-SSID";
const char* WIFI_PASS = "GANTI-PASSWORD";
const char* MQTT_SERVER = "broker.emqx.io";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "";
const char* MQTT_PASS = "";
const char* MQTT_PREFIX = "mbg";
const char* BATCH_ID = "";

DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicChamber[128];
char topicMaintenance[64];

bool maintenanceAktif = false;
unsigned long lastSend = 0;

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (String(topic) != String(topicMaintenance)) return;

  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  maintenanceAktif = msg.indexOf("\"aktif\":true") >= 0;
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    if (mqttClient.connect(String("mbg-chamber-") + String(ESP.getChipId()), MQTT_USER, MQTT_PASS)) {
      mqttClient.subscribe(topicMaintenance);
    } else {
      delay(2000);
    }
  }
}

float readNH3Ppm() {
  int raw = analogRead(A0);
  float vSensor = raw * (5.0f / 1023.0f);
  if (vSensor <= 0.02f) return 0.0f;
  float rs = ((5.0f * MQ135_RL) / vSensor) - MQ135_RL;
  float ratio = rs / MQ135_R0;
  if (ratio <= 0.01f) return 99.0f;
  return 10.938f * powf(ratio, -1.774f);
}

float readSuhuSubstrat() {
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  return isnan(t) ? 0.0f : t;
}

float readBeratPanenKg() {
  scale.set_scale(CALIBRATION_FACTOR);
  float gram = scale.get_units(5);
  if (isnan(gram) || gram < 0) gram = 0;
  return gram / 1000.0;
}

void sendTelemetry() {
  float suhuUdara = dht.readTemperature();
  float kelembaban = dht.readHumidity();
  if (isnan(suhuUdara) || isnan(kelembaban)) {
    suhuUdara = 0;
    kelembaban = 0;
  }

  String body = String("{");
  body += "\"batchId\":\"" + String(BATCH_ID) + "\",";
  body += "\"suhuBilikC\":" + String(suhuUdara, 1) + ",";
  body += "\"kelembabanPersen\":" + String(kelembaban, 1) + ",";
  body += "\"kadarAmoniaPpm\":" + String(readNH3Ppm(), 1) + ",";
  body += "\"suhuSubstratC\":" + String(readSuhuSubstrat(), 1) + ",";
  body += "\"beratMaggotPanenKg\":" + String(readBeratPanenKg(), 3);
  body += "}";

  mqttClient.publish(topicChamber, body.c_str());
}

void setup() {
  Serial.begin(115200);

  pinMode(A0, INPUT);
  dht.begin();
  ds18b20.begin();
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare();

  snprintf(topicChamber, sizeof(topicChamber), "%s/maggot-chamber", MQTT_PREFIX);
  snprintf(topicMaintenance, sizeof(topicMaintenance), "%s/maintenance", MQTT_PREFIX);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  connectWifi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (!mqttClient.connected()) {
    connectMqtt();
  }
  mqttClient.loop();

  if (!maintenanceAktif && millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();
    sendTelemetry();
  }

  delay(1000);
}