'use strict'

const express    = require('express')
const helmet     = require('helmet')
const cors       = require('cors')
const { FRONTEND_URL, NODE_ENV } = require('./config/env')
const errorHandler     = require('./middleware/errorHandler')

// ── Routers ───────────────────────────────────────────────────
const quoteRoutes        = require('./modules/quotes/quote.routes')
const availabilityRoutes = require('./modules/availability/availability.routes')
const bookingRoutes      = require('./modules/bookings/booking.routes')
const adminAuthRoutes    = require('./modules/admin/auth.routes')
const paymentRoutes      = require('./modules/payments/payment.routes')
const { adminRouter: adminPaymentRoutes, publicRouter: payLinkRoutes } =
  require('./modules/admin/payment-admin.routes')

const app = express()

// ── CORS primero, antes de helmet ────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin
  const allowed = NODE_ENV === 'development' || (Array.isArray(FRONTEND_URL) && FRONTEND_URL.includes(origin))
  if (origin && allowed) {
    res.header('Access-Control-Allow-Origin',      origin)
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Methods',     'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS')
    res.header('Access-Control-Allow-Headers',     'Content-Type,Authorization')
  }
  if (req.method === 'OPTIONS') return res.status(200).end()
  next()
})

// ── Seguridad y parsing ──────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, service: 'soul-surf-api' }))

// ── Rutas de la API ───────────────────────────────────────────
app.use('/api/v1/quotes',        quoteRoutes)
app.use('/api/v1/availability',  availabilityRoutes)
app.use('/api/v1/bookings',      bookingRoutes)
app.use('/api/v1/payments',      paymentRoutes)
app.use('/api/v1/admin/auth',    adminAuthRoutes)
app.use('/api/v1/admin',         adminPaymentRoutes)
app.use('/api/v1/pay',           payLinkRoutes)

// ── Error handler global (siempre al final) ──────────────────
app.use(errorHandler)

module.exports = app
