'use strict'

const express    = require('express')
const helmet     = require('helmet')
const cors       = require('cors')
const { FRONTEND_URL } = require('./config/env')
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

// ── Seguridad y parsing ──────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: FRONTEND_URL, credentials: true }))
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
