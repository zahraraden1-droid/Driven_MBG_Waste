const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const supabase = require('../config/supabase')
const { isDemoActive } = require('../config/demoMode')

const router = express.Router()

const demoUsers = [
  { id: 'demo-super-1', nama: 'Super Admin Demo', email: 'superadmin@demo.local', password: 'demo123', role: 'superadmin' },
  { id: 'demo-admin-1', nama: 'Admin SDN 01 Cempaka', email: 'admin@demo.local', password: 'demo123', role: 'admin_sekolah', sekolahId: 'demo-sekolah-1' },
  { id: 'demo-dapur-1', nama: 'Dapur MBG Wilayah 1', email: 'dapur@demo.local', password: 'demo123', role: 'dapur_mbg' }
]

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi' })
  }

  if (isDemoActive()) {
    const found = demoUsers.find((u) => u.email === email && u.password === password)
    if (!found) {
      return res.status(401).json({ error: 'Email atau password salah' })
    }
    const token = jwt.sign(
      { id: found.id, role: found.role, nama: found.nama, sekolahId: found.sekolahId || null },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )
    return res.json({ token, user: { id: found.id, nama: found.nama, role: found.role, email: found.email } })
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Koneksi Supabase belum dikonfigurasi' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (error || !user) {
    return res.status(401).json({ error: 'Email atau password salah' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Email atau password salah' })
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, nama: user.nama, sekolahId: user.sekolah_id || null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )

  res.json({ token, user: { id: user.id, nama: user.nama, role: user.role, email: user.email } })
})

router.get('/demo-accounts', (req, res) => {
  res.json(demoUsers.map((u) => ({ email: u.email, password: u.password, role: u.role, nama: u.nama })))
})

module.exports = router
