function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak punya akses ke fitur ini' })
    }
    next()
  }
}

module.exports = requireRole
