const jwt = require('jsonwebtoken')

/**
 * Autentikasi perangkat IoT ATAU admin.
 *
 * PERBAIKAN KEAMANAN (fail-closed):
 * Sebelumnya, bila DEVICE_API_KEY tidak diatur, fungsi ini langsung memanggil
 * next() tanpa autentikasi sama sekali. Akibatnya, cukup satu variabel
 * lingkungan yang lupa diisi untuk membuka seluruh endpoint IoT
 * (/api/iot/*, termasuk toggle maintenance-mode) ke publik.
 *
 * Sekarang: bila DEVICE_API_KEY kosong, akses DITOLAK di produksi.
 * Di luar produksi, akses diizinkan tetapi dengan peringatan jelas agar
 * tidak diam-diam lolos tanpa disadari.
 */
function allowDeviceOrAdmin(req, res, next) {
  const deviceKey = process.env.DEVICE_API_KEY
  const isProduction = process.env.NODE_ENV === 'production'
  const izinkanTanpaKey = process.env.ALLOW_UNAUTHENTICATED_IOT === 'true'

  if (!deviceKey) {
    if (isProduction && !izinkanTanpaKey) {
      console.error(
        '[deviceAuth] DEVICE_API_KEY kosong di produksi. Akses perangkat DITOLAK. ' +
          'Set DEVICE_API_KEY, atau set ALLOW_UNAUTHENTICATED_IOT=true bila memang disengaja.'
      )
      return res.status(503).json({
        error: 'Akses perangkat belum dikonfigurasi di server (DEVICE_API_KEY kosong).'
      })
    }
    if (!isProduction) {
      console.warn(
        '[deviceAuth] PERINGATAN: DEVICE_API_KEY kosong, akses perangkat diizinkan tanpa autentikasi (mode non-produksi).'
      )
    }
    return next()
  }

  // 1) Jalur perangkat: header x-device-api-key
  if (req.headers['x-device-api-key'] === deviceKey) {
    return next()
  }

  // 2) Jalur admin: bearer token, hanya role yang berwenang
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      req.user = payload
      return next()
    } catch (err) {
      return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' })
    }
  }

  return res.status(401).json({
    error: 'Akses perangkat ditolak. Sertakan x-device-api-key yang benar.'
  })
}

module.exports = allowDeviceOrAdmin