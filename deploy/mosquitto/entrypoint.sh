#!/bin/sh
# Entrypoint Mosquitto — generate mosquitto.conf & passwd saat runtime dari env.
# Tujuan: apapun isi image build (cache lama/kondisi apapun), config selalu
# benar saat container start — dan passwd tak perlu di-commit ke repo.
set -e

CONF=/mosquitto/config/mosquitto.conf
PASSWD=/mosquitto/data/passwd

# 1) Tulis config fresh (dibalik shell heredoc, bukan COPY build)
cat > "$CONF" <<'EOF'
user mosquitto

persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout

# Broker production: wajib autentikasi
allow_anonymous false
password_file /mosquitto/data/passwd

listener 1883 0.0.0.0
protocol mqtt

# (opsional) WebSocket untuk debug dashboard
listener 9001 0.0.0.0
protocol websockets
EOF

# 2) Generate passwd dari env bila belum ada
if [ ! -f "$PASSWD" ] && [ -n "$MQTT_USERNAME" ] && [ -n "$MQTT_PASSWORD" ]; then
  echo "[entrypoint] membuat passwd untuk user '$MQTT_USERNAME'"
  mosquitto_passwd -c -b "$PASSWD" "$MQTT_USERNAME" "$MQTT_PASSWORD"
fi

# 3) Pastikan kepemilikan benar bila container jalan sebagai root
if [ "$(id -u)" = "0" ]; then
  echo "[entrypoint] menyesuaikan kepemilikan /mosquitto untuk user mosquitto"
  mkdir -p /mosquitto/data /mosquitto/log /mosquitto/config
  chown -R mosquitto:mosquitto /mosquitto/data /mosquitto/log /mosquitto/config
fi

exec mosquitto -c "$CONF"