const express = require('express')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive, setDemoActive } = require('../config/demoMode')

const router = express.Router()

router.get('/status', (req, res) => {
  res.json({ demoActive: isDemoActive() })
})

router.post('/toggle', requireAuth, requireRole('superadmin'), (req, res) => {
  const { active } = req.body
  const result = setDemoActive(active)
  res.json({ demoActive: result })
})

module.exports = router
