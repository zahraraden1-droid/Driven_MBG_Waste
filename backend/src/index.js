// WAJIB paling awal: memuat variabel lingkungan dari backend/.env DAN ../.env
// (akar repo). Sebelumnya hanya backend/.env yang dibaca, sehingga menjalankan
// `cd backend && npm run dev` TIDAK membaca konfigurasi di akar repositori —
// backend berjalan tanpa kredensial Supabase secara diam-diam.
const envInfo = require('./config/env')

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const authRoutes = require('./routes/auth')
const publicRoutes = require('./routes/public')
const adminSekolahRoutes = require('./routes/adminSekolah')
const dapurMbgRoutes = require('./routes/dapurMbg')
const reportsRoutes = require('./routes/reports')
const demoRoutes = require('./routes/demo')
const iotRoutes = require('./routes/iot')
const devicesRoutes = require('./routes/devices')
const maggotBatchesRoutes = require('./routes/maggotBatches')
const kinerjaRoutes = require('./routes/kinerja')
const auditRoutes = require('./routes/audit')
const { startMqtt, getClient } = require('./config/mqtt')
const { periksaSkema } = require('./config/skemaGuard')
const { log, middlewareObservability } = require('./config/observability')
const { periksaKesiapan } = require('./config/health')
const { muatState } = require('./config/stateStore')

const app = express()

// Request-id + log terstruktur + pengukuran durasi. Dipasang paling awal agar
// setiap permintaan (termasuk yang ditolak CORS) tetap tercatat.
app.use(middlewareObservability)

// Trust proxy pertama (Railway/nginx di belakang HTTPS). Tanpa ini express-rate-limit
// error ERR_ERL_UNEXPECTED_X_FORWARDED_FOR karena header X-Forwarded-For dari proxy.
app.set('trust proxy', 1)

// Security header dasar. Sebelumnya tidak ada sama sekali.
// API ini hanya melayani JSON dan tidak merender HTML, sehingga CSP ketat
// (contentSecurityPolicy) tidak diperlukan dan justru berisiko mengganggu
// konsumen. crossOriginResourcePolicy dibuat 'cross-origin' agar frontend di
// domain Vercel tetap dapat membaca respons.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
  })
)

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Daftar domain DEXPLISIT yang boleh memanggil API dengan kredensial.
// Sebelumnya kode menerima SEMUA pola *.vercel.app, sehingga setiap deployment
// Vercel milik siapa pun (termasuk penyerang) diizinkan mengakses API.
// Isi ALLOWED_EXTRA_ORIGINS bila butuh menambah deployment preview tertentu,
// mis. "https://driven-mbg-waste-git-staging.vercel.app".
const allowedExtra = (process.env.ALLOWED_EXTRA_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function originDiizinkan(origin) {
  return allowedOrigins.includes(origin) || allowedExtra.includes(origin)
}

app.use(cors({
  origin(origin, callback) {
    // Tanpa Origin (perangkat IoT, curl, health check) tetap diizinkan.
    if (!origin) return callback(null, true)
    if (originDiizinkan(origin)) return callback(null, true)

    // Bila belum ada konfigurasi sama sekali, izinkan localhost untuk pengembangan.
    if (allowedOrigins.length === 0 && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true)
    }

    console.warn('[cors] origin ditolak:', origin)
    return callback(null, false)
  },
  credentials: true
}))
// Batas body dibedakan per jenis endpoint. Sebelumnya seluruh aplikasi memakai
// 10mb, termasuk endpoint IoT yang hanya menerima JSON kecil — itu memudahkan
// penghabisan memori tanpa autentikasi. Endpoint unggah foto memasang batasnya
// sendiri lewat multer, sehingga 10mb di sini hanya berlaku untuk JSON.
app.use('/api/iot', express.json({ limit: '256kb' }))
app.use(express.json({ limit: '1mb' }))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi 15 menit lagi.' }
})

const iotLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
})

app.use('/api/auth/login', loginLimiter)
app.use('/api/iot', iotLimiter)

// Liveness: proses hidup. TIDAK memeriksa dependensi, supaya layanan tidak
// di-restart berulang hanya karena database sedang lambat.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', waktu: new Date().toISOString() })
})

// Readiness: dependensi benar-benar dapat dipakai + kesegaran data.
// Mengembalikan 503 bila database tidak dapat diakses, dan 200 dengan status
// 'degraded' bila hanya MQTT yang terputus (HTTP masih dapat dilayani).
app.get('/health/ready', async (req, res) => {
  try {
    const hasil = await periksaKesiapan()
    const kode = hasil.status === 'not-ready' ? 503 : 200
    res.status(kode).json(hasil)
  } catch (err) {
    log.error('pemeriksaan kesiapan gagal', { requestId: req.requestId, error: err.message })
    res.status(503).json({ status: 'not-ready', error: err.message })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/admin-sekolah', adminSekolahRoutes)
app.use('/api/admin-sekolah/batches', maggotBatchesRoutes)
app.use('/api/dapur-mbg', dapurMbgRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/demo', demoRoutes)
app.use('/api/iot', iotRoutes)
app.use('/api/devices', devicesRoutes)
// Statistik latency: khusus superadmin, tidak pernah publik.
app.use('/api/kinerja', kinerjaRoutes)
// Jejak audit tindakan operator: khusus superadmin.
app.use('/api/audit', auditRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' })
})

// Penangan error terpusat. Sebelumnya tidak ada, sehingga error yang dilempar
// di dalam handler async berakhir sebagai respons yang menggantung.
// Pesan internal TIDAK diteruskan ke klien; hanya requestId yang dikirim agar
// dapat dicocokkan dengan log.
app.use((err, req, res, next) => {
  void next
  if (res.__sudahDilog !== undefined) res.__sudahDilog = true
  log.error('error tidak tertangani', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  })

  if (res.headersSent) return

  // Batas ukuran body yang dilampaui ditangani sebagai 413, bukan 500.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Ukuran data terlalu besar.' })
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format JSON tidak valid.' })
  }

  res.status(500).json({
    error: 'Terjadi kesalahan pada server.',
    requestId: req.requestId
  })
})

const port = process.env.PORT || 4000

// Pemeriksaan skema dijalankan SEBELUM server menerima trafik.
// Di produksi, set SKEMA_ENFORCE=true agar proses berhenti bila migrasi
// provenance belum dijalankan (fail-fast, mencegah data parsial/hilang).
periksaSkema({
  enforce: process.env.SKEMA_ENFORCE === 'true' || process.env.NODE_ENV === 'production'
}).then(async () => {
  // Hidrasi state dari database sebelum menerima trafik. Tanpa ini, mode
  // pemeliharaan yang sedang aktif akan tampak mati setelah setiap deploy,
  // dan perangkat kembali mengirim data tanpa diminta.
  await muatState()

  const server = app.listen(port, () => {
    envInfo.lapor()
    log.info('server berjalan', {
      port,
      nodeEnv: process.env.NODE_ENV || 'development',
      corsDiizinkan: allowedOrigins.length ? allowedOrigins : '(belum diatur)',
      envTerisi: envInfo.terisi
    })
  })

  // Penyegaran berkala: pada mode multi-replika, replika lain perlu waktu
  // singkat untuk melihat perubahan state yang dilakukan replika ini.
  const JEDA_SEGAR_MS = Number(process.env.STATE_REFRESH_MS || 30000)
  const penyegar = setInterval(() => {
    muatState({ sunyi: true })
  }, JEDA_SEGAR_MS)
  penyegar.unref()

  const mqttClient = startMqtt()

  // --- Graceful shutdown ---
  // Tanpa ini, setiap deploy memutus koneksi MQTT dan permintaan yang sedang
  // berjalan secara mendadak. Railway mengirim SIGTERM sebelum mematikan proses.
  let sedangMatikan = false
  async function matikan(sinyal) {
    if (sedangMatikan) return
    sedangMatikan = true

    log.info('menerima sinyal, menghentikan layanan dengan rapi', { sinyal })

    // Berhenti menerima koneksi baru, selesaikan yang sedang berjalan.
    server.close(() => log.info('server HTTP ditutup'))

    // Tutup koneksi MQTT dengan rapi agar broker langsung tahu perangkat/backend
    // ini pergi (bukan menunggu keepalive habis).
    try {
      const klien = mqttClient || getClient()
      if (klien && klien.connected) {
        await new Promise((selesai) => klien.end(false, {}, selesai))
        log.info('koneksi MQTT ditutup')
      }
    } catch (err) {
      log.warn('penutupan MQTT gagal', { error: err.message })
    }

    // Beri kesempatan permintaan yang sedang berjalan untuk selesai.
    const batas = setTimeout(() => {
      log.warn('batas waktu penghentian tercapai, keluar paksa')
      process.exit(1)
    }, 10000)
    batas.unref()

    setTimeout(() => {
      log.info('penghentian selesai')
      process.exit(0)
    }, 500).unref()
  }

  process.on('SIGTERM', () => matikan('SIGTERM'))
  process.on('SIGINT', () => matikan('SIGINT'))

  process.on('unhandledRejection', (alasan) => {
    log.error('unhandledRejection', {
      error: alasan instanceof Error ? alasan.message : String(alasan)
    })
  })
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { error: err.message, stack: err.stack })
    matikan('uncaughtException')
  })
})
