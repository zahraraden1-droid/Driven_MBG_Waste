#!/usr/bin/env python3
"""
test_integrasi_auth.py — Test integrasi autentikasi lewat HTTP sesungguhnya.

Berbeda dari test_auth.py yang menguji fungsi secara langsung dengan modul
di-stub, test ini memuat aplikasi FastAPI yang sebenarnya dan mengirim
permintaan HTTP nyata melalui TestClient. Tujuannya memastikan pemasangan
`Depends(verifikasi_layanan_internal)` benar-benar bekerja pada level endpoint.

Jika FastAPI belum terpasang, test ini DILEWATI dengan pesan yang jelas — bukan
gagal — agar pengembang yang hanya mengerjakan backend tidak terhalang.
CI memasang FastAPI sehingga test ini benar-benar berjalan di sana.

Cara menjalankan:

    pip install fastapi httpx
    python3 ai_service/test_integrasi_auth.py
"""

import importlib.util
import os
import sys
import unittest
from pathlib import Path

AKAR = Path(__file__).resolve().parent
BERKAS_MAIN = AKAR / "app" / "main.py"

TERSEDIA_FASTAPI = importlib.util.find_spec("fastapi") is not None
TERSEDIA_HTTPX = importlib.util.find_spec("httpx") is not None


def muat_aplikasi(kunci=None, wajib=False):
    """Memuat aplikasi dengan variabel lingkungan tertentu, lalu mengembalikannya."""
    if kunci is None:
        os.environ.pop("AI_INTERNAL_KEY", None)
    else:
        os.environ["AI_INTERNAL_KEY"] = kunci
    os.environ["AI_REQUIRE_AUTH"] = "true" if wajib else "false"

    sys.path.insert(0, str(AKAR))
    for nama in ("app.main", "app"):
        if nama in sys.modules:
            del sys.modules[nama]

    from app.main import app  # noqa: E402

    return app


@unittest.skipUnless(
    TERSEDIA_FASTAPI and TERSEDIA_HTTPX,
    "FastAPI/httpx belum terpasang — jalankan: pip install fastapi httpx",
)
class TestIntegrasiAutentikasi(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient

        self.TestClient = TestClient

    def test_health_tetap_terbuka_tanpa_kunci(self):
        app = muat_aplikasi(kunci="rahasia-uji")
        klien = self.TestClient(app)
        r = klien.get("/health")
        self.assertEqual(r.status_code, 200, "/health harus dapat diakses untuk health check")

    def test_prediksi_tolak_tanpa_header_saat_kunci_aktif(self):
        app = muat_aplikasi(kunci="rahasia-uji")
        klien = self.TestClient(app)
        r = klien.post("/predict/waste", json={"riwayat": [], "batches": []})
        self.assertEqual(r.status_code, 401, "tanpa header harus ditolak 401")

    def test_prediksi_tolak_header_salah(self):
        app = muat_aplikasi(kunci="rahasia-uji")
        klien = self.TestClient(app)
        r = klien.post(
            "/predict/waste",
            json={"riwayat": [], "batches": []},
            headers={"X-Internal-Key": "salah"},
        )
        self.assertEqual(r.status_code, 401)

    def test_prediksi_terima_header_benar(self):
        app = muat_aplikasi(kunci="rahasia-uji")
        klien = self.TestClient(app)
        r = klien.post(
            "/predict/waste",
            json={"riwayat": [{"minggu": "2026-M38", "totalLimbahKg": 0.2}], "batches": []},
            headers={"X-Internal-Key": "rahasia-uji"},
        )
        self.assertEqual(r.status_code, 200, f"harus 200, dapat {r.status_code}: {r.text[:200]}")
        badan = r.json()
        self.assertIn("estimasiVolumeLimbahHarianKg", badan)

    def test_korelasi_menu_dilindungi_juga(self):
        app = muat_aplikasi(kunci="rahasia-uji")
        klien = self.TestClient(app)
        r = klien.post("/analyze/menu-correlation", json={"menu": [], "waste": []})
        self.assertEqual(r.status_code, 401)

    def test_transisi_tanpa_kunci_masih_melayani(self):
        app = muat_aplikasi(kunci=None)
        klien = self.TestClient(app)
        r = klien.post("/predict/waste", json={"riwayat": [], "batches": []})
        self.assertEqual(
            r.status_code,
            200,
            "masa transisi: tanpa kunci layanan tetap melayani agar backend lama tidak putus",
        )


if __name__ == "__main__":
    if not (TERSEDIA_FASTAPI and TERSEDIA_HTTPX):
        print("DILEWATI: FastAPI/httpx belum terpasang.")
        print("Jalankan: pip install fastapi httpx")
    unittest.main(verbosity=2)
