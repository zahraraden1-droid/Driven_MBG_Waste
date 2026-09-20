#!/usr/bin/env node
/**
 * 02-verifikasi-schema-dan-bukti.mjs
 * ---------------------------------------------------------------------------
 * Verifikasi lanjutan (READ-ONLY) setelah audit pertama menemukan anomali:
 *
 *  1. Kolom `sekolah_id` masih ada di tabel -> indikasi skema produksi masih
 *     versi LAMA, bukan schema.sql terbaru.
 *  2. `sensor_readings` berisi 32 baris dengan SELURUH kolom sensor null
 *     -> indikasi kolom `batch_id` / `suhu_substrat_c` tidak ada, sehingga
 *     insert dari iotProcessor.js gagal sebagian atau payload tidak lengkap.
 *
 * Skrip ini TIDAK menulis ke database. Hanya GET + OPTIONS (untuk membaca
 * definisi kolom dari PostgREST OpenAPI).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(__dirname, 'hasil')

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let value = m[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

const env = loadEnv(path.join(REPO_ROOT, '.env'))
const ORIGIN = (process.env.SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!ORIGIN || !KEY) { console.error('FATAL: kredensial Supabase tidak ditemukan'); process.exit(2) }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const out = { dijalankan_pada: new Date().toISOString(), skema: {}, bukti: {}, kesimpulan: [] }

async function sql(query) {
  // Gunakan RPC? Tidak tersedia. Pakai PostgREST root OpenAPI untuk daftar kolom.
  return null
}

// ---------- 1. Daftar kolom setiap tabel dari OpenAPI PostgREST ----------
console.log('=== 1. SKEMA NYATA DARI POSTGREST OPENAPI ===')
const specRes = await fetch(`${ORIGIN}/rest/v1/`, { headers: { ...H, Accept: 'application/openapi+json' } })
let spec = null
try { spec = await specRes.json() } catch { /* diabaikan */ }

const TABLES = ['users', 'maggot_batches', 'sensor_readings', 'menu_uploads', 'waste_records', 'maggot_harvests', 'sales_records', 'ai_predictions']
const definitions = spec?.definitions || {}

for (const t of TABLES) {
  const def = definitions[t]
  if (!def) {
    console.log(`  ${t.padEnd(18)} tidak ada di OpenAPI`)
    continue
  }
  const cols = Object.keys(def.properties || {})
  out.skema[t] = cols
  console.log(`  ${t.padEnd(18)} ${cols.join(', ')}`)
}

// Cek kolom yang seharusnya sudah dihapus/ditambah oleh migration_prod.sql
console.log('\n=== 2. CEK KOLOM KRITIS (migration_prod.sql vs kenyataan) ===')
const cek = [
  ['waste_records', 'sekolah_id', 'HARUSNYA SUDAH DIHAPUS (skema single-school, tidak multi-tenant)'],
  ['sensor_readings', 'suhu_substrat_c', 'ditambahkan migration_prod.sql:29'],
  ['sensor_readings', 'batch_id', 'ditambahkan migration_prod.sql:30'],
  ['sensor_readings', 'sekolah_id', 'sisa skema lama'],
  ['maggot_batches', 'sekolah_id', 'sisa skema lama'],
  ['users', 'sekolah_id', 'sisa skema lama']
]
for (const [t, c, ket] of cek) {
  const ada = (out.skema[t] || []).includes(c)
  console.log(`  ${t}.${c}: ${ada ? 'ADA' : 'TIDAK ADA'}  <- ${ket}`)
  out.bukti[`${t}.${c}`] = ada
}

// ---------- 3. Isi nyata waste_records ----------
console.log('\n=== 3. ISI NYATA waste_records (60 baris) ===')
const wrRes = await fetch(`${ORIGIN}/rest/v1/waste_records?select=*&order=created_at.asc`, { headers: H })
const wr = await wrRes.json()

const kolomWr = Object.keys(wr[0] || {})
const nilaiSekolahId = [...new Set(wr.map((r) => JSON.stringify(r.sekolah_id)))]
console.log(`  Nilai sekolah_id unik: ${nilaiSekolahId.join(', ')}`)
out.bukti.nilai_sekolah_id_waste_records = nilaiSekolahId

const byCreated = new Map()
for (const r of wr) {
  const k = String(r.created_at).slice(0, 19)
  byCreated.set(k, (byCreated.get(k) || 0) + 1)
}
console.log(`  Jumlah timestamp created_at unik: ${byCreated.size}`)
console.log(`  Baris per timestamp: ${JSON.stringify(Object.fromEntries([...byCreated.entries()].sort()))}`)
out.bukti.distribusi_timestamp_waste_records = Object.fromEntries(byCreated)

// Tampilkan 12 baris untuk penilaian manual pola mock
console.log('\n  12 baris pertama (created_at | kategori | berat_kg | minggu):')
for (const r of wr.slice(0, 12)) {
  console.log(`    ${String(r.created_at).slice(0, 23).padEnd(24)} ${String(r.kategori).padEnd(8)} ${String(r.berat_kg).padStart(9)} ${r.minggu}`)
}

// Sebaran berat_kg: mock menghasilkan nilai berulang karena di-seed dari total
const beratCount = new Map()
for (const r of wr) {
  const k = String(r.berat_kg)
  beratCount.set(k, (beratCount.get(k) || 0) + 1)
}
const beratUnik = [...beratCount.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
console.log(`\n  Nilai berat_kg unik: ${beratUnik.length}`)
console.log('  ' + beratUnik.map(([v, c]) => `${v}x${c}`).join('  '))
out.bukti.berat_kg_unik = beratUnik

const totalBerat = wr.reduce((s, r) => s + Number(r.berat_kg), 0)
console.log(`\n  TOTAL berat_kg = ${totalBerat.toFixed(3)} kg  <-- ini yang masuk KPI publik`)
out.bukti.total_berat_kg = totalBerat

// Pola: apakah tiap grup timestamp memuat tepat 6 kategori dengan susunan sama?
console.log('\n=== 4. UJI POLA 6-KELAS MOCK PER GRUP INSERT ===')
const grupPola = []
for (const [ts, n] of [...byCreated.entries()].sort()) {
  const rows = wr.filter((r) => String(r.created_at).slice(0, 19) === ts)
  const cats = rows.map((r) => r.kategori).sort()
  const sig = cats.join('|')
  grupPola.push({ ts, n, sig })
}
const sigCount = new Map()
for (const g of grupPola) sigCount.set(g.sig, (sigCount.get(g.sig) || 0) + 1)
console.log('  Distribusi signature kategori per grup:')
for (const [sig, c] of [...sigCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(c).padStart(3)}x  ${sig}`)
}
out.bukti.signature_grup = Object.fromEntries(sigCount)

// ---------- 5. sensor_readings null ----------
console.log('\n=== 5. SENSOR_READINGS: SEMUA KOLOM SENSOR NULL ===')
const srRes = await fetch(`${ORIGIN}/rest/v1/sensor_readings?select=*&order=created_at.asc`, { headers: H })
const sr = await srRes.json()
console.log(`  Baris: ${sr.length}`)
console.log('  Contoh 3 baris:')
for (const r of sr.slice(0, 3)) console.log('    ' + JSON.stringify(r))

const adaSubstrat = (out.skema.sensor_readings || []).includes('suhu_substrat_c')
const adaBatch = (out.skema.sensor_readings || []).includes('batch_id')
console.log(`\n  suhu_substrat_c ada? ${adaSubstrat}`)
console.log(`  batch_id ada?        ${adaBatch}`)
if (!adaBatch || !adaSubstrat) {
  out.kesimpulan.push(
    'migration_prod.sql BELUM dijalankan di database produksi: kolom suhu_substrat_c/batch_id tidak ada. ' +
    'Insert dari processChamber() menyertakan batch_id -> insert akan gagal ATAU kolom diabaikan, ' +
    'sehingga telemetri sensor tidak pernah tersimpan utuh.'
  )
}

// Verifikasi: apakah insert dengan kolom tak-ada gagal? Cek nilai yang benar-benar tersimpan.
const terisi = ['suhu_bilik_c', 'kelembaban_persen', 'kadar_amonia_ppm', 'estimasi_berat_maggot_kg']
  .map((c) => ({ kolom: c, nonNull: sr.filter((r) => r[c] !== null).length }))
console.log('\n  Kolom dan jumlah nilai NON-NULL:')
for (const t of terisi) console.log(`    ${t.kolom.padEnd(28)} ${t.nonNull}/${sr.length}`)
out.bukti.sensor_nonnull = terisi

if (terisi.every((t) => t.nonNull === 0)) {
  out.kesimpulan.push(
    'Seluruh 32 baris sensor_readings tidak memuat satu pun nilai sensor. ' +
    'Artinya jalur telemetri maggot chamber (MQTT mbg/maggot-chamber -> processChamber -> DB) ' +
    'TIDAK tersimpan, sehingga klaim monitoring real-time pada paper tidak punya data pendukung di database.'
  )
}

// ---------- 6. Cek batch & referensi ----------
console.log('\n=== 6. MAGGOT_BATCHES ===')
const mbRes = await fetch(`${ORIGIN}/rest/v1/maggot_batches?select=*`, { headers: H })
const mb = await mbRes.json()
for (const r of mb) console.log('  ' + JSON.stringify(r))
out.bukti.maggot_batches = mb

// ---------- 7. users: apakah masih menyimpan hash password default ----------
console.log('\n=== 7. USERS (hanya metadata, TIDAK menampilkan hash) ===')
const usRes = await fetch(`${ORIGIN}/rest/v1/users?select=id,nama,email,role,created_at`, { headers: H })
const us = await usRes.json()
for (const r of us) console.log(`  ${r.role.padEnd(14)} ${r.email.padEnd(28)} ${r.nama}`)
out.bukti.users = us

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'verifikasi-schema.json'), JSON.stringify(out, null, 2), 'utf8')
console.log(`\n=== KESIMPULAN ===`)
for (const k of out.kesimpulan) console.log(`  * ${k}`)
console.log(`\nOutput: tools/audit/hasil/verifikasi-schema.json`)
