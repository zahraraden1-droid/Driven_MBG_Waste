#!/usr/bin/env node
/**
 * 03-benchmark-latency.mjs
 * ---------------------------------------------------------------------------
 * HARNESS PENGUKURAN LATENCY — MBGCircular SPPG MBG
 *
 * Menghasilkan distribusi latency (mean/median/p95/min/max/n) untuk setiap
 * tahap rantai AIoT, sesuai kebutuhan kolom `n` dan rentang pada Tabel 4 paper.
 *
 * SIFAT: TIDAK menulis ke tabel produksi.
 *   - Tahap 1-4 hanya memanggil endpoint GET (health) dan fungsi deteksi.
 *   - Tahap 5 (end-to-end) memakai backend LOKAL (http://localhost:PORT) sehingga
 *     bila dijalankan, tulisannya masuk ke database yang dikonfigurasi backend itu,
 *     bukan database produksi. Tahap ini DIMATIKAN secara default.
 *
 * Setiap angka diberi label provenance:
 *   [TERUKUR]  = hasil pengukuran nyata pada run ini
 *   [SIMULASI] = berjalan pada mode mock (ROBOFLOW_API_KEY kosong) -> TIDAK boleh
 *                diklaim sebagai kinerja sistem nyata
 *   [GAGAL]    = tahap tidak dapat diukur, alasan dicatat
 *
 * Jalankan:
 *   node tools/benchmark/03-benchmark-latency.mjs
 *   node tools/benchmark/03-benchmark-latency.mjs --n=30 --concurrency=1,5,10
 *   E2E=1 node tools/benchmark/03-benchmark-latency.mjs      # aktifkan tahap 5
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Argumen & konfigurasi
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(__dirname, 'hasil')
fs.mkdirSync(OUT_DIR, { recursive: true })

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : fallback
}

const N = Number(arg('n', 20))
const CONCURRENCY = String(arg('concurrency', '1,5,10'))
  .split(',')
  .map((x) => Number(x.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
const E2E_ENABLED = process.env.E2E === '1'
const LOCAL_BACKEND = process.env.LOCAL_BACKEND || 'http://localhost:4000'

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

const env = loadEnv(path.join(REPO_ROOT, '.env'))
const SUPABASE_URL = (process.env.SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY || env.ROBOFLOW_API_KEY || ''
const ROBOFLOW_WORKFLOW_ID = process.env.ROBOFLOW_WORKFLOW_ID || env.ROBOFLOW_WORKFLOW_ID || ''

// Endpoint publik produksi (untuk mengukur latency jaringan nyata)
const PROD_BACKEND =
  process.env.PROD_BACKEND_URL || 'https://driven-mbg-waste.vercel.app'
const PROD_AI = process.env.PROD_AI_URL || 'https://aimbgcircular-b657.up.railway.app'

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------
function stats(ms) {
  const c = ms.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  if (!c.length) return null
  const q = (p) => {
    const i = (c.length - 1) * p
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return lo === hi ? c[lo] : c[lo] + (c[hi] - c[lo]) * (i - lo)
  }
  return {
    n: c.length,
    min: +c[0].toFixed(2),
    p50: +q(0.5).toFixed(2),
    mean: +(c.reduce((a, b) => a + b, 0) / c.length).toFixed(2),
    p95: +q(0.95).toFixed(2),
    max: +c[c.length - 1].toFixed(2)
  }
}

function tabel(nama, s, label) {
  if (!s) {
    console.log(`  ${nama.padEnd(34)} ${label} n=0 (tidak ada sampel berhasil)`)
    return
  }
  console.log(
    `  ${nama.padEnd(34)} ${label} n=${String(s.n).padStart(3)}  min=${String(s.min).padStart(7)}  p50=${String(s.p50).padStart(7)}  mean=${String(s.mean).padStart(7)}  p95=${String(s.p95).padStart(7)}  max=${String(s.max).padStart(7)} ms`
  )
}

async function waktu(fn) {
  const t0 = performance.now()
  try {
    await fn()
    return { ok: true, ms: performance.now() - t0 }
  } catch (e) {
    return { ok: false, ms: performance.now() - t0, error: String(e.message || e) }
  }
}

const hasil = {
  dijalankan_pada: new Date().toISOString(),
  konfigurasi: {
    N,
    concurrency: CONCURRENCY,
    e2e_aktif: E2E_ENABLED,
    roboflow_key_tersedia: Boolean(ROBOFLOW_API_KEY),
    roboflow_workflow_tersedia: Boolean(ROBOFLOW_WORKFLOW_ID),
    catatan: 'Tidak ada kredensial yang dicatat pada output.'
  },
  mode_roboflow: ROBOFLOW_API_KEY ? 'roboflow' : 'mock',
  tahap: {}
}

console.log('='.repeat(118))
console.log('BENCHMARK LATENCY MBGCircular')
console.log('='.repeat(118))
console.log(`  Mode Roboflow : ${ROBOFLOW_API_KEY ? 'roboflow (API key tersedia) [TERUKUR]' : 'mock (API key KOSONG) [SIMULASI]'}`)
console.log(`  Workflow ID   : ${ROBOFLOW_WORKFLOW_ID ? 'tersedia' : 'kosong (akan pakai model klasik bila ada)'}`)
console.log(`  Ulangan (N)   : ${N}`)
if (!ROBOFLOW_API_KEY) {
  console.log('')
  console.log('  PERINGATAN: ROBOFLOW_API_KEY tidak tersedia.')
  console.log('  Angka tahap inferensi berlabel [SIMULASI] dan TIDAK boleh dipakai')
  console.log('  sebagai klaim kinerja sistem. Jalankan ulang dengan API key asli.')
}
console.log('')

// ---------------------------------------------------------------------------
// TAHAP 1 — Latency endpoint publik (jaringan nyata)
// ---------------------------------------------------------------------------
console.log('--- TAHAP 1: Latency endpoint publik (mengukur jaringan, bukan inferensi) ---')
const t1 = { backend: [], ai: [] }
for (let i = 0; i < N; i++) {
  const a = await waktu(async () => {
    const r = await fetch(PROD_BACKEND, { method: 'GET' })
    if (!r.ok && r.status >= 500) throw new Error(`HTTP ${r.status}`)
  })
  if (a.ok) t1.backend.push(a.ms)

  const b = await waktu(async () => {
    const r = await fetch(`${PROD_AI}/health`, { method: 'GET' })
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
  })
  if (b.ok) t1.ai.push(b.ms)
}
const s1a = stats(t1.backend)
const s1b = stats(t1.ai)
tabel('Frontend produksi (Vercel)', s1a, '[TERUKUR]')
tabel('AI service produksi (Railway)', s1b, '[TERUKUR]')
hasil.tahap['1_endpoint_publik'] = {
  label: '[TERUKUR]',
  frontend_vercel_ms: s1a,
  ai_service_railway_ms: s1b,
  catatan: 'Mengukur kondisi jaringan penguji, BUKAN latency internal sistem.'
}

// ---------------------------------------------------------------------------
// TAHAP 2 — Latency inferensi (fungsi deteksi sebenarnya)
// ---------------------------------------------------------------------------
console.log('\n--- TAHAP 2: Latency inferensi deteksi sisa pangan ---')
const LABEL_INFERENSI = ROBOFLOW_API_KEY ? '[TERUKUR]' : '[SIMULASI]'
const t2 = { ok: [], gagal: 0, modeTerakhir: null, contohHasil: null, error: null }

try {
  const { detectFoodWaste } = await import(
    path.join(REPO_ROOT, 'backend', 'src', 'services', 'roboflowService.js')
  ).then(async (m) => m.default || m)

  // Ambil foto contoh dari repo
  const kandidatFoto = [
    path.join(REPO_ROOT, 'smart container.jpeg'),
    path.join(REPO_ROOT, 'maggot conversion chamber.jpeg')
  ].filter((f) => fs.existsSync(f))

  if (!kandidatFoto.length) {
    t2.error = 'tidak ada foto contoh di repo'
  } else {
    const buffer = fs.readFileSync(kandidatFoto[0])
    console.log(`  Foto uji: ${path.basename(kandidatFoto[0])} (${(buffer.length / 1024).toFixed(0)} KB)`)
    for (let i = 0; i < N; i++) {
      const r = await waktu(async () => {
        const h = await detectFoodWaste(buffer, 1.0) // 1 kg total acuan
        if (i === 0) {
          t2.contohHasil = {
            mode: h.mode,
            jumlah_deteksi: (h.deteksi || []).length,
            kategori: [...new Set((h.deteksi || []).map((d) => d.kategori))]
          }
        }
      })
      if (r.ok) t2.ok.push(r.ms)
      else {
        t2.gagal++
        if (!t2.error) t2.error = r.error
      }
    }
  }
} catch (e) {
  t2.error = String(e.message || e)
}

const s2 = stats(t2.ok)
tabel('Inferensi deteksi (per foto)', s2, LABEL_INFERENSI)
if (t2.gagal) console.log(`  ${' '.repeat(34)} kegagalan: ${t2.gagal}/${N}${t2.error ? ' — ' + t2.error : ''}`)
if (t2.contohHasil) {
  console.log(`  Contoh hasil: mode=${t2.contohHasil.mode}, deteksi=${t2.contohHasil.jumlah_deteksi}, kategori=[${t2.contohHasil.kategori.join(', ')}]`)
}
hasil.tahap['2_inferensi'] = {
  label: LABEL_INFERENSI,
  latency_ms: s2,
  kegagalan: t2.gagal,
  contoh_hasil: t2.contohHasil,
  error: t2.error,
  catatan: ROBOFLOW_API_KEY
    ? 'Inferensi memanggil Roboflow sungguhan.'
    : 'MODE MOCK: mode mock mengembalikan data pseudo-acak secara instan; angka ini mengukur biaya pemrosesan lokal saja dan TIDAK mewakili latency Roboflow.'
}

// ---------------------------------------------------------------------------
// TAHAP 3 — Latency database Supabase (read-only)
// ---------------------------------------------------------------------------
console.log('\n--- TAHAP 3: Latency database Supabase (operasi baca) ---')
const t3 = { ok: [], gagal: 0, error: null }
if (!SUPABASE_URL || !SUPABASE_KEY) {
  t3.error = 'kredensial Supabase tidak tersedia'
} else {
  const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  for (let i = 0; i < N; i++) {
    const r = await waktu(async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waste_records?select=id&limit=1`, { headers: H })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await res.json()
    })
    if (r.ok) t3.ok.push(r.ms)
    else {
      t3.gagal++
      if (!t3.error) t3.error = r.error
    }
  }
}
const s3 = stats(t3.ok)
tabel('Supabase SELECT (round-trip)', s3, '[TERUKUR]')
if (t3.error) console.log(`  error: ${t3.error}`)
hasil.tahap['3_supabase_baca'] = {
  label: '[TERUKUR]',
  latency_ms: s3,
  error: t3.error,
  catatan: 'Hanya operasi baca; tidak ada penulisan ke database.'
}

// ---------------------------------------------------------------------------
// TAHAP 4 — Latency prediksi AI service (FastAPI)
// ---------------------------------------------------------------------------
console.log('\n--- TAHAP 4: Latency AI service /predict/waste (produksi) ---')
const t4 = { ok: [], gagal: 0, error: null }
const payloadPrediksi = {
  riwayat: [{ minggu: 'Minggu 38', totalLimbahKg: 0.2 }],
  batches: [{ batchKode: '001', tanggalMulai: '2026-09-18', status: 'inkubasi' }]
}
for (let i = 0; i < N; i++) {
  const r = await waktu(async () => {
    const res = await fetch(`${PROD_AI}/predict/waste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadPrediksi)
    })
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
    await res.json()
  })
  if (r.ok) t4.ok.push(r.ms)
  else {
    t4.gagal++
    if (!t4.error) t4.error = r.error
  }
}
const s4 = stats(t4.ok)
tabel('AI service /predict/waste', s4, '[TERUKUR]')
if (t4.error) console.log(`  error: ${t4.error}`)
hasil.tahap['4_ai_service_prediksi'] = { label: '[TERUKUR]', latency_ms: s4, error: t4.error }

// ---------------------------------------------------------------------------
// TAHAP 5 — Rantai end-to-end backend lokal (opsional)
// ---------------------------------------------------------------------------
console.log('\n--- TAHAP 5: Rantai end-to-end (backend LOKAL) ---')
if (!E2E_ENABLED) {
  console.log('  DILEWATI. Aktifkan dengan: E2E=1 node tools/benchmark/03-benchmark-latency.mjs')
  console.log('  Tahap ini memanggil endpoint POST yang MENULIS ke database yang')
  console.log('  dikonfigurasi backend lokal. Jalankan hanya dengan database uji, bukan produksi.')
  hasil.tahap['5_end_to_end'] = { label: 'DILEWATI', alasan: 'E2E tidak diaktifkan (default)' }
} else {
  const t5 = { ok: [], gagal: 0, error: null }
  const kandidatFoto = path.join(REPO_ROOT, 'smart container.jpeg')
  if (!fs.existsSync(kandidatFoto)) {
    t5.error = 'foto contoh tidak ditemukan'
  } else {
    const buffer = fs.readFileSync(kandidatFoto)
    // Cek backend lokal hidup
    let hidup = false
    try {
      const r = await fetch(`${LOCAL_BACKEND}/health`)
      hidup = r.ok
    } catch { hidup = false }

    if (!hidup) {
      t5.error = `backend lokal tidak berjalan di ${LOCAL_BACKEND}`
      console.log(`  ${t5.error}`)
      console.log('  Jalankan dulu: (cd backend && node src/index.js) dengan database uji.')
    } else {
      console.log(`  Backend lokal: ${LOCAL_BACKEND}`)
      for (let i = 0; i < N; i++) {
        const r = await waktu(async () => {
          const fd = new FormData()
          fd.append('foto', new Blob([buffer], { type: 'image/jpeg' }), 'uji.jpg')
          fd.append('beratKg', '1.0')
          const res = await fetch(`${LOCAL_BACKEND}/api/iot/smart-container`, {
            method: 'POST',
            headers: { 'x-device-api-key': process.env.DEVICE_API_KEY || env.DEVICE_API_KEY || '' },
            body: fd
          })
          if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
          await res.json()
        })
        if (r.ok) t5.ok.push(r.ms)
        else {
          t5.gagal++
          if (!t5.error) t5.error = r.error
        }
      }
    }
  }
  const s5 = stats(t5.ok)
  tabel('POST /api/iot/smart-container', s5, '[TERUKUR]')
  if (t5.error) console.log(`  error: ${t5.error}`)
  hasil.tahap['5_end_to_end'] = {
    label: t5.ok.length ? '[TERUKUR]' : 'GAGAL',
    latency_ms: s5,
    error: t5.error,
    backend: LOCAL_BACKEND
  }
}

// ---------------------------------------------------------------------------
// TAHAP 6 — Konkurensi (degradasi p95)
// ---------------------------------------------------------------------------
console.log('\n--- TAHAP 6: Degradasi pada beban paralel (inferensi) ---')
const t6 = {}
try {
  const { detectFoodWaste } = await import(
    path.join(REPO_ROOT, 'backend', 'src', 'services', 'roboflowService.js')
  ).then(async (m) => m.default || m)
  const foto = path.join(REPO_ROOT, 'smart container.jpeg')
  if (fs.existsSync(foto)) {
    const buffer = fs.readFileSync(foto)
    for (const c of CONCURRENCY) {
      const ulang = Math.max(1, Math.ceil(N / c))
      const sampel = []
      for (let r = 0; r < ulang; r++) {
        const batch = Array.from({ length: c }, () => waktu(() => detectFoodWaste(buffer, 1.0)))
        const out = await Promise.all(batch)
        for (const o of out) if (o.ok) sampel.push(o.ms)
      }
      t6[`paralel_${c}`] = stats(sampel)
      tabel(`  ${c} permintaan paralel`, t6[`paralel_${c}`], LABEL_INFERENSI)
    }
  }
} catch (e) {
  t6.error = String(e.message || e)
  console.log(`  error: ${t6.error}`)
}
hasil.tahap['6_konkurensi'] = { label: LABEL_INFERENSI, hasil: t6 }

// ---------------------------------------------------------------------------
// Ringkasan & tulis
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(118))
console.log('RINGKASAN PROVENANCE (wajib dicantumkan saat mengutip)')
console.log('='.repeat(118))
console.log('  [TERUKUR]  Tahap 1 (endpoint publik), 3 (Supabase baca), 4 (AI service)')
console.log(`             ${ROBOFLOW_API_KEY ? 'Tahap 2 & 6 (inferensi) juga [TERUKUR]' : 'Tahap 2 & 6 = [SIMULASI] karena ROBOFLOW_API_KEY kosong'}`)
console.log('             Tahap 5 hanya bila E2E=1 dan backend lokal aktif')
console.log('  Tahap 1 mengukur jaringan penguji, bukan latency internal sistem.')

const outFile = path.join(OUT_DIR, `benchmark-latency-${Date.now()}.json`)
fs.writeFileSync(outFile, JSON.stringify(hasil, null, 2), 'utf8')

// CSV ringkas untuk dilampirkan ke paper
const csv = ['tahap,label,n,min_ms,p50_ms,mean_ms,p95_ms,max_ms,catatan']
for (const [nama, t] of Object.entries(hasil.tahap)) {
  const s = t.latency_ms || (t.hasil && t.hasil.paralel_1) || null
  if (s && s.n) {
    csv.push([nama, t.label || '', s.n, s.min, s.p50, s.mean, s.p95, s.max, (t.catatan || '').replace(/,/g, ';')].join(','))
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'benchmark-latency-ringkas.csv'), csv.join('\n') + '\n', 'utf8')

console.log(`\nOutput:`)
console.log(`  ${path.relative(REPO_ROOT, outFile)}`)
console.log(`  ${path.relative(REPO_ROOT, path.join(OUT_DIR, 'benchmark-latency-ringkas.csv'))}`)
