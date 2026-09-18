const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL
const ROBOFLOW_VERSION = process.env.ROBOFLOW_VERSION || '1'

const KATEGORI_RULES = [
  { kategori: 'nasi', pola: ['nasi', 'rice', 'karbo', 'putih'] },
  { kategori: 'sayur', pola: ['sayur', 'capcai', 'cap_cai', 'cah', 'buncis', 'bayam', 'kangkung', 'vegetable', 'wortel', 'brokoli', 'sawi', 'bungkus', 'oseng', 'tumis'] },
  { kategori: 'lauk', pola: ['lauk', 'ayam', 'ikan', 'tempe', 'tahu', 'telur', 'egg', 'meat', 'protein', 'rendang', 'goreng', 'kembung', 'teri', 'bakar'] },
  { kategori: 'buah', pola: ['buah', 'fruit', 'pisang', 'melon', 'apel', 'jeruk', 'semangka', 'kelengkeng', 'anggur', 'mangga', 'pepaya', 'jambu', 'salak', 'rambutan'] }
]

const KATEGORI_LABEL = {
  nasi: 'Nasi',
  sayur: 'Sayur',
  lauk: 'Lauk',
  buah: 'Buah',
  lainnya: 'Lainnya'
}

function mapClassToKategori(kelas) {
  const nama = String(kelas || '').toLowerCase()
  for (const rule of KATEGORI_RULES) {
    if (rule.pola.some((kata) => nama.includes(kata))) return rule.kategori
  }
  return 'lainnya'
}

function createSeededRandom(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function mockPredictions(totalWeightKg) {
  const seed = Math.round(totalWeightKg * 1000) || 1
  const rand = createSeededRandom(seed)
  const kelas = ['nasi', 'sayur_buncis', 'sayur_bayam', 'lauk_ayam', 'lauk_ikan', 'buah_pisang']
  return kelas.map((k) => {
    const r = 0.85 + rand() * 0.12
    const lebar = 120 + rand() * 140
    const tinggi = 90 + rand() * 120
    return { class: k, confidence: Number(r.toFixed(2)), width: Math.round(lebar), height: Math.round(tinggi), x: Math.round(rand() * 320), y: Math.round(rand() * 240) }
  })
}

function hitungProportion(predictions, totalWeightKg) {
  const jumlahLuas = predictions.reduce((sum, p) => sum + Number(p.width) * Number(p.height), 0)

  return {
    totalBeratKg: Number(totalWeightKg) || 0,
    deteksi: predictions.map((p) => {
      const luasPiksel = Number(p.width) * Number(p.height)
      const proporsi = jumlahLuas > 0 ? luasPiksel / jumlahLuas : 0
      const kategori = mapClassToKategori(p.class)
      return {
        kelas: p.class,
        kategori,
        namaKategori: KATEGORI_LABEL[kategori] || kategori,
        luasPiksel,
        proporsi: Number((proporsi * 100).toFixed(1)),
        beratKg: Number((Number(totalWeightKg) * proporsi).toFixed(3)),
        confidence: p.confidence
      }
    })
  }
}

async function detectFoodWaste(imageBuffer, totalWeightKg) {
  if (!ROBOFLOW_API_KEY || !ROBOFLOW_MODEL) {
    return { mode: 'mock', ...hitungProportion(mockPredictions(totalWeightKg), totalWeightKg) }
  }

  try {
    const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}?api_key=${ROBOFLOW_API_KEY}`
    const formData = new FormData()
    formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'foto.jpg')

    const response = await fetch(url, { method: 'POST', body: formData, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Roboflow merespon status ${response.status}`)

    const json = await response.json()
    const predictions = Array.isArray(json.predictions) ? json.predictions : []
    return { mode: 'roboflow', ...hitungProportion(predictions, totalWeightKg) }
  } catch (err) {
    return { mode: 'mock', catatan: err.message, ...hitungProportion(mockPredictions(totalWeightKg), totalWeightKg) }
  }
}

module.exports = { detectFoodWaste, mapClassToKategori, KATEGORI_LABEL }