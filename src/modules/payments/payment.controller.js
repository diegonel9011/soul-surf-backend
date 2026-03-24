'use strict'

const { createPreference, handleWebhook } = require('./mercadopago.service')
const { getSpeiInstructions, uploadProof } = require('./spei.service')
const { ok, created } = require('../../utils/response')
const email     = require('../../utils/email')
const whatsapp  = require('../../utils/whatsapp')

// ─────────────────────────────────────────────────────────────
// MercadoPago
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/payments/mercadopago/preference
 * Crea una preferencia de pago y devuelve la URL de checkout.
 */
async function mpCreatePreference(req, res, next) {
  try {
    const { booking_id } = req.validated
    const result = await createPreference(booking_id)
    return created(res, result)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/v1/payments/mercadopago/webhook
 * Recibe notificaciones de MercadoPago sobre cambios de estado de pago.
 * SIEMPRE devuelve 200 para que MP no reintente indefinidamente.
 */
async function mpWebhook(req, res) {
  try {
    const result = await handleWebhook(req.body, req.headers)
    return res.status(200).json({ ok: true, data: result })
  } catch (err) {
    // Logueamos el error pero siempre respondemos 200 a MP
    console.error('[MP Webhook Error]', err.message)
    return res.status(200).json({ ok: true, data: { processed: false, error: err.message } })
  }
}

// ─────────────────────────────────────────────────────────────
// SPEI
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/payments/spei/instructions?booking_id=xxx
 * Devuelve los datos bancarios y las instrucciones para hacer la transferencia.
 */
async function speiInstructions(req, res, next) {
  try {
    const { booking_id } = req.validated
    const instructions = await getSpeiInstructions(booking_id)

    // Notificaciones fire-and-forget con datos bancarios
    const booking = { bookingRef: instructions.bookingRef }
    email.sendSpeiInstructions({ client: instructions.client, booking, spei: instructions }).catch(() => {})
    whatsapp.sendSpeiInstructions({ client: instructions.client, spei: instructions }).catch(() => {})

    return ok(res, instructions)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/v1/payments/spei/upload-proof
 * El cliente sube el comprobante de transferencia para revisión del staff.
 * Requiere multipart/form-data con campo 'proof' (archivo) y 'payment_id'.
 */
async function speiUploadProof(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok:      false,
        error:   'MISSING_FILE',
        message: 'Se requiere el archivo del comprobante (campo: proof)',
      })
    }

    const { payment_id, booking_id } = req.body
    if (!payment_id) {
      return res.status(400).json({
        ok:      false,
        error:   'MISSING_PAYMENT_ID',
        message: 'Se requiere payment_id',
      })
    }

    const result = await uploadProof(payment_id, req.file, booking_id)
    return created(res, result)
  } catch (err) {
    next(err)
  }
}

module.exports = { mpCreatePreference, mpWebhook, speiInstructions, speiUploadProof }
