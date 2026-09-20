#!/usr/bin/env python3
"""
hitung-akurasi.py — Menghitung metrik akurasi deteksi dari data ground truth.

TUJUAN
    Menggantikan klaim akurasi angka tunggal (mis. "92%") dengan metrik yang
    dapat dipertanggungjawabkan: confusion matrix, precision, recall, F1,
    akurasi per kelas, macro-average, dan BASELINE MAYORITAS-KELAS.

MENGAPA BASELINE PENTING
    Paper sendiri mengutip bahwa 85-88% siswa menyisakan makanan. Bila
    distribusi kelas tidak seimbang, akurasi mentah dapat terlihat tinggi
    hanya dengan selalu menebak kelas mayoritas. Script ini selalu menghitung
    baseline tersebut agar angka akurasi dapat ditafsirkan dengan jujur.

MASUKAN (CSV, dua kolom wajib)
    kebenaran,prediksi
    nasi,nasi
    sayur,lauk
    ...

    - `kebenaran` = label ground truth hasil pelabelan manusia
    - `prediksi`  = label keluaran Roboflow
    - Gunakan nilai khusus `__tidak_ada__` untuk "tidak ada sisa makanan".

CARA PAKAI
    python3 tools/validasi/hitung-akurasi.py data-label.csv
    python3 tools/validasi/hitung-akurasi.py data-label.csv --positif nasi

Tidak membutuhkan pustaka eksternal.
"""

import argparse
import csv
import sys
from collections import Counter, defaultdict


def baca_csv(path, kolom_kebenaran, kolom_prediksi):
    baris = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            sys.exit(f"ERROR: {path} kosong atau tanpa header.")
        for nama in (kolom_kebenaran, kolom_prediksi):
            if nama not in reader.fieldnames:
                sys.exit(
                    f"ERROR: kolom '{nama}' tidak ditemukan. "
                    f"Kolom tersedia: {', '.join(reader.fieldnames)}"
                )
        for i, r in enumerate(reader, start=2):
            k = (r[kolom_kebenaran] or "").strip()
            p = (r[kolom_prediksi] or "").strip()
            if not k:
                print(f"  PERINGATAN: baris {i} tanpa label kebenaran, dilewati.", file=sys.stderr)
                continue
            baris.append((k, p))
    return baris


def hitung(data):
    kelas = sorted({k for k, _ in data} | {p for _, p in data if p})
    n = len(data)

    # Confusion matrix: matrix[kebenaran][prediksi]
    m = defaultdict(Counter)
    for k, p in data:
        m[k][p] += 1

    benar = sum(1 for k, p in data if k == p)
    akurasi = benar / n if n else 0.0

    # Baseline mayoritas-kelas: selalu menebak kelas yang paling sering muncul
    # di ground truth.
    mayoritas, jumlah_mayoritas = Counter(k for k, _ in data).most_common(1)[0]
    akurasi_baseline = jumlah_mayoritas / n if n else 0.0

    per_kelas = []
    for c in kelas:
        tp = m[c][c]
        fp = sum(m[k][c] for k in kelas if k != c)
        fn = sum(m[c][p] for p in kelas if p != c)
        presisi = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * presisi * recall / (presisi + recall)) if (presisi + recall) else 0.0
        dukung = sum(m[c].values())
        per_kelas.append(
            {
                "kelas": c,
                "dukungan": dukung,
                "tp": tp, "fp": fp, "fn": fn,
                "presisi": presisi, "recall": recall, "f1": f1,
            }
        )

    macro_p = sum(x["presisi"] for x in per_kelas) / len(per_kelas) if per_kelas else 0.0
    macro_r = sum(x["recall"] for x in per_kelas) / len(per_kelas) if per_kelas else 0.0
    macro_f1 = sum(x["f1"] for x in per_kelas) / len(per_kelas) if per_kelas else 0.0

    penting = sum(x["dukungan"] for x in per_kelas)
    weighted_f1 = (
        sum(x["f1"] * x["dukungan"] for x in per_kelas) / penting if penting else 0.0
    )

    return {
        "n": n,
        "kelas": kelas,
        "matrix": m,
        "benar": benar,
        "akurasi": akurasi,
        "baseline_kelas": mayoritas,
        "akurasi_baseline": akurasi_baseline,
        "per_kelas": per_kelas,
        "macro_presisi": macro_p,
        "macro_recall": macro_r,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
    }


def cetak(hasil, file=None):
    def tulis(s=""):
        print(s, file=file)

    h = hasil
    tulis("=" * 74)
    tulis("HASIL EVALUASI AKURASI DETEKSI")
    tulis("=" * 74)
    tulis(f"Jumlah sampel berlabel (n) : {h['n']}")
    tulis(f"Jumlah kelas               : {len(h['kelas'])}")
    tulis("")

    tulis("--- Confusion matrix (baris = kebenaran, kolom = prediksi) ---")
    header = "kebenaran \\ prediksi".ljust(22) + "".join(c[:14].rjust(16) for c in h["kelas"])
    tulis(header)
    for k in h["kelas"]:
        baris = k.ljust(22)
        for p in h["kelas"]:
            baris += str(h["matrix"][k][p]).rjust(16)
        tulis(baris)
    tulis("")

    tulis("--- Metrik per kelas ---")
    tulis(f"{'kelas':<22}{'n':>6}{'presisi':>10}{'recall':>10}{'F1':>10}")
    for x in h["per_kelas"]:
        tulis(
            f"{x['kelas']:<22}{x['dukungan']:>6}"
            f"{x['presisi']:>10.3f}{x['recall']:>10.3f}{x['f1']:>10.3f}"
        )
    tulis("")

    tulis("--- Ringkasan ---")
    tulis(f"Akurasi keseluruhan        : {h['akurasi']*100:.2f}%  ({h['benar']}/{h['n']})")
    tulis(
        f"Baseline mayoritas-kelas   : {h['akurasi_baseline']*100:.2f}%  "
        f"(selalu menebak '{h['baseline_kelas']}')"
    )
    selisih = (h["akurasi"] - h["akurasi_baseline"]) * 100
    tanda = "+" if selisih >= 0 else ""
    tulis(f"Selisih vs baseline        : {tanda}{selisih:.2f} poin persen")
    tulis("")
    tulis(f"Macro precision            : {h['macro_presisi']*100:.2f}%")
    tulis(f"Macro recall               : {h['macro_recall']*100:.2f}%")
    tulis(f"Macro F1                   : {h['macro_f1']*100:.2f}%")
    tulis(f"Weighted F1                : {h['weighted_f1']*100:.2f}%")
    tulis("")

    tulis("--- Cara membaca hasil ini untuk paper ---")
    if h["n"] < 30:
        tulis(
            f"  PERINGATAN: n={h['n']} terlalu kecil untuk menyimpulkan kinerja model. "
            "Laporkan sebagai uji awal, bukan akurasi sistem."
        )
    if selisih <= 5:
        tulis(
            "  PERHATIAN: akurasi hanya sedikit di atas baseline mayoritas-kelas. "
            "Angka akurasi mentah TIDAK boleh diklaim sebagai bukti kinerja model "
            "tanpa menyebut baseline ini."
        )
    else:
        tulis(
            f"  Akurasi melampaui baseline sebesar {selisih:.2f} poin persen; "
            "laporkan bersama confusion matrix dan macro-F1."
        )
    if h["macro_f1"] < h["akurasi"]:
        tulis(
            "  Macro-F1 lebih rendah dari akurasi -> ada kelas minoritas yang "
            "kinerjanya buruk walau akurasi total terlihat baik."
        )
    tulis("")
    tulis("Wajib dilaporkan di paper: n, confusion matrix, macro-F1, dan baseline.")


def main():
    ap = argparse.ArgumentParser(description="Hitung akurasi deteksi dari CSV ground truth.")
    ap.add_argument("csv", help="Berkas CSV dengan kolom kebenaran dan prediksi")
    ap.add_argument("--kolom-kebenaran", default="kebenaran")
    ap.add_argument("--kolom-prediksi", default="prediksi")
    ap.add_argument("--keluaran", help="Simpan hasil ke berkas teks ini")
    args = ap.parse_args()

    try:
        data = baca_csv(args.csv, args.kolom_kebenaran, args.kolom_prediksi)
    except FileNotFoundError:
        sys.exit(f"ERROR: berkas '{args.csv}' tidak ditemukan.")

    if not data:
        sys.exit("ERROR: tidak ada baris data yang dapat diproses.")

    hasil = hitung(data)

    if args.keluaran:
        with open(args.keluaran, "w", encoding="utf-8") as f:
            cetak(hasil, file=f)
        cetak(hasil)
        print(f"\nHasil juga disimpan ke: {args.keluaran}")
    else:
        cetak(hasil)


if __name__ == "__main__":
    main()
