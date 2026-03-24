'use strict'

const jwt = require('jsonwebtoken')

/**
 * Middleware que verifica el Bearer token JWT en las rutas de administración.
 * Si el token es válido, adjunta el payload en req.admin.
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      ok:      false,
      error:   'UNAUTHORIZED',
      message: 'Se requiere un token de autenticación (Bearer)',
    })
  }

  const token = authHeader.slice(7)

  try {
    const { JWT_SECRET } = require('../config/env')
    const payload = jwt.verify(token, JWT_SECRET)
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({
      ok:      false,
      error:   'INVALID_TOKEN',
      message: 'Token inválido o expirado',
    })
  }
}

module.exports = { requireAdmin }
