/*
 * Pengaman skema (schema guard).
 *
 * Latar belakang: backend versi baru menulis kolom provenance
 * (sumber/is_simulated/estimasi_mode/kelas/model_versi/confidence_rata_rata/
 * skema_berat) dan tabel waste_record_kelas. Bila migrasi belum dijalankan di
 * database produksi, insert akan GAGAL dengan pesan yang membingungkan.
 *
 * Modul ini memeriksa keberadaan kolom/tabel tersebut saat startup dan:
 *   - memberi pesan yang jelas beserta nama file migrasi yang harus dijalankan;
 *   - menolak start (proses keluar) bila NODE_ENV=production dan SKEMA_ENFORCE=true.
 *
 * Dipilih menolak start di produksi agar kegagalan terjadi di awal (fail-fast),
 * bukan setelah data mulai masuk dan hilang sebagian.
 */

const supabase = require('./supabase')

const KOLOM_WAJIB_WASTE_RECORDS = [
  'sumber',
  'is_simulated',
  'estimasi_mode',
  'kelas',
  'model_versi',
  'confidence_rata_rata',
  'skema_berat'
]

const TABEL_WAJIB = ['waste_record_kelas', 'food_density']

async function bacaKolom(tabel) {
  // select=*&limit=0: tidak mengambil baris, tetapi PostgREST tetap mengembalikan
  // bentuk kolom sehingga kita bisa mendeteksi kolom yang tidak ada via error.
  const { error } = await supabase.from(tabel).select('*').limit(0)
  return error ? null : true
}

async function periksaSkema({ enforce }) {
  if (!supabase) {
    console.warn('[skema] Supabase tidak dikonfigurasi; pemeriksaan skema dilewati.')
    return { ok: false, alasan: 'supabase tidak dikonfigurasi' }
  }

  const masalah = []

  // 1) Cek kolom provenance lewat percobaan select kolom spesifik
  const { error: errKolom } = await supabase
    .from('waste_records')
    .select(KOLOM_WAJIB_WASTE_RECORDS.join(','))
    .limit(0)

  if (errKolom) {
    masalah.push(
      `kolom provenance belum ada di waste_records (${errKolom.message}). ` +
        `Jalankan supabase/migrations/20260920_provenance.sql`
    )
  }

  // 2) Cek tabel baru
  for (const t of TABEL_WAJIB) {
    const ada = await bacaKolom(t)
    if (!ada) {
      masalah.push(
        `tabel ${t} belum ada. Jalankan supabase/migrations/20260920_provenance.sql`
      )
    }
  }

  if (masalah.length === 0) {
    console.log('[skema] OK: kolom provenance dan tabel pendukung tersedia.')
    return { ok: true, masalah: [] }
  }

  console.error('')
  console.error('='.repeat(72))
  console.error('[skema] MASALAH SKEMA TERDETEKSI — migrasi kemungkinan belum dijalankan:')
  for (const m of masalah) console.error('  - ' + m)
  console.error('')
  console.error('  Catatan: tanpa migrasi ini, backend TIDAK dapat menyimpan provenance')
  console.error('  sehingga data simulasi kembali tidak dapat dibedakan dari data nyata.')
  console.error('='.repeat(72))
  console.error('')

  if (enforce) {
    console.error('[skema] SKEMA_ENFORCE=true -> proses dihentikan untuk mencegah kerusakan data.')
    process.exit(1)
  }

  console.warn(
    '[skema] Mode peringatan: proses tetap berjalan, tetapi penyimpanan provenance akan gagal.'
  )
  return { ok: false, masalah }
}

module.exports = { periksaSkema, KOLOM_WAJIB_WASTE_RECORDS, TABEL_WAJIB }
