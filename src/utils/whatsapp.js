'use strict'

/**
 * Servicio de WhatsApp via Meta Cloud API.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * Si WA_TOKEN o WA_PHONE_ID no están configurados → loguea y no envía.
 * Todas las funciones son fire-and-forget.
 *
 * Usa mensajes de tipo "text" (sin plantillas aprobadas requeridas para
 * números en sandbox / cuentas de prueba con destinatarios verificados).
 * En producción se recomienda migrar a plantillas HSM aprobadas.
 */

const { WA_TOKEN, WA_PHONE_ID } = require('../config/env')

/**
 * Envía un mensaje de texto simple via WhatsApp.
 * @param {{ to: string, body: string }} opts  — `to` en formato E.164 sin '+'
 */
async function send({ to, body }) {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log(`[whatsapp] Sin credenciales — mensaje no enviado a ${to}`)
    return
  }

  // Normalizar: quitar '+' si viene con él
  const phone = to.replace(/^\+/, '')

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${WA_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:                phone,
          type:              'text',
          text:              { body },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error(`[whatsapp] Error Meta API ${res.status}: ${err}`)
    } else {
      console.log(`[whatsapp] Enviado a ${phone}`)
    }
  } catch (err) {
    console.error(`[whatsapp] Error de red al enviar a ${phone}:`, err.message)
  }
}

// ─────────────────────────────────────────────────────────────
// Mensajes
// ─────────────────────────────────────────────────────────────

/**
 * Confirmación de reserva al cliente.
 */
async function sendBookingConfirmation({ client, booking }) {
  if (!client.phone) return

  const sesion = booking.firstSession
    ? `\n📅 Primera clase: ${booking.firstSession.sessionDate} a las ${booking.firstSession.startTime}`
    : ''

  const body =
    `¡Hola ${client.firstName}! 🏄\n\n` +
    `Tu reserva en *Soul Surf School* está registrada.\n\n` +
    `📋 Referencia: *${booking.bookingRef}*` +
    `\n🏊 Tipo: ${booking.classType === 'private' ? 'Privada' : 'Grupal'}` +
    sesion +
    `\n💰 Total: $${Number(booking.totalAmount).toLocaleString('es-MX')} MXN\n\n` +
    `¡Nos vemos en el agua! 🌊`

  await send({ to: client.phone, body })
}

/**
 * Instrucciones SPEI al cliente.
 */
async function sendSpeiInstructions({ client, spei }) {
  if (!client.phone) return

  const body =
    `¡Hola ${client.firstName}! 🌊\n\n` +
    `Aquí están los datos para tu transferencia SPEI:\n\n` +
    `🏦 Banco: ${spei.bank.name}\n` +
    `🔢 CLABE: *${spei.bank.clabe}*\n` +
    `👤 Beneficiario: ${spei.bank.accountHolder}\n` +
    `📝 Concepto: ${spei.bank.concept}\n` +
    `🔖 Referencia: *${spei.bank.reference}*\n` +
    `💰 Monto exacto: *$${Number(spei.amount).toLocaleString('es-MX')} MXN*\n\n` +
    `Después de transferir, sube tu comprobante en el link de pago. ✅`

  await send({ to: client.phone, body })
}

/**
 * Link de pago generado por el admin.
 */
async function sendPaymentLink({ client, bookingRef, linkUrl }) {
  if (!client.phone) return

  const body =
    `¡Hola ${client.firstName}! 👋\n\n` +
    `Aquí está tu link de pago para tu reserva de surf:\n\n` +
    `📋 Reserva: *${bookingRef}*\n` +
    `🔗 ${linkUrl}\n\n` +
    `El link expira en 48 horas. ¡Cualquier duda escríbenos! 🏄`

  await send({ to: client.phone, body })
}

/**
 * Comprobante SPEI aprobado → reserva confirmada.
 */
async function sendSpeiApproved({ client, booking }) {
  if (!client.phone) return

  const body =
    `¡Hola ${client.firstName}! ✅\n\n` +
    `Tu transferencia fue validada y *tu reserva está confirmada*.\n\n` +
    `📋 Referencia: *${booking.bookingRef}*\n\n` +
    `¡Te esperamos en el agua! 🏄🌊`

  await send({ to: client.phone, body })
}

/**
 * Comprobante SPEI rechazado.
 */
async function sendSpeiRejected({ client, booking, notes }) {
  if (!client.phone) return

  const motivo = notes ? `\n❌ Motivo: ${notes}` : ''
  const body =
    `¡Hola ${client.firstName}! 👋\n\n` +
    `No pudimos validar tu comprobante de transferencia.` +
    motivo +
    `\n\nPor favor contáctanos para resolver esto. Tu reserva es *${booking.bookingRef}*.`

  await send({ to: client.phone, body })
}

module.exports = {
  sendBookingConfirmation,
  sendSpeiInstructions,
  sendPaymentLink,
  sendSpeiApproved,
  sendSpeiRejected,
}
