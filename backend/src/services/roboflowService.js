const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL
const ROBOFLOW_VERSION = process.env.ROBOFLOW_VERSION || '1'
const ROBOFLOW_WORKFLOW_ID = process.env.ROBOFLOW_WORKFLOW_ID
const ROBOFLOW_WORKFLOW_URL = process.env.ROBOFLOW_WORKFLOW_URL || 'https://serverless.roboflow.com'
const ROBOFLOW_WORKFLOW_INPUT = process.env.ROBOFLOW_WORKFLOW_INPUT || 'image'

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

// ---------------------------------------------------------------------------
// Pembobotan distribusi berat.
//
// v1 `luas_bbox_v1` (perilaku lama, tetap jadi default saat ini):
//   s_i = w_i * h_i          <- HANYA luas; confidence diabaikan sepenuhnya
//
// v2 `densitas_v2` (baru, perlu kalibrasi sebelum diaktifkan):
//   s_i = d_kelas(i) * (w_i * h_i)^gamma * c_i^beta
//   c_i = max(0, conf_i - theta) / (1 - theta)
//
// Saat gamma=1, beta=0 (c^0=1), dan d=1, rumus v2 KEMBALI PERSIS ke v1.
// Karena itu peralihan metode reversibel lewat env SKEMA_BERAT, tanpa deploy kode.
// ---------------------------------------------------------------------------

// Densitas relatif per kelas, ternormalisasi terhadap nasi = 1.00.
// Sumber nilai: asumsi awal, BELUM TERVALIDASI. Salinan acuan ada di tabel
// `food_density` (supabase/migrations/20260920_provenance.sql).
const DENSITAS_RELATIF = {
  nasi: 1.0,
  rice: 1.0,
  tempe: 0.95,
  tahu: 0.9,
  ayam_goreng: 0.7,
  ayam: 0.7,
  ikan: 0.75,
  telur: 0.95,
  cap_cai: 0.55,
  sayur: 0.55,
  kelengkeng: 0.65,
  pisang: 0.65,
  buah: 0.65
}
const DENSITAS_DEFAULT = 0.8

const SKEMA_BERAT = process.env.SKEMA_BERAT || 'luas_bbox_v1'
const CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.4)
const SIZE_EXPONENT = Number(process.env.SIZE_EXPONENT ?? 1.0)
const CONFIDENCE_EXPONENT = Number(process.env.CONFIDENCE_EXPONENT ?? 0.0)

function densitasUntuk(kelas) {
  const key = String(kelas || '').toLowerCase().replace(/\s+/g, '_')
  if (DENSITAS_RELATIF[key] !== undefined) return DENSITAS_RELATIF[key]
  // Coba pencocokan sebagian, mis. 'ayam_goreng_paha' -> 'ayam_goreng'
  for (const [k, v] of Object.entries(DENSITAS_RELATIF)) {
    if (key.includes(k)) return v
  }
  return DENSITAS_DEFAULT
}

function hitungProportion(predictions, totalWeightKg, opsi = {}) {
  const skema = opsi.skemaBerat || SKEMA_BERAT
  const pakaiFilterConfidence = skema !== 'luas_bbox_v1'

  // Deteksi di bawah ambang confidence tidak boleh ikut menentukan distribusi.
  const dipakai = pakaiFilterConfidence
    ? predictions.filter((p) => (Number(p.confidence) || 0) >= CONFIDENCE_THRESHOLD)
    : predictions

  const dihitung = dipakai.map((p) => {
    const luasPiksel = Number(p.width) * Number(p.height)
    const conf = Math.max(0, Math.min(1, Number(p.confidence) || 0))

    let bobot
    if (pakaiFilterConfidence) {
      const c = Math.max(0, conf - CONFIDENCE_THRESHOLD) / (1 - CONFIDENCE_THRESHOLD)
      bobot =
        densitasUntuk(p.class) *
        Math.pow(luasPiksel, SIZE_EXPONENT) *
        Math.pow(c, CONFIDENCE_EXPONENT)
    } else {
      bobot = luasPiksel
    }

    return { prediksi: p, luasPiksel, bobot, confidence: conf }
  })

  const jumlahBobot = dihitung.reduce((sum, d) => sum + d.bobot, 0)

  const deteksi = dihitung.map((d) => {
    const proporsi = jumlahBobot > 0 ? d.bobot / jumlahBobot : 0
    const kategori = mapClassToKategori(d.prediksi.class)
    return {
      kelas: d.prediksi.class,
      kategori,
      namaKategori: KATEGORI_LABEL[kategori] || kategori,
      luasPiksel: d.luasPiksel,
      proporsi: Number((proporsi * 100).toFixed(1)),
      beratKg: Number((Number(totalWeightKg) * proporsi).toFixed(3)),
      confidence: d.confidence
    }
  })

  return {
    totalBeratKg: Number(totalWeightKg) || 0,
    skemaBerat: skema,
    // Provenance: bukti mutu data, dipakai untuk memisahkan baris nyata vs simulasi.
    confidenceRataRata: deteksi.length
      ? Number(
          (
            deteksi.reduce((s, d) => s + (Number(d.confidence) || 0), 0) /
            deteksi.length
          ).toFixed(4)
        )
      : null,
    deteksi
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

function normalizePrediction(item) {
  if (!item || typeof item !== 'object') return null
  if (typeof item.class !== 'string' && typeof item.class !== 'number') return null
  return {
    class: String(item.class),
    confidence: Number(item.confidence) || 0,
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    x: Number(item.x) || 0,
    y: Number(item.y) || 0
  }
}

function collectPredictions(node, hasil) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectPredictions(item, hasil)
    return
  }

  if (Array.isArray(node.predictions)) {
    for (const p of node.predictions) {
      const norm = normalizePrediction(p)
      if (norm) hasil.push(norm)
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'predictions') continue
    collectPredictions(node[key], hasil)
  }
}

function extractPredictions(workflowJson) {
  const hasil = []
  collectPredictions(workflowJson, hasil)
  return hasil
}

async function callRoboflowWorkflow(imageBuffer) {
  const base64 = imageBuffer.toString('base64')
  const url = `${ROBOFLOW_WORKFLOW_URL}/workflows/${ROBOFLOW_WORKFLOW_ID}/run`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': ROBOFLOW_API_KEY
    },
    body: JSON.stringify({
      inputs: {
        [ROBOFLOW_WORKFLOW_INPUT]: { type: 'base64', value: base64 }
      }
    })
  })
  if (!response.ok) throw new Error(`Roboflow Workflow merespon status ${response.status}`)

  const json = await response.json()
  return extractPredictions(json)
}

function modelVersi() {
  return ROBOFLOW_WORKFLOW_ID || ROBOFLOW_MODEL || null
}

function mockMode(totalWeightKg, catatan) {
  return {
    mode: 'mock',
    modelVersi: null,
    catatan,
    ...hitungProportion(mockPredictions(totalWeightKg), totalWeightKg)
  }
}

async function detectFoodWaste(imageBuffer, totalWeightKg) {
  // Tanpa API key: kembalikan mode 'mock' secara EKSPLISIT.
  // Pemanggil (iotProcessor) yang memutuskan apakah hasil mock boleh disimpan.
  // Di produksi, backend menolak menyimpan hasil mock (lihat MOCK_ALLOW_PERSIST).
  if (!ROBOFLOW_API_KEY) {
    return mockMode(totalWeightKg, 'ROBOFLOW_API_KEY tidak diatur')
  }

  try {
    if (ROBOFLOW_WORKFLOW_ID) {
      const predictions = await callRoboflowWorkflow(imageBuffer)
      return {
        mode: 'roboflow',
        modelVersi: modelVersi(),
        ...hitungProportion(predictions, totalWeightKg)
      }
    }

    if (ROBOFLOW_MODEL) {
      const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}?api_key=${ROBOFLOW_API_KEY}`
      const formData = new FormData()
      formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'foto.jpg')

      const response = await fetch(url, { method: 'POST', body: formData, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`Roboflow merespon status ${response.status}`)

      const json = await response.json()
      const predictions = Array.isArray(json.predictions) ? json.predictions : []
      return {
        mode: 'roboflow',
        modelVersi: modelVersi(),
        ...hitungProportion(predictions, totalWeightKg)
      }
    }

    return mockMode(totalWeightKg, 'ROBOFLOW_WORKFLOW_ID dan ROBOFLOW_MODEL keduanya kosong')
  } catch (err) {
    // Kegagalan API juga mengembalikan mock. mode='mock' membuat pemanggil
    // dapat MENOLAK menyimpannya, sehingga kegagalan tidak lagi diam-diam
    // menjadi data produksi.
    return mockMode(totalWeightKg, `kegagalan inferensi: ${err.message}`)
  }
}

module.exports = {
  detectFoodWaste,
  mapClassToKategori,
  hitungProportion,
  densitasUntuk,
  KATEGORI_LABEL,
  SKEMA_BERAT,
  CONFIDENCE_THRESHOLD
}