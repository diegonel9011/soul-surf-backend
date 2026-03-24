'use strict'

const {
  getPendingProofs,
  approveProof,
  rejectProof,
  createPaymentLink,
  resolvePaymentLink,
} = require('./payment-admin.service')
const { ok, created } = require('../../utils/response')
const email    = require('../../utils/email')
const whatsapp = require('../../utils/whatsapp')

// ─────────────────────────────────────────────────────────────
// Comprobantes SPEI
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/payments/spei/pending
 * Lista todos los comprobantes pendientes de revisión.
 */
async function listPendingProofs(req, res, next) {
  try {
    const proofs = await getPendingProofs()
    return ok(res, proofs)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/v1/admin/payments/spei/:proofId/approve
 * Aprueba un comprobante SPEI y confirma la reserva.
 */
async function approve(req, res, next) {
  try {
    const { proofId } = req.params
    const adminId     = req.admin.id
    const result = await approveProof(proofId, adminId)

    if (result._notify) {
      const { client, booking } = result._notify
      email.sendSpeiApproved({ client, booking }).catch(() => {})
      whatsapp.sendSpeiApproved({ client, booking }).catch(() => {})
    }

    const { _notify: _, ...response } = result
    return ok(res, response)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/v1/admin/payments/spei/:proofId/reject
 * Rechaza un comprobante SPEI con una nota explicativa.
 * Body: { notes: string }
 */
async function reject(req, res, next) {
  try {
    const { proofId } = req.params
    const adminId     = req.admin.id
    const { notes }   = req.body

    if (!notes || !notes.trim()) {
      return res.status(400).json({
        ok:      false,
        error:   'MISSING_NOTES',
        message: 'Se requiere el motivo del rechazo (campo: notes)',
      })
    }

    const result = await rejectProof(proofId, adminId, notes.trim())

    if (result._notify) {
      const { client, booking, notes: rejectNotes } = result._notify
      email.sendSpeiRejected({ client, booking, notes: rejectNotes }).catch(() => {})
      whatsapp.sendSpeiRejected({ client, booking, notes: rejectNotes }).catch(() => {})
    }

    const { _notify: _, ...response } = result
    return ok(res, response)
  } catch (err) {
    next(err)
  }
}

// ─────────────────────────────────────────────────────────────
// Quick Payment Links
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/bookings/:bookingId/payment-link
 * Genera un link de pago único para enviar al cliente por WhatsApp.
 * Body (opcional): { expires_in_hours: number }
 */
async function generatePaymentLink(req, res, next) {
  try {
    const { bookingId }    = req.params
    const expiresInHours   = req.body?.expires_in_hours ?? 48
    const result = await createPaymentLink(bookingId, expiresInHours)

    // Enviar link por WhatsApp si el cliente tiene teléfono registrado
    // (el admin también puede enviarlo manualmente desde el dashboard)
    const clientPhone = result.client.phone
    if (clientPhone) {
      whatsapp.sendPaymentLink({
        client:     { firstName: result.client.name.split(' ')[0], phone: clientPhone },
        bookingRef: result.bookingRef,
        linkUrl:    result.linkUrl,
      }).catch(() => {})
    }

    return created(res, result)
  } catch (err) {
    next(err)
  }
}

// ─────────────────────────────────────────────────────────────
// Resolución pública del link (sin auth)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/pay/:token
 * El frontend llama aquí cuando el cliente abre el link de pago.
 * Devuelve los datos de la reserva sin requerir autenticación.
 */
async function resolveLink(req, res, next) {
  try {
    const { token } = req.params
    const booking   = await resolvePaymentLink(token)
    return ok(res, booking)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listPendingProofs,
  approve,
  reject,
  generatePaymentLink,
  resolveLink,
}
