/*
 * Penyimpanan state sistem (mode pemeliharaan & mode demo).
 *
 * MASALAH YANG DIPERBAIKI
 * Sebelumnya state hanya berupa variabel di memori proses:
 *   let maintenanceActive = false
 * Akibatnya:
 *   1. Hilang setiap deploy/restart — mode pemeliharaan yang sedang aktif
 *      mendadak mati, sehingga perangkat kembali mengirim data.
 *   2. RUSAK bila layanan berjalan lebih dari satu replika. Replika A dapat
 *      menyalakan mode pemeliharaan, sementara replika B tetap melaporkan mati.
 *      Inilah sebabnya sistem ini sebelumnya tidak dapat di-scale.
 *
 * PENDEKATAN
 * Sumber kebenaran adalah tabel `system_state` di database. Namun karena
 * `isDemoActive()` dipanggil secara SINKRON di banyak tempat (route dan
 * service), fungsi baca tetap sinkron dengan memakai salinan di memori yang
 * DIHIDRASI dari database saat startup, dan diperbarui setiap kali ada
 * penulisan.
 *
 * Konsekuensi yang perlu diketahui: pada mode multi-replika, replika lain
 * baru melihat perubahan setelah menyegarkan (muatState dipanggil berkala oleh
 * indeks). Ini cukup untuk mencegah state "rusak", tetapi belum seketika.
 * Penyegaran berkala diatur pada src/index.js.
 */

const supabase = require('./supabase')
const { log } = require('./observability')

const KUNCI_MAINTENANCE = 'maintenance_mode'
const KUNCI_DEMO = 'demo_mode'

// Salinan di memori. Nilai awal mengikuti env agar perilaku saat database belum
// siap tetap sama seperti sebelumnya.
let maintenanceActive = false
let demoActive = process.env.DEMO_MODE === 'true'

let terakhirMuat = 0
let pernahGagalMuat = false

function isMaintenanceActive() {
  return maintenanceActive
}

function isDemoActive() {
  return demoActive
}

function statusState() {
  return {
    maintenanceActive,
    demoActive,
    sumber: pernahGagalMuat ? 'memori (database tidak tersedia)' : 'database',
    terakhirMuat: terakhirMuat ? new Date(terakhirMuat).toISOString() : null
  }
}

/**
 * Membaca state dari database ke memori.
 * Aman dipanggil berkali-kali. Kegagalan TIDAK melempar error: sistem tetap
 * berjalan memakai nilai memori terakhir, agar gangguan database tidak
 * membuat seluruh layanan mati.
 */
async function muatState({ sunyi = false } = {}) {
  if (!supabase) {
    pernahGagalMuat = true
    if (!sunyi) log.warn('state: Supabase tidak dikonfigurasi, memakai nilai memori')
    return statusState()
  }

  try {
    const { data, error } = await supabase
      .from('system_state')
      .select('kunci, nilai')
      .in('kunci', [KUNCI_MAINTENANCE, KUNCI_DEMO])

    if (error) throw new Error(error.message)

    for (const baris of data || []) {
      const aktif = Boolean(baris.nilai && baris.nilai.aktif)
      if (baris.kunci === KUNCI_MAINTENANCE) maintenanceActive = aktif
      if (baris.kunci === KUNCI_DEMO) demoActive = aktif
    }

    terakhirMuat = Date.now()
    if (pernahGagalMuat) {
      log.info('state: koneksi database pulih, state dimuat ulang')
    }
    pernahGagalMuat = false
    return statusState()
  } catch (err) {
    pernahGagalMuat = true
    if (!sunyi) {
      log.warn('state: gagal memuat dari database, memakai nilai memori', {
        error: err.message
      })
    }
    return statusState()
  }
}

/**
 * Menulis nilai ke database, lalu memperbarui memori.
 * Bila penulisan database gagal, memori TIDAK diubah, dan pemanggil menerima
 * error — lebih baik melaporkan gagal daripada memberi kesan berhasil padahal
 * perubahan tidak bertahan.
 */
async function tulisState(kunci, nilai, oleh = null) {
  if (supabase) {
    const { error } = await supabase
      .from('system_state')
      .upsert(
        {
          kunci,
          nilai: { aktif: Boolean(nilai) },
          diperbarui_pada: new Date().toISOString(),
          diperbarui_oleh: oleh
        },
        { onConflict: 'kunci' }
      )

    if (error) {
      log.error('state: gagal menyimpan ke database', { kunci, error: error.message })
      const err = new Error(
        'Gagal menyimpan state ke database, perubahan dibatalkan agar tidak menyesatkan.'
      )
      err.sebab = error.message
      throw err
    }
  } else {
    log.warn('state: Supabase tidak dikonfigurasi, perubahan hanya berlaku di memori', {
      kunci
    })
  }

  return Boolean(nilai)
}

async function setMaintenanceActive(value, oleh = null) {
  const hasil = await tulisState(KUNCI_MAINTENANCE, value, oleh)
  maintenanceActive = hasil
  terakhirMuat = Date.now()
  return hasil
}

async function setDemoActive(value, oleh = null) {
  const hasil = await tulisState(KUNCI_DEMO, value, oleh)
  demoActive = hasil
  terakhirMuat = Date.now()
  return hasil
}

module.exports = {
  isMaintenanceActive,
  isDemoActive,
  setMaintenanceActive,
  setDemoActive,
  muatState,
  statusState,
  KUNCI_MAINTENANCE,
  KUNCI_DEMO
}
