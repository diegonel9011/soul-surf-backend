'use strict'

const { Router }     = require('express')
const { requireAdmin } = require('../../middleware/auth')
const {
  listPendingProofs,
  approve,
  reject,
  generatePaymentLink,
  resolveLink,
} = require('./payment-admin.controller')
const { list: listBookings } = require('./bookings-admin.controller')

// ── Rutas protegidas (admin) ──────────────────────────────────

const adminRouter = Router()
adminRouter.use(requireAdmin)

/**
 * GET /api/v1/admin/payments/spei/pending
 */
adminRouter.get('/payments/spei/pending', listPendingProofs)

/**
 * POST /api/v1/admin/payments/spei/:proofId/approve
 */
adminRouter.post('/payments/spei/:proofId/approve', approve)

/**
 * POST /api/v1/admin/payments/spei/:proofId/reject
 */
adminRouter.post('/payments/spei/:proofId/reject', reject)

/**
 * GET /api/v1/admin/bookings
 */
adminRouter.get('/bookings', listBookings)

/**
 * POST /api/v1/admin/bookings/:bookingId/payment-link
 */
adminRouter.post('/bookings/:bookingId/payment-link', generatePaymentLink)

// ── Ruta pública de resolución de link ───────────────────────

const publicRouter = Router()

/**
 * GET /api/v1/pay/:token
 */
publicRouter.get('/:token', resolveLink)

module.exports = { adminRouter, publicRouter }
