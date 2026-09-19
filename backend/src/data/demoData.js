const publicKpi = {
  totalLimbahTerolahKg: 8420,
  totalPanenMaggotKg: 2650,
  penghematanEmisiCo2e: 1310
}

const wasteByCategory = [
  { kategori: 'Nasi', beratKg: 3120 },
  { kategori: 'Sayur', beratKg: 2480 },
  { kategori: 'Lauk', beratKg: 1890 },
  { kategori: 'Buah', beratKg: 930 }
]

const educationCards = [
  {
    judul: 'Siklus Hidup BSF',
    isi: 'Lalat black soldier fly bertelur, larva tumbuh selama dua minggu sambil memakan sisa makanan, lalu berubah menjadi pupa sebelum menjadi lalat dewasa.'
  },
  {
    judul: 'Manfaat Protein Maggot',
    isi: 'Maggot kering mengandung protein di atas 40 persen sehingga banyak dipakai sebagai bahan pakan ternak dan ikan pengganti tepung ikan.'
  },
  {
    judul: 'Nilai Ekonomi Sirkular',
    isi: 'Sisa makanan yang tadinya dibuang diubah menjadi maggot segar dan kering yang punya nilai jual, sehingga sekolah ikut memperoleh pemasukan tambahan.'
  }
]

const sensorReadings = {
  suhuBilikC: 29.4,
  kelembabanPersen: 68,
  kadarAmoniaPpm: 12,
  suhuSubstratC: 33.2,
  estimasiBeratMaggotKg: 145.6,
  aman: true,
  rekomendasi: null,
  updatedAt: new Date().toISOString()
}

const maggotBatches = [
  { id: 'demo-batch-1', batchKode: 'MBG-001', tanggalMulai: '2026-09-01', beratTelurGram: 250, biayaBeli: 150000, status: 'inkubasi', catatan: 'Telur dari hatchery mitra' },
  { id: 'demo-batch-2', batchKode: 'MBG-002', tanggalMulai: '2026-08-20', beratTelurGram: 200, biayaBeli: 120000, status: 'aktif_makan', catatan: null }
]

const menuUploads = [
  { id: 'demo-menu-1', tanggal: '2026-09-05', nama: 'Nasi, ayam bakar, tumis kangkung', kalori: 620, protein: 28, fotoUrl: null },
  { id: 'demo-menu-2', tanggal: '2026-09-06', nama: 'Nasi, telur dadar, sayur bayam', kalori: 540, protein: 19, fotoUrl: null }
]

const aiPrediction = {
  estimasiVolumeLimbahHarianKg: 62,
  prediksiJadwalPanen: '2026-09-15',
  catatan: 'Berdasarkan pola tujuh hari terakhir, volume limbah cenderung naik setiap hari Senin.'
}

const salesRecords = [
  { id: 'demo-jual-1', tanggal: '2026-09-01', jenis: 'segar', beratKg: 40, hargaPerKg: 7000, total: 280000 },
  { id: 'demo-jual-2', tanggal: '2026-09-03', jenis: 'kering', beratKg: 12, hargaPerKg: 25000, total: 300000 }
]

const aiCorrelationTable = [
  { menu: 'Sayur bayam bening', rataRataTerbuangKg: 18.4, rekomendasi: 'Kurangi porsi sayur 20 persen dan ganti bumbu agar lebih gurih.' },
  { menu: 'Ikan kembung goreng', rataRataTerbuangKg: 6.1, rekomendasi: 'Porsi sudah pas, pertahankan resep saat ini.' },
  { menu: 'Nasi putih', rataRataTerbuangKg: 22.7, rekomendasi: 'Turunkan porsi nasi per anak sebesar satu sendok sayur.' }
]

const efficiencyTrend = [
  { minggu: 'Minggu 1', totalLimbahKg: 610 },
  { minggu: 'Minggu 2', totalLimbahKg: 560 },
  { minggu: 'Minggu 3', totalLimbahKg: 505 },
  { minggu: 'Minggu 4', totalLimbahKg: 470 }
]

const nowIso = () => new Date().toISOString()

const devices = [
  {
    id: 'smart-container',
    nama: 'Smart Container',
    tipe: 'esp32-cam',
    online: true,
    lastSeen: nowIso(),
    lastTelemetry: null,
    statusPesan: { perangkat: 'smart-container', heartbeat: true, beratKg: 0.042, scaleFaktor: 471.25 },
    calibration: { scaleFaktor: 471.25 },
    cmdResult: null
  },
  {
    id: 'maggot-chamber',
    nama: 'Maggot Chamber',
    tipe: 'esp8266',
    online: true,
    lastSeen: nowIso(),
    lastTelemetry: {
      batchId: '',
      suhuBilikC: 29.4,
      kelembabanPersen: 68,
      kadarAmoniaPpm: 12,
      suhuSubstratC: 33.2,
      beratMaggotPanenKg: 1.45
    },
    statusPesan: { perangkat: 'maggot-chamber', scaleFaktor: 449.8, mq135R0: 31.7 },
    calibration: { scaleFaktor: 449.8, mq135R0: 31.7 },
    cmdResult: null
  }
]

module.exports = {
  publicKpi,
  wasteByCategory,
  educationCards,
  sensorReadings,
  maggotBatches,
  menuUploads,
  aiPrediction,
  salesRecords,
  aiCorrelationTable,
  efficiencyTrend,
  devices
}
