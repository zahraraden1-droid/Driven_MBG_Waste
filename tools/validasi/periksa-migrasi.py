#!/usr/bin/env python3
"""
periksa-migrasi.py — Pemeriksaan statis berkas migrasi SQL.

Tidak dapat menggantikan pengujian terhadap database sungguhan, tetapi dapat
menangkap kesalahan yang paling sering terjadi sebelum migrasi dijalankan ke
produksi:

  1. Tanda kutip, tanda kurung, dan blok dolar ($$) yang tidak seimbang.
  2. Fungsi yang ditulis dalam migrasi "naik" tetapi tidak dihapus pada berkas
     rollback pasangannya.
  3. Tabel/kolom yang dibuat pada migrasi "naik" tetapi tidak dibersihkan pada
     rollback.
  4. Pernyataan berbahaya (drop table/column tanpa if exists) pada berkas naik.
  5. Migrasi naik yang tidak mencatat versinya di schema_migrations.

Penggunaan:
    python3 tools/validasi/periksa-migrasi.py
"""

import os
import re
import sys

AKAR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR_MIGRASI = os.path.join(AKAR, "supabase", "migrations")
DIR_ROLLBACK = os.path.join(DIR_MIGRASI, "rollback")

hijau = "\033[92m"
merah = "\033[91m"
kuning = "\033[93m"
reset = "\033[0m"

masalah = []
peringatan = []


def baca(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def cek_keseimbangan(nama, isi):
    """Memeriksa keseimbangan tanda kurung dan blok dolar."""
    # Blok dolar harus genap jumlahnya.
    jumlah_dolar = isi.count("$$")
    if jumlah_dolar % 2 != 0:
        masalah.append(f"{nama}: jumlah '$$' ganjil ({jumlah_dolar}) — blok fungsi tidak tertutup")

    # Tanda kurung: abaikan isi string sederhana dan komentar.
    bersih = re.sub(r"--[^\n]*", "", isi)
    bersih = re.sub(r"'[^']*'", "''", bersih)
    buka = bersih.count("(")
    tutup = bersih.count(")")
    if buka != tutup:
        masalah.append(f"{nama}: tanda kurung tidak seimbang (buka={buka}, tutup={tutup})")

    # Tanda kutip tunggal (setelah membersihkan pasangan, sisanya harus genap).
    tunggal = isi.count("'")
    if tunggal % 2 != 0:
        masalah.append(f"{nama}: jumlah tanda kutip tunggal ganjil ({tunggal})")


def ekstrak(nama, isi, pola):
    return sorted(set(re.findall(pola, isi, flags=re.IGNORECASE)))


def main():
    if not os.path.isdir(DIR_MIGRASI):
        sys.exit(f"ERROR: direktori migrasi tidak ditemukan: {DIR_MIGRASI}")

    berkas_naik = sorted(
        f for f in os.listdir(DIR_MIGRASI)
        if f.endswith(".sql") and os.path.isfile(os.path.join(DIR_MIGRASI, f))
    )

    if not berkas_naik:
        sys.exit("ERROR: tidak ada berkas migrasi ditemukan.")

    print("=" * 78)
    print("PEMERIKSAAN STATIS BERKAS MIGRASI")
    print("=" * 78)
    print(f"Direktori: {os.path.relpath(DIR_MIGRASI, AKAR)}")
    print(f"Berkas    : {len(berkas_naik)} migrasi naik")
    print()

    for nama in berkas_naik:
        path = os.path.join(DIR_MIGRASI, nama)
        isi = baca(path)
        print(f"--- {nama} ---")

        cek_keseimbangan(nama, isi)

        # Fungsi dan tabel yang dibuat
        fungsi = ekstrak(nama, isi, r"create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)")
        tabel = ekstrak(nama, isi, r"create\s+table\s+if\s+not\s+exists\s+([a-z_][a-z0-9_]*)")

        print(f"    fungsi dibuat : {', '.join(fungsi) if fungsi else '(tidak ada)'}")
        print(f"    tabel dibuat  : {', '.join(tabel) if tabel else '(tidak ada)'}")

        # Pernyataan berbahaya tanpa penjagaan.
        # Komentar dibuang lebih dulu: tanpa ini, komentar yang menyebut
        # "DROP COLUMN" (mis. dokumentasi di header berkas) akan salah
        # terdeteksi sebagai pernyataan SQL.
        isi_tanpa_komentar = re.sub(r"--[^\n]*", "", isi)
        tanpa_if_exists = re.findall(
            r"drop\s+(table|column|function)\s+(?!if\s+exists)([a-z_][a-z0-9_.]*)",
            isi_tanpa_komentar,
            flags=re.IGNORECASE,
        )
        if tanpa_if_exists:
            for jenis, objek in tanpa_if_exists:
                peringatan.append(
                    f"{nama}: 'drop {jenis} {objek}' tanpa IF EXISTS — dapat gagal bila dijalankan ulang"
                )

        # Pencatatan versi
        versi = os.path.splitext(nama)[0]
        if "schema_migrations" not in isi:
            peringatan.append(f"{nama}: tidak mencatat versi ke schema_migrations")
        elif versi not in isi:
            peringatan.append(
                f"{nama}: nama berkas '{versi}' tidak muncul pada insert schema_migrations"
            )

        # Rollback pasangannya.
        #
        # Berkas "bootstrap" (biasanya yang paling awal, membuat tabel
        # infrastruktur seperti schema_migrations) sengaja TIDAK memiliki rollback:
        # menghapus catatan versi migrasi menghilangkan informasi penting tanpa
        # manfaat. Berkas seperti itu ditandai dengan kata BOOTSTRAP pada header.
        kandidat = [
            f for f in os.listdir(DIR_ROLLBACK)
            if f.startswith(versi) and f.endswith(".sql")
        ] if os.path.isdir(DIR_ROLLBACK) else []

        berkas_bootstrap = "BOOTSTRAP" in isi.upper()

        if not kandidat:
            if berkas_bootstrap:
                print(f"    rollback      : (tidak diperlukan — berkas bootstrap)")
            else:
                masalah.append(f"{nama}: TIDAK ada berkas rollback pasangan di rollback/")
                print(f"    rollback      : {merah}TIDAK ADA{reset}")
        else:
            rb = kandidat[0]
            isi_rb = baca(os.path.join(DIR_ROLLBACK, rb))
            print(f"    rollback      : {rb}")

            # Setiap fungsi yang dibuat harus dihapus di rollback.
            hilang = [f for f in fungsi if f not in isi_rb]
            if hilang:
                masalah.append(f"{rb}: tidak menghapus fungsi {', '.join(hilang)}")

            # Tabel yang dibuat dengan "create table if not exists" bersifat
            # KONDISIONAL: tabel itu mungkin sudah ada sebelum migrasi ini
            # (mis. schema_migrations yang dibuat berkas bootstrap). Karena itu
            # rollback TIDAK perlu menghapusnya — menghapus justru berisiko
            # merusak objek milik migrasi lain.
            #
            # Yang diperiksa: objek apa yang benar-benar di-drop oleh rollback.
            tabel_dihapus = ekstrak(rb, isi_rb, r"drop\s+table\s+if\s+exists\s+([a-z_][a-z0-9_]*)")
            tabel_wajib_dibersihkan = [t for t in tabel if t not in ("schema_migrations",)]
            tabel_kondisional = [t for t in tabel if t not in tabel_wajib_dibersihkan]

            if tabel_kondisional:
                print(
                    f"    catatan       : tabel kondisional tidak dihapus saat rollback: "
                    f"{', '.join(tabel_kondisional)} (benar, agar tidak merusak objek migrasi lain)"
                )

            hilang_t = [t for t in tabel_wajib_dibersihkan if t not in tabel_dihapus]
            if hilang_t:
                masalah.append(f"{rb}: tidak menghapus tabel {', '.join(hilang_t)}")

            cek_keseimbangan(rb, isi_rb)

        print()

    print("=" * 78)
    print("HASIL")
    print("=" * 78)

    if masalah:
        print(f"{merah}MASALAH ({len(masalah)}):{reset}")
        for m in masalah:
            print(f"  ✗ {m}")
    else:
        print(f"{hijau}✓ Tidak ditemukan masalah pada struktur migrasi.{reset}")

    if peringatan:
        print()
        print(f"{kuning}PERINGATAN ({len(peringatan)}):{reset}")
        for p in peringatan:
            print(f"  ! {p}")

    print()
    print("Catatan: pemeriksaan ini statis. Migrasi tetap harus diuji pada")
    print("database salinan (staging) sebelum dijalankan ke produksi.")

    sys.exit(1 if masalah else 0)


if __name__ == "__main__":
    main()
