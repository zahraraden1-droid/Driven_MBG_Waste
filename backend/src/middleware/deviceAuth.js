const jwt = require('jsonwebtoken')

function allowDeviceOrAdmin(req, res, next) {
  const deviceKey = process.env.DEVICE_API_KEY

  if (deviceKey && req.headers['x-device-api-key'] === deviceKey) {
    return next()
  }

  if (deviceKey) {
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

    return res.status(401).json({ error: 'Akses perangkat ditolak. Sertakan x-device-api-key yang benar.' })
  }

  next()
}

module.exports = allowDeviceOrAdmin