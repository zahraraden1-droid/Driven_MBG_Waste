#!/usr/bin/env bash
# ============================================================================
# siapkan-secrets.sh — menyalin template kredensial ke folder tiap sketch.
#
# Latar belakang: kredensial TIDAK BOLEH tersimpan di source yang di-commit.
# Setiap sketch firmware membaca `secrets.h` dari folder sketch-nya sendiri
# (lihat blok `#if __has_include("secrets.h")` di masing-masing .ino).
#
# Skrip ini menyalin firmware/secrets.h.example menjadi secrets.h di setiap
# folder sketch bila belum ada. File hasil salinan ter-gitignore.
#
# Penggunaan:
#     ./firmware/siapkan-secrets.sh
#
# Setelah itu, isi nilai sebenarnya di setiap file secrets.h yang dibuat.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

TEMPLATE="secrets.h.example"
if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: $TEMPLATE tidak ditemukan." >&2
  exit 1
fi

dibuat=0
for dir in */; do
  # Hanya folder yang benar-benar berisi sketch .ino
  if ! compgen -G "$dir*.ino" > /dev/null; then
    continue
  fi

  target="${dir}secrets.h"
  if [ -f "$target" ]; then
    echo "  LEWAT   $target (sudah ada)"
  else
    cp "$TEMPLATE" "$target"
    echo "  DIBUAT  $target"
    dibuat=$((dibuat + 1))
  fi
done

echo
if [ "$dibuat" -eq 0 ]; then
  echo "Semua sketch sudah memiliki secrets.h. Tidak ada yang diubah."
else
  echo "$dibuat file secrets.h dibuat dari template."
  echo "PENTING: isi nilai sebenarnya di file tersebut sebelum melakukan flash."
fi
echo
echo "Catatan: file secrets.h ter-gitignore dan tidak akan ter-commit."
