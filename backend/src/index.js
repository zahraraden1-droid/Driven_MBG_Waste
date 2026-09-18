require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

const authRoutes = require('./routes/auth')
const publicRoutes = require('./routes/public')
const adminSekolahRoutes = require('./routes/adminSekolah')
const dapurMbgRoutes = require('./routes/dapurMbg')
const reportsRoutes = require('./routes/reports')
const demoRoutes = require('./routes/demo')
const iotRoutes = require('./routes/iot')
const maggotBatchesRoutes = require('./routes/maggotBatches')
const { startMqtt } = require('./config/mqtt')

const app = express()

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return callback(null, true)
    return callback(null, false)
  },
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', waktu: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/admin-sekolah', adminSekolahRoutes)
app.use('/api/admin-sekolah/batches', maggotBatchesRoutes)
app.use('/api/dapur-mbg', dapurMbgRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/demo', demoRoutes)
app.use('/api/iot', iotRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' })
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Server SPPG MBG berjalan di port ${port}`)
})

startMqtt()
