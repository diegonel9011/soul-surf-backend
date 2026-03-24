'use strict'

const crypto      = require('crypto')
const { Preference, Payment } = require('mercadopago')
const mpClient    = require('../../config/mercadopago')
const prisma      = require('../../config/database')
const { FRONTEND_BASE_URL, BACKEND_URL, MP_WEBHOOK_SECRET, NODE_ENV } = require('../../config/env')
const { notFoundError, businessError } = require('../../utils/errors')

// ─────────────────────────────────────────────────────────────
// Crear preferencia de pago
// ─────────────────────────────────────────────────────────────

/**
 * Crea una preferencia de pago en MercadoPago para una reserva.
 * Si ya existe un pago pendiente para esa reserva, retorna el mismo.
 *
 * @param {string} bookingId
 * @returns {{ preferenceId, checkoutUrl, sandboxUrl }}
 */
async function createPreference(bookingId) {
  const booking = await prisma.booking.findUnique({
    where:   { id: bookingId },
    include: { client: true },
  })

  if (!booking) throw notFoundError(`Reserva ${bookingId} no encontrada`)

  if (booking.status === 'confirmed') {
    throw businessError('Esta reserva ya está pagada y confirmada', 'BOOKING_ALREADY_PAID')
  }

  if (booking.status === 'cancelled') {
    throw businessError('Esta reserva fue cancelada', 'BOOKING_CANCELLED')
  }

  // Si ya existe un pago pendiente/procesando con preference_id, lo reutilizamos
  const existingPayment = await prisma.payment.findFirst({
    where: {
      bookingId,
      paymentMethod: 'mercadopago',
      status:        { in: ['pending', 'processing'] },
      mpPreferenceId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existingPayment?.mpPreferenceId) {
    return {
      preferenceId: existingPayment.mpPreferenceId,
      checkoutUrl:  buildCheckoutUrl(existingPayment.mpPreferenceId, false),
      sandboxUrl:   buildCheckoutUrl(existingPayment.mpPreferenceId, true),
      paymentId:    existingPayment.id,
    }
  }

  // Crea nueva preferencia en MercadoPago
  const preference = new Preference(mpClient)

  const prefBody = {
    items: [{
      id:          bookingId,
      title:       buildItemTitle(booking),
      description: buildItemDescription(booking),
      quantity:    1,
      unit_price:  Number(booking.totalAmount),
      currency_id: 'MXN',
    }],
    external_reference: bookingId,
    currency_id:        'MXN',
    back_urls: {
      success: `${BACKEND_URL}/api/v1/payments/return/success/${bookingId}`,
      failure: `${BACKEND_URL}/api/v1/payments/return/failure/${bookingId}`,
      pending: `${BACKEND_URL}/api/v1/payments/return/pending/${bookingId}`,
    },
    auto_return:      'approved',
    notification_url: `${BACKEND_URL}/api/v1/payments/mercadopago/webhook`,
  }

  const response = await preference.create({ body: prefBody })

  // Registra el pago en estado pendiente
  const payment = await prisma.payment.create({
    data: {
      bookingId,
      paymentMethod:  'mercadopago',
      amount:         booking.totalAmount,
      currency:       'MXN',
      status:         'pending',
      mpPreferenceId: response.id,
    },
  })

  return {
    preferenceId: response.id,
    checkoutUrl:  response.init_point,
    sandboxUrl:   response.sandbox_init_point,
    paymentId:    payment.id,
  }
}

// ─────────────────────────────────────────────────────────────
// Webhook handler
// ─────────────────────────────────────────────────────────────

/**
 * Procesa la notificación de pago recibida del webhook de MercadoPago.
 * SIEMPRE responde 200 a MP (se maneja el error internamente).
 *
 * Flujo:
 *  1. Valida la firma (si MP_WEBHOOK_SECRET está configurado)
 *  2. Obtiene el pago completo desde la API de MP
 *  3. Busca el Payment record por mp_payment_id o external_reference
 *  4. Actualiza Payment y Booking según el status de MP
 *
 * @param {object} body       - Body del webhook
 * @param {object} headers    - Headers del request
 * @returns {{ processed: boolean, status: string }}
 */
async function handleWebhook(body, headers) {
  // Solo procesamos notificaciones de tipo 'payment'
  const notificationType = body.type ?? body.topic
  if (notificationType !== 'payment') {
    return { processed: false, reason: 'not_a_payment_notification' }
  }

  // Extraemos el mp_payment_id del body
  // Formato nuevo: body.data.id | Formato legacy: body.resource (URL con ID)
  const mpPaymentId = String(
    body.data?.id ??
    body.resource?.split('/').pop() ??
    ''
  )

  if (!mpPaymentId) {
    return { processed: false, reason: 'missing_payment_id' }
  }

  // Validar firma si el secret está configurado
  if (MP_WEBHOOK_SECRET) {
    const isValid = validateSignature(body, headers)
    if (!isValid) return { processed: false, reason: 'invalid_signature' }
  }

  // Consultar el pago en la API de MercadoPago
  const paymentClient = new Payment(mpClient)
  const mpPayment     = await paymentClient.get({ id: mpPaymentId })

  const bookingId = mpPayment.external_reference

  // Actualizar estado en nuestra BD
  await prisma.$transaction(async (tx) => {
    // Buscar el Payment record — primero por mp_preference_id si coincide
    let payment = await tx.payment.findFirst({
      where: {
        bookingId,
        paymentMethod: 'mercadopago',
        status:        { not: 'completed' },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!payment) {
      // El pago llegó sin preferencia previa (flujo directo desde MP)
      payment = await tx.payment.create({
        data: {
          bookingId,
          paymentMethod: 'mercadopago',
          amount:        mpPayment.transaction_amount,
          currency:      'MXN',
          status:        'processing',
        },
      })
    }

    const newPaymentStatus = mapMpStatus(mpPayment.status)

    await tx.payment.update({
      where: { id: payment.id },
      data:  {
        status:         newPaymentStatus,
        mpPaymentId:    String(mpPaymentId),
        mpOrderId:      String(mpPayment.order?.id ?? ''),
        mpStatusDetail: mpPayment.status_detail ?? null,
        updatedAt:      new Date(),
      },
    })

    // Solo confirmamos la reserva si el pago fue acreditado
    if (newPaymentStatus === 'completed') {
      await tx.booking.update({
        where: { id: bookingId },
        data:  { status: 'confirmed' },
      })
    }
  })

  return { processed: true, mpStatus: mpPayment.status, bookingId }
}

// ─────────────────────────────────────────────────────────────
// Helpers privados
// ─────────────────────────────────────────────────────────────

function buildItemTitle(booking) {
  const type = booking.classType === 'private' ? 'Privada' : 'Grupal'
  return `Soul Surf School — Clase ${type} (${booking.numLessons} lección${booking.numLessons > 1 ? 'es' : ''})`
}

function buildItemDescription(booking) {
  return `Ref: ${booking.bookingRef} | ${booking.numParticipants} persona(s) | 2 hrs en el agua`
}

function buildCheckoutUrl(preferenceId, sandbox) {
  // En sandbox, la URL base es diferente
  const base = sandbox
    ? 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id='
    : 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id='
  return `${base}${preferenceId}`
}

/**
 * Mapea el status de MercadoPago a nuestro enum PaymentStatus.
 * @see https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/payment-result-handling/statuses
 */
function mapMpStatus(mpStatus) {
  const map = {
    approved:   'completed',
    authorized: 'processing',
    in_process: 'processing',
    in_mediation: 'processing',
    pending:    'pending',
    rejected:   'failed',
    cancelled:  'failed',
    refunded:   'refunded',
    charged_back: 'refunded',
  }
  return map[mpStatus] ?? 'pending'
}

/**
 * Valida la firma HMAC-SHA256 del webhook de MercadoPago.
 * Header: x-signature: ts=<timestamp>,v1=<hash>
 */
function validateSignature(body, headers) {
  try {
    const signature  = headers['x-signature'] ?? ''
    const requestId  = headers['x-request-id'] ?? ''
    const ts         = signature.match(/ts=([^,]+)/)?.[1]
    const v1         = signature.match(/v1=([^,]+)/)?.[1]
    if (!ts || !v1) return false

    const template = `id:${body.data?.id};request-id:${requestId};ts:${ts}`
    const expected = crypto
      .createHmac('sha256', MP_WEBHOOK_SECRET)
      .update(template)
      .digest('hex')

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
  } catch {
    return false
  }
}

module.exports = { createPreference, handleWebhook }
