'use strict'

require('dotenv').config()

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
]

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[env] Variable de entorno requerida no encontrada: ${key}`)
  }
}

module.exports = {
  NODE_ENV:      process.env.NODE_ENV ?? 'development',
  PORT:          parseInt(process.env.PORT ?? '3001', 10),
  FRONTEND_URL:  process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
    : ['http://localhost:3000'],

  DATABASE_URL:  process.env.DATABASE_URL,

  JWT_SECRET:     process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '8h',

  MP_ACCESS_TOKEN:   process.env.MP_ACCESS_TOKEN ?? '',
  MP_PUBLIC_KEY:     process.env.MP_PUBLIC_KEY ?? '',
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET ?? '',

  R2_ACCOUNT_ID:       process.env.R2_ACCOUNT_ID ?? '',
  R2_ACCESS_KEY_ID:    process.env.R2_ACCESS_KEY_ID ?? '',
  R2_SECRET_ACCESS_KEY:process.env.R2_SECRET_ACCESS_KEY ?? '',
  R2_BUCKET_NAME:      process.env.R2_BUCKET_NAME ?? '',
  R2_PUBLIC_URL:       process.env.R2_PUBLIC_URL ?? '',

  BACKEND_URL: process.env.BACKEND_URL ?? 'http://localhost:3001',

  SPEI_CLABE:          process.env.SPEI_CLABE ?? '',
  SPEI_BANK:           process.env.SPEI_BANK ?? '',
  SPEI_ACCOUNT_HOLDER: process.env.SPEI_ACCOUNT_HOLDER ?? '',
  SPEI_CONCEPT:        process.env.SPEI_CONCEPT ?? 'Reserva Soul Surf School',

  // ── Resend (emails transaccionales) ──────────────────────────
  RESEND_API_KEY:  process.env.RESEND_API_KEY ?? '',
  RESEND_FROM:     process.env.RESEND_FROM ?? 'Soul Surf School <reservas@soulsurfschool.mx>',
  // En dev, redirige todos los emails a esta dirección (Resend solo permite enviar a dominios verificados)
  RESEND_TEST_TO:  process.env.RESEND_TEST_TO ?? '',

  // ── WhatsApp Meta Cloud API ───────────────────────────────────
  WA_TOKEN:    process.env.WA_TOKEN ?? '',
  WA_PHONE_ID: process.env.WA_PHONE_ID ?? '',
}
