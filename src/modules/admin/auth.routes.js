'use strict'

const { Router } = require('express')
const { z }      = require('zod')
const validate   = require('../../middleware/validate')
const { login }  = require('./auth.controller')

const router = Router()

const LoginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

/**
 * POST /api/v1/admin/auth/login
 */
router.post('/login', validate(LoginSchema), login)

module.exports = router
