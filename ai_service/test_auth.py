#!/usr/bin/env python3
"""
test_auth.py — Test autentikasi layanan AI.

Mengapa test ini penting
------------------------
Sebelum diperbaiki, AI service TIDAK memiliki autentikasi apa pun dan diekspos
ke internet. Test ini mengunci perilaku yang harus berlaku:

  1. Tanpa AI_INTERNAL_KEY  -> layanan tetap melayani (masa transisi) tetapi
     memberi peringatan keamanan. Ini disengaja agar deploy AI service tidak
     langsung memutus backend versi lama.
  2. Ada AI_INTERNAL_KEY    -> permintaan tanpa header atau dengan header salah
     DITOLAK (401).
  3. Header benar           -> diterima.
  4. AI_REQUIRE_AUTH=true dan kunci kosong -> permintaan gagal (503), bukan
     diam-diam terbuka.

Cara menjalankan (tanpa perlu memasang FastAPI):

    python3 ai_service/test_auth.py

Modul `fastapi` dan `pydantic` di-stub karena yang diuji adalah logika
autentikasi, bukan framework-nya. Test ini juga dijalankan di CI.
"""

import hmac
import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path

AKAR = Path(__file__).resolve().parent
BERKAS_MAIN = AKAR / "app" / "main.py"


def pasang_stub():
    """Memasang modul tiruan minimal untuk fastapi dan pydantic."""

    class HTTPException(Exception):
        def __init__(self, status_code=None, detail=None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class _Status:
        HTTP_401_UNAUTHORIZED = 401
        HTTP_503_SERVICE_UNAVAILABLE = 503

    class FastAPI:
        def __init__(self, *a, **k):
            pass

        def get(self, *a, **k):
            def dekorator(fn):
                return fn

            return dekorator

        def post(self, *a, **k):
            def dekorator(fn):
                return fn

            return dekorator

    def Depends(fn=None):  # noqa: N802 - meniru nama FastAPI
        return fn

    def Header(default=None):  # noqa: N802
        return default

    class BaseModel:
        pass

    fastapi = types.ModuleType("fastapi")
    fastapi.FastAPI = FastAPI
    fastapi.Depends = Depends
    fastapi.Header = Header
    fastapi.HTTPException = HTTPException
    fastapi.status = _Status()
    sys.modules["fastapi"] = fastapi

    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = BaseModel
    sys.modules["pydantic"] = pydantic


def muat_modul(kunci=None, wajib=False):
    """Memuat ulang app/main.py dengan variabel lingkungan tertentu."""
    if kunci is None:
        os.environ.pop("AI_INTERNAL_KEY", None)
    else:
        os.environ["AI_INTERNAL_KEY"] = kunci

    os.environ["AI_REQUIRE_AUTH"] = "true" if wajib else "false"

    spesifikasi = importlib.util.spec_from_file_location("ai_main", BERKAS_MAIN)
    modul = importlib.util.module_from_spec(spesifikasi)
    spesifikasi.loader.exec_module(modul)
    return modul


class TestAutentikasiLayananAI(unittest.TestCase):
    def setUp(self):
        pasang_stub()

    # -- Masa transisi: kunci belum diatur --------------------------------
    def test_tanpa_kunci_layanan_tetap_melayani(self):
        m = muat_modul(kunci=None)
        self.assertTrue(
            m.verifikasi_layanan_internal(None),
            "tanpa kunci, layanan harus tetap melayani agar tidak memutus backend lama",
        )

    def test_tanpa_kunci_tetap_melayani_walau_header_ada(self):
        m = muat_modul(kunci=None)
        self.assertTrue(m.verifikasi_layanan_internal("apa-saja"))

    # -- Kunci aktif: penolakan ------------------------------------------
    def test_kunci_aktif_menolak_tanpa_header(self):
        m = muat_modul(kunci="rahasia-uji")
        with self.assertRaises(m.HTTPException) as ctx:
            m.verifikasi_layanan_internal(None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_kunci_aktif_menolak_header_salah(self):
        m = muat_modul(kunci="rahasia-uji")
        with self.assertRaises(m.HTTPException) as ctx:
            m.verifikasi_layanan_internal("kunci-palsu")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_kunci_aktif_menolak_string_kosong(self):
        m = muat_modul(kunci="rahasia-uji")
        with self.assertRaises(m.HTTPException):
            m.verifikasi_layanan_internal("")

    # -- Kunci aktif: penerimaan -----------------------------------------
    def test_kunci_aktif_menerima_header_benar(self):
        m = muat_modul(kunci="rahasia-uji")
        self.assertTrue(m.verifikasi_layanan_internal("rahasia-uji"))

    # -- Konfigurasi tidak lengkap ---------------------------------------
    def test_wajib_auth_tanpa_kunci_menghasilkan_503(self):
        m = muat_modul(kunci=None, wajib=True)
        with self.assertRaises(m.HTTPException) as ctx:
            m.verifikasi_layanan_internal(None)
        self.assertEqual(
            ctx.exception.status_code,
            503,
            "konfigurasi tidak lengkap harus gagal, bukan terbuka diam-diam",
        )

    # -- Ruang lingkup: /health tetap terbuka ----------------------------
    def test_endpoint_health_tidak_bergantung_pada_autentikasi(self):
        isi = BERKAS_MAIN.read_text(encoding="utf-8")
        # Ambil blok fungsi health saja.
        mulai = isi.index('@app.get("/health")')
        akhir = isi.index("@app.post", mulai)
        blok = isi[mulai:akhir]
        self.assertNotIn(
            "Depends(verifikasi_layanan_internal)",
            blok,
            "/health harus tetap terbuka agar dapat dipakai sebagai health check",
        )

    def test_endpoint_prediksi_dan_korelasi_dilindungi(self):
        isi = BERKAS_MAIN.read_text(encoding="utf-8")
        self.assertEqual(
            isi.count("Depends(verifikasi_layanan_internal)"),
            2,
            "endpoint /predict/waste dan /analyze/menu-correlation harus dilindungi",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
