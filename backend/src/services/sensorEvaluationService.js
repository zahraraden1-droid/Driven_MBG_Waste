function angka(ambil, nilai) {
  const n = Number(nilai)
  return Number.isFinite(n) && ambil(n) ? n : null
}

function evaluateChamberConditions({ suhuBilikC, kelembabanPersen, kadarAmoniaPpm, suhuSubstratC }) {
  const masalah = []

  const suhuBilik = angka(() => true, suhuBilikC)
  const substrat = angka(() => true, suhuSubstratC)
  const amonia = angka(() => true, kadarAmoniaPpm)
  const kelembaban = angka(() => true, kelembabanPersen)

  if (substrat !== null && substrat > 36) {
    masalah.push('Suhu substrat terlalu panas (lebih dari 36°C). Segera lakukan aerasi/pembalikan substrat untuk menurunkan panas.')
  }
  if (substrat !== null && substrat < 28) {
    masalah.push('Suhu substrat terlalu rendah (kurang dari 28°C). Tutup substrat untuk menjaga panas pengomposan.')
  }
  if (suhuBilik !== null && suhuBilik < 24) {
    masalah.push('Suhu bilik terlalu dingin (kurang dari 24°C). Tutup ventilasi untuk menaikkan suhu bilik.')
  }
  if (suhuBilik !== null && suhuBilik > 32) {
    masalah.push('Suhu bilik terlalu panas (lebih dari 32°C). Buka ventilasi untuk menurunkan suhu bilik.')
  }
  if (amonia !== null && amonia > 15) {
    masalah.push('Kadar amonia tinggi (lebih dari 15 ppm). Taburkan dedak atau arang aktif untuk menyerap amonia.')
  }
  if (kelembaban !== null && (kelembaban < 60 || kelembaban > 80)) {
    masalah.push(`Kelembaban udara di luar rentang ideal 60-80% (saat ini ${kelembaban}%). Sesuaikan sirkulasi udara atau lakukan penyiraman secukupnya.`)
  }

  if (masalah.length) {
    return { aman: false, rekomendasi: masalah.join(' ') }
  }

  return { aman: true, rekomendasi: null }
}

module.exports = evaluateChamberConditions