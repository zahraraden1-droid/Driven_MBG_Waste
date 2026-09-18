#!/bin/sh
# Entrypoint Mosquitto — generate file passwd otomatis dari env MQTT_USERNAME/MQTT_PASSWORD
# supaya berjalan di Railway (file passwd tdk ikut di-commit) maupun Docker Compose.
set -e

PASSWD=/mosquitto/data/passwd

if [ ! -f "$PASSWD" ] && [ -n "$MQTT_USERNAME" ] && [ -n "$MQTT_PASSWORD" ]; then
  echo "[entrypoint] membuat passwd untuk user '$MQTT_USERNAME'"
  mosquitto_passwd -c -b "$PASSWD" "$MQTT_USERNAME" "$MQTT_PASSWORD"
  chmod 600 "$PASSWD"
fi

exec mosquitto -c /mosquitto/config/mosquitto.conf