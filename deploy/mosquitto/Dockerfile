# SPPG MBG — Mosquitto broker (Railway / Docker Compose)
FROM eclipse-mosquitto:2

COPY entrypoint.sh /usr/local/bin/sppg-entrypoint.sh
RUN chmod +x /usr/local/bin/sppg-entrypoint.sh

COPY mosquitto.conf /mosquitto/config/mosquitto.conf

EXPOSE 1883 9001

ENTRYPOINT ["/usr/local/bin/sppg-entrypoint.sh"]