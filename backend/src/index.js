require('dotenv').config()
const express = require('express')
const cors = require('cors')

const authRoutes = require('./routes/auth')
const publicRoutes = require('./routes/public')
const adminSekolahRoutes = require('./routes/adminSekolah')
const dapurMbgRoutes = require('./routes/dapurMbg')
const reportsRoutes = require('./routes/reports')
const demoRoutes = require('./routes/demo')

const app = express()

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }))
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', waktu: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/admin-sekolah', adminSekolahRoutes)
app.use('/api/dapur-mbg', dapurMbgRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/demo', demoRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' })
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Server SPPG MBG berjalan di port ${port}`)
})
