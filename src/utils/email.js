'use strict'

/**
 * Servicio de emails transaccionales via Resend.
 * https://resend.com/docs/api-reference/emails/send-email
 *
 * Si RESEND_API_KEY no está configurado → loguea y no envía (modo dev).
 * Todas las funciones son fire-and-forget: nunca rompen el flujo de negocio.
 */

const { RESEND_API_KEY, RESEND_FROM, RESEND_TEST_TO, NODE_ENV } = require('../config/env')

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Envía un email via Resend.
 * En desarrollo, si RESEND_TEST_TO está definido, redirige todos los emails ahí
 * (Resend free tier solo permite enviar a dominios verificados).
 * @param {{ to: string, subject: string, html: string }} opts
 */
async function send({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] Sin RESEND_API_KEY — email no enviado a ${to}: "${subject}"`)
    return
  }

  // En desarrollo redirigir a la dirección de prueba si está configurada
  const recipient = (NODE_ENV !== 'production' && RESEND_TEST_TO) ? RESEND_TEST_TO : to

  try {
    const res = await fetch(RESEND_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    RESEND_FROM,
        to:      [recipient],
        subject: NODE_ENV !== 'production' && RESEND_TEST_TO ? `[DEV → ${to}] ${subject}` : subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[email] Error Resend ${res.status}: ${body}`)
    } else {
      console.log(`[email] Enviado a ${to}: "${subject}"`)
    }
  } catch (err) {
    console.error(`[email] Error de red al enviar a ${to}:`, err.message)
  }
}

// ─────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────

/**
 * Pre-reserva: solicitud recibida, pago pendiente.
 * Se envía justo después de crear la reserva.
 */
async function sendBookingConfirmation({ client, booking }) {
  const tipoClase   = booking.classType === 'private' ? 'Privada' : 'Grupal'
  const sessionDate = booking.firstSession?.sessionDate
    ? new Date(booking.firstSession.sessionDate).toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : null
  const startTime   = booking.firstSession?.startTime
    ? String(booking.firstSession.startTime).substring(0, 5)
    : null
  const isSpei = booking.paymentMethod === 'spei'

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1e293b">
      <h2 style="color:#0369a1;margin-bottom:4px">¡Casi listo! Completa tu pago para asegurar tu clase 🌊</h2>
      <p>Hola <strong>${client.firstName}</strong>,</p>
      <p>Recibimos tu solicitud de reserva en <strong>Soul Surf School</strong>. Para asegurar tu lugar y confirmar la clase, es necesario completar el pago.</p>

      <p style="font-weight:600;margin-bottom:8px">Detalles de tu solicitud:</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
        <tr><td style="padding:7px 0;color:#64748b;width:140px">Referencia</td>
            <td style="font-family:monospace;font-weight:700">${booking.bookingRef}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b">Tipo de clase</td>
            <td>${tipoClase}</td></tr>
        ${sessionDate ? `<tr><td style="padding:7px 0;color:#64748b">Fecha</td>
            <td>${sessionDate}</td></tr>` : ''}
        ${startTime ? `<tr><td style="padding:7px 0;color:#64748b">Hora</td>
            <td>${startTime} hrs</td></tr>` : ''}
        <tr><td style="padding:7px 0;color:#64748b">Total a pagar</td>
            <td style="font-weight:700;color:#0369a1">$${Number(booking.totalAmount).toLocaleString('es-MX')} MXN</td></tr>
      </table>

      ${isSpei ? `<p style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:4px;font-size:14px;color:#166534">
        En unos minutos recibirás un segundo correo con los datos bancarios para hacer tu transferencia SPEI. Recuerda que los lugares están sujetos a disponibilidad hasta confirmar el pago.
      </p>` : ''}

      <p style="margin-top:20px">¡Nos vemos en el agua! 🏄<br>
      <span style="color:#64748b;font-size:13px">Soul Surf School · Puerto Escondido</span></p>
    </div>
  `
  await send({ to: client.email, subject: `¡Casi listo! Completa tu pago para asegurar tu clase 🌊`, html })
}

/**
 * Instrucciones de transferencia SPEI.
 */
async function sendSpeiInstructions({ client, booking, spei }) {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1e293b">
      <h2 style="color:#0369a1;margin-bottom:4px">Datos bancarios para tu clase de surf 🏄‍♂️</h2>
      <p>Hola <strong>${client.firstName}</strong>,</p>
      <p>Para confirmar tu clase de surf, por favor realiza tu transferencia con los siguientes datos:</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:16px 0">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:7px 0;color:#166534;width:140px">Banco</td>
              <td style="font-weight:600">${spei.bank.name}</td></tr>
          <tr><td style="padding:7px 0;color:#166534">CLABE</td>
              <td style="font-family:monospace;font-weight:700;font-size:15px;letter-spacing:1px">${spei.bank.clabe}</td></tr>
          <tr><td style="padding:7px 0;color:#166534">Beneficiario</td>
              <td>${spei.bank.accountHolder}</td></tr>
          <tr><td style="padding:7px 0;color:#166534">Monto exacto</td>
              <td style="font-weight:700;font-size:18px;color:#15803d">$${Number(spei.amount).toLocaleString('es-MX')} MXN</td></tr>
          <tr><td style="padding:7px 0;color:#166534">Concepto</td>
              <td>Reserva ${booking.bookingRef}</td></tr>
        </table>
      </div>

      <p style="background:#fefce8;border-left:4px solid #ca8a04;padding:12px 16px;border-radius:4px;font-size:14px;color:#713f12">
        <strong>Importante:</strong> Una vez realizada la transferencia, entra al link de tu reserva para subir la captura de pantalla de tu comprobante. Nuestro equipo validará el pago y te enviaremos un correo de confirmación final.
      </p>

      <p style="margin-top:20px;color:#64748b;font-size:13px">Soul Surf School · Puerto Escondido</p>
    </div>
  `
  await send({ to: client.email, subject: `Datos bancarios para tu clase de surf (Ref: ${booking.bookingRef}) 🏄‍♂️`, html })
}

/**
 * Confirmación final: comprobante SPEI aprobado, reserva confirmada.
 */
async function sendSpeiApproved({ client, booking }) {
  const tipoClase   = booking.classType === 'private' ? 'Privada' : 'Grupal'
  const sessionDate = booking.firstSession?.sessionDate
    ? new Date(booking.firstSession.sessionDate).toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : null
  const startTime   = booking.firstSession?.startTime
    ? String(booking.firstSession.startTime).substring(0, 5)
    : null

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1e293b">
      <h2 style="color:#16a34a;margin-bottom:4px">¡Pago confirmado! Tu clase de surf está lista ✅</h2>
      <p>Hola <strong>${client.firstName}</strong>,</p>
      <p>Hemos validado tu pago exitosamente. <strong>¡Tu lugar está 100% confirmado!</strong></p>

      <p style="font-weight:600;margin-bottom:8px">Aquí tienes los detalles para el día de tu clase:</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        <tr><td style="padding:7px 0;color:#64748b;width:140px">Referencia</td>
            <td style="font-family:monospace;font-weight:700">${booking.bookingRef}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b">Tipo de clase</td>
            <td>${tipoClase}</td></tr>
        ${sessionDate ? `<tr><td style="padding:7px 0;color:#64748b">Fecha</td>
            <td>${sessionDate}</td></tr>` : ''}
        ${startTime ? `<tr><td style="padding:7px 0;color:#64748b">Hora</td>
            <td>${startTime} hrs</td></tr>` : ''}
      </table>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <p style="font-weight:600;color:#166534;margin:0 0 8px">¿Qué incluye?</p>
        <p style="color:#166534;font-size:14px;margin:0;line-height:1.6">
          Te brindaremos la tabla de surf y lycra (camiseta). Empezaremos con una práctica de 15 a 25 minutos en la arena y el resto del tiempo será directamente en el agua.
        </p>
      </div>

      <p style="font-size:14px;color:#475569">
        Te recomendamos llegar 10 minutos antes y traer buen bloqueador solar. ¡Prepárate para las mejores olas de Puerto Escondido!
      </p>

      <p style="margin-top:20px;color:#64748b;font-size:13px">Soul Surf School · Puerto Escondido</p>
    </div>
  `
  await send({ to: client.email, subject: `¡Pago confirmado! Tu clase de surf está lista ✅`, html })
}

/**
 * Notificación de comprobante SPEI rechazado.
 */
async function sendSpeiRejected({ client, booking, notes }) {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#dc2626">Comprobante no aprobado</h2>
      <p>Hola <strong>${client.firstName}</strong>,</p>
      <p>Tu comprobante de transferencia no pudo ser validado.</p>
      ${notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;color:#991b1b"><strong>Motivo:</strong> ${notes}</p>` : ''}
      <p>Por favor contáctanos por WhatsApp o vuelve a intentar el pago.</p>
      <p style="color:#64748b;font-size:13px">Reserva: <code>${booking.bookingRef}</code></p>
      <p style="color:#64748b;font-size:13px">Soul Surf School · Puerto Escondido</p>
    </div>
  `
  await send({ to: client.email, subject: `Comprobante rechazado · ${booking.bookingRef}`, html })
}

module.exports = {
  sendBookingConfirmation,
  sendSpeiInstructions,
  sendSpeiApproved,
  sendSpeiRejected,
}
