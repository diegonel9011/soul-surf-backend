'use strict'

const { Router } = require('express')
const validate   = require('../../middleware/validate')
const upload     = require('../../middleware/upload')
const { CreatePreferenceSchema, SpeiInstructionsSchema } = require('./payment.schema')
const {
  mpCreatePreference,
  mpWebhook,
  speiInstructions,
  speiUploadProof,
} = require('./payment.controller')

const router = Router()

// ── MercadoPago ───────────────────────────────────────────────

/**
 * POST /api/v1/payments/mercadopago/preference
 * Crea una preferencia de checkout. El frontend redirige al checkout_url.
 */
router.post(
  '/mercadopago/preference',
  validate(CreatePreferenceSchema),
  mpCreatePreference
)

/**
 * POST /api/v1/payments/mercadopago/webhook
 * MercadoPago llama aquí cuando cambia el estado de un pago.
 * No requiere auth — MP firma el request con x-signature.
 * Nota: en producción exponer esta URL con ngrok o en el servidor público.
 */
router.post('/mercadopago/webhook', mpWebhook)

// ── SPEI ─────────────────────────────────────────────────────

/**
 * GET /api/v1/payments/spei/instructions?booking_id=xxx
 * Datos bancarios + pasos para hacer la transferencia.
 */
router.get(
  '/spei/instructions',
  validate(SpeiInstructionsSchema, 'query'),
  speiInstructions
)

/**
 * POST /api/v1/payments/spei/upload-proof
 * Multipart: campo 'proof' (imagen/PDF) + body { payment_id, booking_id }
 */
router.post('/spei/upload-proof', upload.single('proof'), speiUploadProof)

module.exports = router
