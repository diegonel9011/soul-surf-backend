'use strict'

const { createBooking, getBookingById } = require('./booking.service')
const { ok, created }                   = require('../../utils/response')
const email                             = require('../../utils/email')
const whatsapp                          = require('../../utils/whatsapp')

/**
 * POST /api/v1/bookings
 *
 * Crea una reserva completa: cliente + sesión + waiver.
 * El pago se realiza en el siguiente paso (redirige a MercadoPago o SPEI).
 */
async function create(req, res, next) {
  try {
    const v = req.validated

    // Normaliza waiver: el frontend puede enviar `waiver_accepted: true` o `waiver: { full_name, accepted: true }`
    const waiver = (v.waiver && typeof v.waiver === 'object')
      ? v.waiver
      : { full_name: `${v.client.first_name} ${v.client.last_name}`, accepted: true }

    // Inyectamos IP y User-Agent para el waiver (auditoría legal)
    const bookingData = {
      ...v,
      waiver,
      _meta: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    }

    const booking = await createBooking(bookingData)

    // Notificaciones fire-and-forget — no bloquean la respuesta
    const client = {
      firstName: req.validated.client.first_name,
      email:     req.validated.client.email,
      phone:     req.validated.client.phone ?? null,
    }
    // Enriquecemos el booking con el método de pago elegido (para el correo)
    const bookingForEmail = { ...booking, paymentMethod: v.payment_method ?? null }
    email.sendBookingConfirmation({ client, booking: bookingForEmail }).catch(() => {})
    whatsapp.sendBookingConfirmation({ client, booking: bookingForEmail }).catch(() => {})

    return created(res, booking)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/v1/bookings/:id
 *
 * Obtiene el detalle completo de una reserva.
 * Usado en la página de confirmación tras crear la reserva.
 */
async function getById(req, res, next) {
  try {
    const booking = await getBookingById(req.params.id)
    return ok(res, booking)
  } catch (err) {
    next(err)
  }
}

module.exports = { create, getById }
