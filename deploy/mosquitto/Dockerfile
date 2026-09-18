# SPPG MBG — Mosquitto broker (Railway / Docker Compose)
# Config ditulis saat runtime oleh entrypoint.sh (robust thd cache build).
FROM eclipse-mosquitto:2

COPY entrypoint.sh /usr/local/bin/sppg-entrypoint.sh
RUN chmod +x /usr/local/bin/sppg-entrypoint.sh

EXPOSE 1883 9001

ENTRYPOINT ["/usr/local/bin/sppg-entrypoint.sh"]