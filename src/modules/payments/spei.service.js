'use strict'

const prisma        = require('../../config/database')
const { uploadFile } = require('../../utils/storage')
const { notFoundError } = require('../../utils/errors')
const {
  SPEI_CLABE,
  SPEI_BANK,
  SPEI_ACCOUNT_HOLDER,
  SPEI_CONCEPT,
} = require('../../config/env')

// ─────────────────────────────────────────────────────────────
// Instrucciones SPEI
// ─────────────────────────────────────────────────────────────

/**
 * Genera las instrucciones de transferencia SPEI para una reserva.
 * La referencia numérica se construye a partir del bookingRef para
 * que el staff pueda identificar el pago manualmente.
 *
 * @param {string} bookingId
 */
async function getSpeiInstructions(bookingId) {
  const booking = await prisma.booking.findUnique({
    where:   { id: bookingId },
    include: { client: { select: { firstName: true, lastName: true, email: true, phone: true } } },
  })

  if (!booking) throw notFoundError(`Reserva ${bookingId} no encontrada`)

  // Crea (o reutiliza) un Payment de tipo SPEI en estado pending
  let payment = await prisma.payment.findFirst({
    where: {
      bookingId,
      paymentMethod: 'spei',
      status:        { in: ['pending', 'processing'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        bookingId,
        paymentMethod: 'spei',
        amount:        booking.totalAmount,
        currency:      'MXN',
        status:        'pending',
      },
    })
  }

  // Referencia numérica de 7 dígitos derivada del bookingRef (SSS-YYYY-NNNN → NNNN)
  const seq       = booking.bookingRef.split('-').pop()
  const reference = seq.padStart(7, '0')

  return {
    paymentId:     payment.id,
    bookingRef:    booking.bookingRef,
    amount:        Number(booking.totalAmount),
    currency:      'MXN',
    bank: {
      name:          SPEI_BANK,
      clabe:         SPEI_CLABE,
      accountHolder: SPEI_ACCOUNT_HOLDER,
      concept:       `${SPEI_CONCEPT} ${booking.bookingRef}`,
      reference,
    },
    instructions: [
      'Abre tu app bancaria y selecciona "Transferencia SPEI".',
      `Ingresa la CLABE: ${SPEI_CLABE}`,
      `Monto exacto: $${Number(booking.totalAmount).toLocaleString('es-MX')} MXN`,
      `Concepto: ${SPEI_CONCEPT} ${booking.bookingRef}`,
      `Referencia: ${reference}`,
      'Una vez realizada la transferencia, sube el comprobante en esta página.',
      'El staff confirmará tu reserva en un máximo de 24 horas.',
    ],
    client: {
      firstName: booking.client.firstName,
      name:      `${booking.client.firstName} ${booking.client.lastName}`,
      email:     booking.client.email,
      phone:     booking.client.phone ?? null,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Upload de comprobante SPEI
// ─────────────────────────────────────────────────────────────

/**
 * Recibe el archivo del comprobante, lo sube a R2 y crea el registro
 * de PaymentProof en estado 'pending' para revisión del staff.
 *
 * @param {string} paymentId   - ID del Payment (tipo SPEI)
 * @param {object} file        - Objeto file de Multer (buffer, originalname, mimetype)
 * @param {string} [bookingId] - Para validación cruzada
 */
async function uploadProof(paymentId, file, bookingId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  })

  if (!payment) throw notFoundError(`Pago ${paymentId} no encontrado`)

  // Validación cruzada opcional
  if (bookingId && payment.bookingId !== bookingId) {
    throw notFoundError('El pago no corresponde a esta reserva')
  }

  const { url } = await uploadFile(file.buffer, file.originalname, file.mimetype, 'proofs')

  const proof = await prisma.paymentProof.create({
    data: {
      paymentId,
      fileUrl:      url,
      fileName:     file.originalname,
      reviewStatus: 'pending',
    },
  })

  // Actualiza el payment a 'processing' para indicar que está en revisión
  await prisma.payment.update({
    where: { id: paymentId },
    data:  { status: 'processing', updatedAt: new Date() },
  })

  return {
    proofId:      proof.id,
    paymentId,
    bookingId:    payment.bookingId,
    reviewStatus: 'pending',
    message:      'Comprobante recibido. El staff lo revisará pronto.',
  }
}

module.exports = { getSpeiInstructions, uploadProof }
