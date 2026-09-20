/*
 * Observability: log terstruktur JSON + request-id + pengukuran durasi.
 *
 * Sebelumnya backend hanya memakai console.log/console.error tanpa struktur,
 * sehingga log tidak dapat dicari, disaring, atau diagregasi — dan tidak ada
 * satu pun pengukuran durasi, sehingga klaim latency tidak dapat dibuktikan
 * dari data.
 *
 * Modul ini menyediakan:
 *   - logger JSON (satu baris per kejadian) dengan level dan konteks
 *   - requestId per permintaan (dapat dilacak lintas tahap)
 *   - middleware yang mencatat method, path, status, dan durasi
 *
 * Tidak menambah dependensi eksternal.
 */

const crypto = require('node:crypto')

const SERVICE = process.env.SERVICE_NAME || 'mbg-backend'
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase()

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

function bolehLog(level) {
  return (LEVELS[level] || 20) >= (LEVELS[LOG_LEVEL] || 20)
}

function tulis(level, pesan, konteks = {}) {
  if (!bolehLog(level)) return

  const entri = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    pesan,
    ...konteks
  }

  // Jangan pernah mencatat kredensial, walaupun tidak sengaja dioper.
  for (const k of Object.keys(entri)) {
    if (/password|secret|token|api[_-]?key|authorization/i.test(k)) {
      entri[k] = '[DISENSOR]'
    }
  }

  const baris = JSON.stringify(entri)
  if (level === 'error') console.error(baris)
  else if (level === 'warn') console.warn(baris)
  else console.log(baris)
}

const log = {
  debug: (pesan, konteks) => tulis('debug', pesan, konteks),
  info: (pesan, konteks) => tulis('info', pesan, konteks),
  warn: (pesan, konteks) => tulis('warn', pesan, konteks),
  error: (pesan, konteks) => tulis('error', pesan, konteks)
}

/**
 * Middleware: pasang requestId, catat durasi, dan simpan penanda waktu
 * tahap-tahap penting pada req.
 *
 * Tahap yang dicatat (dipakai untuk menghitung latency distribusi):
 *   t0 = permintaan diterima
 *   tSelesai = respons dikirim
 *
 * Handler dapat memanggil req.tandaiTahap('roboflowMulai') untuk mencatat
 * tahap internal, lalu membacanya kembali saat menyimpan data.
 */
function middlewareObservability(req, res, next) {
  const requestId =
    req.headers['x-request-id'] || crypto.randomUUID().slice(0, 12)

  req.requestId = requestId
  req.tahap = { mulai: Date.now(), mulaiIso: new Date().toISOString() }
  req.tandaiTahap = (nama) => {
    req.tahap[nama] = Date.now()
  }
  req.durasiTahapMs = (dari, ke) => {
    if (req.tahap[dari] === undefined || req.tahap[ke] === undefined) return null
    return req.tahap[ke] - req.tahap[dari]
  }

  res.setHeader('x-request-id', requestId)

  const selesaiAsli = res.end
  res.end = function (...args) {
    // Bila penangan error terpusat sudah mencatat permintaan ini, jangan catat dua kali.
    if (res.__sudahDilog) return selesaiAsli.apply(this, args)
    res.__sudahDilog = true

    const durasi = Date.now() - req.tahap.mulai

    // Aset statis dan health check tidak perlu dicatat pada level info.
    const sepi =
      req.path === '/health' || req.path === '/health/ready' || req.path === '/favicon.ico'

    const konteks = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durasiMs: durasi,
      ...(req.durasiTahapMs('mulai', 'selesai') !== null
        ? { durasiTahapMs: req.durasiTahapMs('mulai', 'selesai') }
        : {})
    }

    if (res.statusCode >= 500) {
      log.error('permintaan gagal', konteks)
    } else if (res.statusCode >= 400) {
      log.warn('permintaan ditolak', konteks)
    } else if (!sepi) {
      log.info('permintaan selesai', konteks)
    }

    return selesaiAsli.apply(this, args)
  }

  next()
}

module.exports = { log, middlewareObservability, SERVICE, LOG_LEVEL }
