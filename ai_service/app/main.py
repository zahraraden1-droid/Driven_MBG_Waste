from datetime import date, datetime, timedelta
from statistics import mean

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="SPPG MBG AI Service", version="1.0.0")

HARI_PANEN_MAGGOT = 21
HARI_SEKOLAH_PER_PEKAN = 5

KATEGORI_LABEL = {
    "nasi": "Nasi",
    "sayur": "Sayur",
    "lauk": "Lauk",
    "buah": "Buah",
    "lainnya": "Lainnya",
}


class RiwayatPoint(BaseModel):
    minggu: str | None = None
    totalLimbahKg: float | None = None


class BatchInfo(BaseModel):
    batchKode: str | None = None
    tanggalMulai: str | None = None
    status: str | None = None
    beratTelurGram: float | None = None


class PredictWasteRequest(BaseModel):
    riwayat: list[RiwayatPoint] = []
    batches: list[BatchInfo] = []


class MenuRecord(BaseModel):
    tanggal: str | None = None
    nama: str | None = None
    kalori: float | None = None
    protein: float | None = None


class WasteRecord(BaseModel):
    tanggal: str | None = None
    kategori: str | None = None
    berat_kg: float | None = None


class MenuCorrelationRequest(BaseModel):
    menu: list[MenuRecord] = []
    waste: list[WasteRecord] = []


def _lerp(x0, y0, x1, y1, x):
    if x1 == x0:
        return y0
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def _linear_forecast(points):
    clean = [p for p in points if p is not None]
    n = len(clean)
    if n == 0:
        return None
    if n == 1:
        return clean[0]
    x_mean = (n - 1) / 2
    y_mean = mean(clean)
    num = sum((i - x_mean) * (y - y_mean) for i, y in enumerate(clean))
    den = sum((i - x_mean) ** 2 for i in range(n))
    slope = num / den if den else 0.0
    inter = y_mean - slope * x_mean
    return inter + slope * n


@app.get("/health")
def health():
    return {"status": "ok", "service": "sppg-mbg-ai"}


@app.post("/predict/waste")
def predict_waste(req: PredictWasteRequest):
    weekly = [p.totalLimbahKg for p in req.riwayat if p.totalLimbahKg is not None]
    weekly_trend = [p.totalLimbahKg for p in req.riwayat if p.totalLimbahKg is not None]

    forecast_week = _linear_forecast(weekly_trend)
    if forecast_week is None:
        estimasi_harian = 62.0
        catatan = (
            "Belum ada cukup data historis. Estimasi memakai nilai dasar "
            "hingga data mingguan terkumpul."
        )
    else:
        estimasi_harian = max(forecast_week / HARI_SEKOLAH_PER_PEKAN, 0)
        naik = forecast_week > (weekly[-1] if weekly else 0)
        arah = "cenderung naik" if naik else "cenderung turun"
        catatan = (
            f"Berdasarkan tren {len(weekly)} pekan terakhir, volume limbah {arah}. "
            "Kalibrasi ulang setiap pekan dengan data baru."
        )

    prediksi_panen = _prediksi_harvest(req.batches)
    estimasi_harian = round(estimasi_harian, 1)

    if prediksi_panen and (estimasi_harian < 1):
        catatan = f"{catatan} Jadwal panen mengikuti umur batch maggot aktif."

    return {
        "estimasiVolumeLimbahHarianKg": estimasi_harian,
        "prediksiJadwalPanen": prediksi_panen,
        "catatan": catatan,
        "confidence": 0.72 if weekly else 0.30,
    }


def _prediksi_harvest(batches):
    kandidat = []
    for b in batches:
        if not b.tanggalMulai:
            continue
        try:
            mulai = datetime.strptime(b.tanggalMulai, "%Y-%m-%d").date()
        except ValueError:
            continue
        status = (b.status or "").strip().lower()
        if status in ("selesai_panen", "siap_panen"):
            continue
        if status == "inkubasi":
            hari = HARI_PANEN_MAGGOT + 3
        else:
            hari = HARI_PANEN_MAGGOT
        kandidat.append(mulai + timedelta(days=hari))

    if not kandidat:
        return (date.today() + timedelta(days=HARI_PANEN_MAGGOT)).isoformat()
    return min(kandidat).isoformat()


@app.post("/analyze/menu-correlation")
def menu_correlation(req: MenuCorrelationRequest):
    if not req.menu and not req.waste:
        return _fallback_correlations()

    menu_by_date = {}
    for m in req.menu:
        if not m.tanggal or not m.nama:
            continue
        menu_by_date.setdefault(m.tanggal, []).append(m.nama)

    waste_by_date = {}
    for w in req.waste:
        if not w.tanggal or w.berat_kg is None:
            continue
        waste_by_date.setdefault(w.tanggal, 0)
        waste_by_date[w.tanggal] += float(w.berat_kg)

    menu_total = {}
    menu_hari = {}
    for tanggal, namas in menu_by_date.items():
        if tanggal not in waste_by_date:
            continue
        berat = waste_by_date[tanggal]
        for nama in namas:
            menu_total[nama] = menu_total.get(nama, 0.0) + berat
            menu_hari[nama] = menu_hari.get(nama, 0) + 1

    if not menu_total:
        return _fallback_correlations()

    results = []
    for nama, total in menu_total.items():
        rata = total / menu_hari[nama]
        results.append(
            {
                "menu": nama,
                "rataRataTerbuangKg": round(rata, 1),
                "rekomendasi": _rekomendasi_menu(rata),
            }
        )

    results.sort(key=lambda r: r["rataRataTerbuangKg"], reverse=True)
    return results


def _rekomendasi_menu(rata):
    if rata >= 15:
        return "Porsi terlalu besar, kurangi 20 persen dan evaluasi penerimaan anak tiap pekan."
    if rata >= 8:
        return "Pertahankan porsi, dorong penyajian lebih menarik agar sisa turun."
    return "Porsi sudah sesuai, tingkatkan frekuensi menu ini."


def _fallback_correlations():
    return [
        {
            "menu": "Sayur",
            "rataRataTerbuangKg": 18.4,
            "rekomendasi": "Kurangi porsi sayur dan variasikan olahan agar lebih disukai.",
        },
        {
            "menu": "Nasi",
            "rataRataTerbuangKg": 22.7,
            "rekomendasi": "Sesuaikan porsi nasi per anak dengan tingkat konsumsi riil.",
        },
        {
            "menu": "Lauk",
            "rataRataTerbuangKg": 6.1,
            "rekomendasi": "Porsi lauk sudah sesuai, pertahankan variasi resep.",
        },
    ]