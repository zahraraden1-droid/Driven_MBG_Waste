#!/usr/bin/env node
/**
 * 01-audit-integritas-data.mjs
 * ---------------------------------------------------------------------------
 * AUDIT INTEGRITAS DATA PRODUKSI — MBGCircular SPPG MBG
 *
 * Tujuan: memeriksa apakah waste_records / sensor_readings di Supabase
 * produksi sudah tercemar data SIMULASI (mode mock) yang seharusnya tidak
 * pernah masuk ke database nyata.
 *
 * Latar belakang temuan kode:
 *   - backend/src/services/iotProcessor.js:29  -> menyimpan hasil deteksi
 *     tanpa memeriksa `hasil.mode === 'mock'`.
 *   - backend/src/services/roboflowService.js:136-137, 162-163 -> mengembalikan
 *     prediksi pseudo-acak bila ROBOFLOW_API_KEY kosong ATAU panggilan gagal.
 *   - supabase/schema.sql:78-87 -> get_public_kpi() menjumlahkan seluruh tabel
 *     tanpa filter apa pun, sehingga data mock ikut ke KPI publik.
 *
 * SIFAT SKRIP INI: READ-ONLY.
 *   Hanya memakai HTTP GET ke PostgREST (select=...). Tidak ada POST/PATCH/DELETE.
 *   Tidak menulis kredensial ke file. Membaca kredensial dari .env repo (gitignored).
 *
 * Jalankan:  node tools/audit/01-audit-integritas-data.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(__dirname, 'hasil')

// ---------------------------------------------------------------------------
// 1. Konfigurasi: baca .env repo (jangan pernah menuliskan nilainya ke output)
// ---------------------------------------------------------------------------

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

const env = loadEnv(path.join(REPO_ROOT, '.env'))
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di environment maupun .env'
  )
  process.exit(2)
}

const origin = SUPABASE_URL.replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// 2. Helper: HTTP GET read-only ke PostgREST
// ---------------------------------------------------------------------------

async function rest(table) {
  const url = `${origin}/rest/v1/${table}?select=*`
  const res = await fetch(url, {
    method: 'GET', // read-only, tidak pernah menulis
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json'
    }
  })
  const text = await res.text()

  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 300), rows: null }
  }

  try {
    const rows = JSON.parse(text)
    return { ok: true, status: res.status, rows, truncated: false }
  } catch (e) {
    return { ok: false, status: res.status, error: 'gagal parse JSON', rows: null }
  }
}

// ---------------------------------------------------------------------------
// 3. Helper: statistik
// ---------------------------------------------------------------------------

function stats(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!clean.length) return null
  const sum = clean.reduce((a, b) => a + b, 0)
  const q = (p) => {
    const idx = (clean.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return lo === hi ? clean[lo] : clean[lo] + (clean[hi] - clean[lo]) * (idx - lo)
  }
  return {
    n: clean.length,
    min: clean[0],
    p50: q(0.5),
    mean: sum / clean.length,
    p95: q(0.95),
    max: clean[clean.length - 1]
  }
}

function fmt(x, d = 3) {
  return x === null || x === undefined ? '—' : Number(x).toFixed(d)
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10)
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function writeCsv(file, headers, rows) {
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','))
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// 4. Analisis
// ---------------------------------------------------------------------------

const report = {
  dijalankan_pada: new Date().toISOString(),
  target: origin.replace(/\/\/[^.]+\./, '//<project>.'),
  catatan: 'Tidak ada kredensial yang dicatat pada output ini.',
  tabel: {},
  temuan: [],
  rekomendasi: []
}

fs.mkdirSync(OUT_DIR, { recursive: true })

function catat(severity, judul, bukti, berarti) {
  report.temuan.push({ severity, judul, bukti, berarti })
}

// ---------- 4.1 Inventaris tabel ----------
const TABLES = [
  'users',
  'maggot_batches',
  'sensor_readings',
  'menu_uploads',
  'waste_records',
  'maggot_harvests',
  'sales_records',
  'ai_predictions'
]

const data = {}
console.log('=== 1. INVENTARIS TABEL ===')
for (const t of TABLES) {
  const r = await rest(t)
  if (!r.ok) {
    console.log(`  ${t.padEnd(18)} GAGAL (HTTP ${r.status}) ${r.error || ''}`)
    report.tabel[t] = { ok: false, status: r.status, error: r.error }
    // Simpan bukti kegagalan tanpa membocorkan key
    if (/relation|does not exist|42P01/i.test(r.error || '')) {
      report.tabel[t].catatan = 'tabel tidak ada / belum dibuat'
    }
    continue
  }
  data[t] = r.rows
  const n = r.rows.length
  const tanggalField = r.rows[0] && 'created_at' in r.rows[0] ? 'created_at' : null
  const tgl = tanggalField ? r.rows.map((x) => x[tanggalField]).filter(Boolean).sort() : []
  report.tabel[t] = {
    ok: true,
    jumlah_baris: n,
    kolom: r.rows[0] ? Object.keys(r.rows[0]) : [],
    rentang_created_at:
      tgl.length > 0 ? { pertama: tgl[0], terakhir: tgl[tgl.length - 1] } : null
  }
  console.log(`  ${t.padEnd(18)} ${String(n).padStart(6)} baris`)
}

// ---------- 4.2 Analisis waste_records (inti audit) ----------
console.log('\n=== 2. ANALISIS waste_records ===')
const wr = data.waste_records || []
console.log(`  Total baris: ${wr.length}`)

const wrCsv = []
if (wr.length) {
  const kolom = Object.keys(wr[0])
  console.log(`  Kolom: ${kolom.join(', ')}`)

  // Kelompokkan per tanggal
  const perTanggal = new Map()
  for (const r of wr) {
    const d = dayKey(r.tanggal || r.created_at)
    if (!perTanggal.has(d)) perTanggal.set(d, [])
    perTanggal.get(d).push(r)
  }

  const kategoriPerTanggal = new Map()
  const beratPerTanggal = new Map()
  for (const [d, rows] of perTanggal) {
    const cats = new Set(rows.map((r) => String(r.kategori || '').toLowerCase()))
    kategoriPerTanggal.set(d, cats)
    beratPerTanggal.set(
      d,
      rows.reduce((s, r) => s + (Number(r.berat_kg) || 0), 0)
    )
  }

  const semuaKategori = new Map()
  for (const r of wr) {
    const k = String(r.kategori || '(kosong)')
    semuaKategori.set(k, (semuaKategori.get(k) || 0) + 1)
  }
  console.log('  Distribusi kategori:')
  for (const [k, v] of [...semuaKategori.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(12)} ${String(v).padStart(6)} baris`)
  }

  // --- FINGERPRINT SIMULASI ---
  // mockPredictions() di roboflowService.js:62-72 selalu menghasilkan 6 kelas
  // dengan pola kelas tetap: nasi, sayur_*, sayur_*, lauk_*, lauk_*, buah_pisang.
  // Setelah mapClassToKategori() -> kategori: nasi, sayur, sayur, lauk, lauk, buah.
  // Jadi setiap tanggal hasil mock cenderung memuat kombinasi kategori yang sama.
  const KOMBINASI_MOCK = 'buah|lauk|nasi|sayur'
  const tanggalFingerprint = []
  for (const [d, cats] of kategoriPerTanggal) {
    const sig = [...cats].sort().join('|')
    if (sig === KOMBINASI_MOCK) tanggalFingerprint.push(d)
  }

  // Jumlah baris per tanggal: mock selalu 6 baris.
  const enamBaris = [...perTanggal.entries()]
    .filter(([, rows]) => rows.length === 6)
    .map(([d]) => d)

  // Deteksi nilai berat_kg yang identik berulang (mock ter-seed -> total tetap,
  // tapi proporsi tetap berbeda antar total; cari duplikasi baris identik).
  const signatureCounter = new Map()
  for (const r of wr) {
    const key = `${dayKey(r.tanggal || r.created_at)}|${r.kategori}|${r.berat_kg}|${r.minggu}`
    signatureCounter.set(key, (signatureCounter.get(key) || 0) + 1)
  }
  const duplikat = [...signatureCounter.entries()].filter(([, c]) => c > 1)

  // Deteksi jumlah baris kelipatan 6 (pola kuat generator mock)
  const hitungPerJumlah = new Map()
  for (const [, rows] of perTanggal) {
    const c = rows.length
    hitungPerJumlah.set(c, (hitungPerJumlah.get(c) || 0) + 1)
  }

  // Label minggu tanpa tahun (temuan kode iotProcessor.js:5-14)
  const labelMinggu = new Set(wr.map((r) => String(r.minggu || '(kosong)')))
  const mingguTanpaTahun = [...labelMinggu].filter((m) => !/\d{4}/.test(m))

  report.analisis_waste_records = {
    total_baris: wr.length,
    jumlah_tanggal_unik: perTanggal.size,
    rentang_tanggal:
      perTanggal.size > 0
        ? {
            pertama: [...perTanggal.keys()].sort()[0],
            terakhir: [...perTanggal.keys()].sort().slice(-1)[0]
          }
        : null,
    distribusi_kategori: Object.fromEntries(semuaKategori),
    statistik_berat_kg: stats(wr.map((r) => Number(r.berat_kg))),
    tanggal_dengan_kombinasi_kategori_khas_mock: tanggalFingerprint,
    tanggal_dengan_tepat_6_baris: enamBaris,
    distribusi_baris_per_tanggal: Object.fromEntries(
      [...hitungPerJumlah.entries()].sort((a, b) => a[0] - b[0])
    ),
    jumlah_signature_duplikat: duplikat.length,
    label_minggu_tanpa_tahun: mingguTanpaTahun
  }

  console.log('\n  --- INDIKATOR SIMULASI ---')
  console.log(`  Tanggal dgn kombinasi kategori khas mock : ${tanggalFingerprint.length} / ${perTanggal.size}`)
  console.log(`  Tanggal dgn tepat 6 baris                : ${enamBaris.length} / ${perTanggal.size}`)
  console.log(`  Baris per tanggal (distribusi)           : ${JSON.stringify(Object.fromEntries([...hitungPerJumlah.entries()].sort((a,b)=>a[0]-b[0])))}`)
  console.log(`  Signature baris duplikat                 : ${duplikat.length}`)
  console.log(`  Label minggu tanpa tahun                 : ${mingguTanpaTahun.length ? mingguTanpaTahun.join(', ') : 'tidak ada'}`)

  for (const r of wr) {
    wrCsv.push({
      id: r.id,
      tanggal: dayKey(r.tanggal || r.created_at),
      minggu: r.minggu,
      kategori: r.kategori,
      berat_kg: r.berat_kg,
      created_at: r.created_at,
      baris_per_tanggal: perTanggal.get(dayKey(r.tanggal || r.created_at)).length,
      kategori_tanggal: [...kategoriPerTanggal.get(dayKey(r.tanggal || r.created_at))]
        .sort()
        .join('|')
    })
  }

  if (tanggalFingerprint.length > 0 || enamBaris.length > 0) {
    catat(
      'TINGGI',
      'Indikasi kuat data simulasi (mock) tersimpan di waste_records',
      `${tanggalFingerprint.length} tanggal dgn kombinasi kategori identik pola mock; ${enamBaris.length} tanggal dgn tepat 6 baris (mockPredictions selalu 6 kelas)`,
      'Angka pada Tabel 4 paper (total limbah, ranking makanan, tren) berisiko tidak valid bila rentang ini dipakai.'
    )
  } else if (wr.length > 0) {
    catat(
      'INFO',
      'Tidak ditemukan pola kuat data simulasi pada waste_records',
      `Total ${wr.length} baris, ${perTanggal.size} tanggal; tidak ada tanggal dgn pola 6-kelas mock`,
      'Data berpotensi bersih dari jejak mock; tetap perlu verifikasi dari sisi log backend.'
    )
  }
}

// ---------- 4.3 sensor_readings: n + interval telemetri nyata ----------
console.log('\n=== 3. ANALISIS sensor_readings ===')
const sr = data.sensor_readings || []
console.log(`  Total baris: ${sr.length}`)

let srReport = null
if (sr.length) {
  const created = sr
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  const selisih = []
  for (let i = 1; i < created.length; i++) {
    const d = (created[i] - created[i - 1]) / 1000
    if (d >= 0) selisih.push(d)
  }

  // Buang outlier > 1 jam agar jitter antar sesi tidak mendominasi
  const selisihWajar = selisih.filter((d) => d < 3600)

  const kolom = Object.keys(sr[0])
  const nilaiHilang = {}
  for (const c of kolom) {
    nilaiHilang[c] = sr.filter((r) => r[c] === null || r[c] === undefined).length
  }

  srReport = {
    total_baris: sr.length,
    kolom,
    jumlah_nilai_null_per_kolom: nilaiHilang,
    rentang: {
      pertama: sr.map((r) => r.created_at).sort()[0],
      terakhir: sr.map((r) => r.created_at).sort().slice(-1)[0]
    },
    interval_detik: stats(selisihWajar),
    jumlah_interval_dibuang_outlier: selisih.length - selisihWajar.length,
    statistik_tiap_sensor: {
      suhu_bilik_c: stats(sr.map((r) => Number(r.suhu_bilik_c))),
      kelembaban_persen: stats(sr.map((r) => Number(r.kelembaban_persen))),
      kadar_amonia_ppm: stats(sr.map((r) => Number(r.kadar_amonia_ppm))),
      suhu_substrat_c: stats(sr.map((r) => Number(r.suhu_substrat_c))),
      estimasi_berat_maggot_kg: stats(sr.map((r) => Number(r.estimasi_berat_maggot_kg)))
    }
  }

  console.log(`  Rentang: ${srReport.rentang.pertama} s/d ${srReport.rentang.terakhir}`)
  if (srReport.interval_detik) {
    const i = srReport.interval_detik
    console.log(
      `  Interval antar-pembacaan (detik): n=${i.n} min=${fmt(i.min,1)} p50=${fmt(i.p50,1)} mean=${fmt(i.mean,1)} p95=${fmt(i.p95,1)} max=${fmt(i.max,1)}`
    )
    console.log(`  (outlier > 1 jam dibuang: ${srReport.jumlah_interval_dibuang_outlier})`)
  }
  console.log('  Nilai null per kolom:')
  for (const [c, v] of Object.entries(nilaiHilang)) {
    if (v > 0) console.log(`    ${c.padEnd(26)} ${v} null (${((v / sr.length) * 100).toFixed(1)}%)`)
  }

  const negatif = ['suhu_bilik_c', 'kelembaban_persen', 'kadar_amonia_ppm', 'suhu_substrat_c']
    .flatMap((c) => sr.filter((r) => Number(r[c]) < 0).map((r) => `${c}=${r[c]} @ ${r.created_at}`))

  if (negatif.length) {
    catat(
      'SEDANG',
      'Nilai sensor negatif tersimpan (tidak ada constraint rentang di skema)',
      `${negatif.length} nilai negatif, contoh: ${negatif.slice(0, 3).join('; ')}`,
      'Indikasi validasi hilang di jalur IoT->DB; merusak statistik dan rekomendasi operasional.'
    )
  }

  if (srReport.interval_detik && Math.abs(srReport.interval_detik.p50 - 30) > 15) {
    catat(
      'SEDANG',
      'Interval telemetri nyata menyimpang dari setelan firmware 30 detik',
      `p50 = ${fmt(srReport.interval_detik.p50, 1)} detik (n=${srReport.interval_detik.n})`,
      'Perlu dinyatakan apa adanya di paper, atau perbaiki penjadwalan firmware.'
    )
  }
}
report.analisis_sensor_readings = srReport

// ---------- 4.4 Riwayat harian (untuk n transaksi Tabel 4) ----------
console.log('\n=== 4. COVERAGE UNTUK KLAIM TABEL 4 ===')
const hariUnikWaste = new Set((data.waste_records || []).map((r) => dayKey(r.tanggal || r.created_at)))
const hariUnikSensor = new Set((data.sensor_readings || []).map((r) => dayKey(r.created_at)))
const hariWasteAdaSensor = [...hariUnikWaste].filter((d) => hariUnikSensor.has(d))

console.log(`  Hari dgn data limbah         : ${hariUnikWaste.size}`)
console.log(`  Hari dgn data sensor         : ${hariUnikSensor.size}`)
console.log(`  Hari punya keduanya          : ${hariWasteAdaSensor.length}`)

report.coverage_tabel4 = {
  n_baris_waste_records: (data.waste_records || []).length,
  n_hari_data_limbah: hariUnikWaste.size,
  n_baris_sensor_readings: (data.sensor_readings || []).length,
  n_hari_data_sensor: hariUnikSensor.size,
  n_hari_irisan: hariWasteAdaSensor.length,
  n_batch_maggot: (data.maggot_batches || []).length,
  n_maggot_harvests: (data.maggot_harvests || []).length,
  n_menu_uploads: (data.menu_uploads || []).length,
  n_sales_records: (data.sales_records || []).length
}

if (hariUnikWaste.size > 0 && hariWasteAdaSensor.length === 0) {
  catat(
    'TINGGI',
    'Data limbah dan data sensor tidak pernah berada pada hari yang sama',
    `Hari limbah=${hariUnikWaste.size}, hari sensor=${hariUnikSensor.size}, irisan=0`,
    'Dua jalur data (smart container vs maggot chamber) belum pernah berjalan bersamaan — perlu dinyatakan sebagai keterbatasan atau diperbaiki.'
  )
}

// ---------- 4.5 Tulis evidence ----------
if (wrCsv.length) {
  writeCsv(
    path.join(OUT_DIR, 'waste_records-detail.csv'),
    ['id', 'tanggal', 'minggu', 'kategori', 'berat_kg', 'created_at', 'baris_per_tanggal', 'kategori_tanggal'],
    wrCsv
  )
}

const ringkasTanggal = []
for (const [d, rows] of new Map(
  (data.waste_records || []).map((r) => [dayKey(r.tanggal || r.created_at), []])
)) {
  void d
  void rows
}
for (const r of data.waste_records || []) {
  const d = dayKey(r.tanggal || r.created_at)
  let hit = ringkasTanggal.find((x) => x.tanggal === d)
  if (!hit) {
    hit = { tanggal: d, jumlah_baris: 0, kategori: new Set(), total_berat_kg: 0, minggu: r.minggu }
    ringkasTanggal.push(hit)
  }
  hit.jumlah_baris += 1
  hit.kategori.add(String(r.kategori || ''))
  hit.total_berat_kg += Number(r.berat_kg) || 0
}
if (ringkasTanggal.length) {
  writeCsv(
    path.join(OUT_DIR, 'waste_records-per-tanggal.csv'),
    ['tanggal', 'minggu', 'jumlah_baris', 'kategori', 'total_berat_kg'],
    ringkasTanggal
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
      .map((x) => ({
        tanggal: x.tanggal,
        minggu: x.minggu,
        jumlah_baris: x.jumlah_baris,
        kategori: [...x.kategori].sort().join('|'),
        total_berat_kg: x.total_berat_kg.toFixed(3)
      }))
  )
}

// ---------- 4.6 Rekomendasi & tulis laporan ----------
if (report.temuan.some((t) => t.severity === 'TINGGI')) {
  report.rekomendasi.push(
    'Tandai kolom provenance (sumber/is_simulated) sebelum data ini dipakai untuk klaim paper.',
    'Jangan kutip rentang tanggal yang terindikasi mock pada Tabel 4.',
    'Terapkan isolasi mode mock (backend) + filter is_simulated pada get_public_kpi().',
    'Perbaiki label minggu agar menyertakan tahun sebelum agregasi tren.'
  )
} else {
  report.rekomendasi.push(
    'Lanjutkan ke instrumentasi latency; pastikan isolation mock tetap diterapkan untuk mencegah pencemaran ke depan.'
  )
}

fs.writeFileSync(
  path.join(OUT_DIR, 'audit-integritas-data.json'),
  JSON.stringify(report, null, 2),
  'utf8'
)

console.log('\n=== 5. TEMUAN ===')
if (!report.temuan.length) {
  console.log('  (tidak ada temuan)')
} else {
  for (const t of report.temuan) {
    console.log(`  [${t.severity}] ${t.judul}`)
    console.log(`      bukti   : ${t.bukti}`)
    console.log(`      berarti : ${t.berarti}`)
  }
}

console.log('\n=== OUTPUT ===')
console.log(`  ${path.relative(REPO_ROOT, path.join(OUT_DIR, 'audit-integritas-data.json'))}`)
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith('.csv')) console.log(`  ${path.relative(REPO_ROOT, path.join(OUT_DIR, f))}`)
}
