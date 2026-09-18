#!/usr/bin/env bash
# Membuat file password untuk broker MQTT production (mosquitto).
# Baca MQTT_USERNAME & MQTT_PASSWORD dari deploy/.env lalu generate deploy/mosquitto/passwd.
#
# Penggunaan:  ./deploy/mosquitto/gen-passwd.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env"
OUT="mosquitto/passwd"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE belum ada. Salin dulu: cp .env.prod.example .env"
  exit 1
fi

if ! command -v mosquitto_passwd >/dev/null 2>&1; then
  echo "ERROR: mosquitto_passwd tidak ditemukan. Install 'mosquitto' (mosquitto-clients / mosquitto-passwd)."
  exit 1
fi

USERNAME=$(grep -E '^MQTT_USERNAME=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')
PASSWORD=$(grep -E '^MQTT_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ "$USERNAME" = "isi-username-mqtt" ] ; then
  echo "ERROR: isi MQTT_USERNAME dan MQTT_PASSWORD dulu di $ENV_FILE"
  exit 1
fi

rm -f "$OUT"
mosquitto_passwd -c -b "$OUT" "$USERNAME" "$PASSWORD"
echo "OK: $OUT dibuat untuk user '$USERNAME'."