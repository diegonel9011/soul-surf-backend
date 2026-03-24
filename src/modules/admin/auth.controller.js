'use strict'

const bcrypt = require('bcrypt')
const jwt    = require('jsonwebtoken')
const prisma = require('../../config/database')
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config/env')
const { ok }             = require('../../utils/response')
const { unauthorizedError } = require('../../utils/errors')

/**
 * POST /api/v1/admin/auth/login
 *
 * Autentica a un usuario del panel de administración.
 * Devuelve un JWT Bearer token con rol y datos del admin.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body

    const admin = await prisma.adminUser.findFirst({
      where: { email, active: true },
    })

    const isValid = admin && await bcrypt.compare(password, admin.passwordHash)

    if (!isValid) {
      // Respuesta genérica para no revelar si el email existe o no
      throw unauthorizedError('Credenciales inválidas')
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    return ok(res, {
      token,
      expiresIn: JWT_EXPIRES_IN,
      admin: {
        id:    admin.id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
      },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { login }
