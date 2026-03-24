'use strict'

const prisma = require('../../config/database')
const { notFoundError, conflictError, businessError } = require('../../utils/errors')
const { randomUUID } = require('crypto')
const { FRONTEND_URL } = require('../../config/env')

// ─────────────────────────────────────────────────────────────
// Gestión de comprobantes SPEI
// ─────────────────────────────────────────────────────────────

/**
 * Lista todos los comprobantes SPEI pendientes de revisión.
 * El staff los ve en el panel de administración.
 */
async function getPendingProofs() {
  const proofs = await prisma.paymentProof.findMany({
    where: { reviewStatus: 'pending' },
    include: {
      payment: {
        include: {
          booking: {
            include: {
              client: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
        },
      },
    },
    orderBy: { uploadedAt: 'asc' },   // primero el más antiguo (FIFO)
  })

  return proofs.map(formatProof)
}

/**
 * Aprueba un comprobante SPEI.
 * Transacción atómica:
 *  1. Marca el proof como 'approved'
 *  2. Marca el Payment como 'completed'
 *  3. Confirma la Booking
 *
 * @param {string} proofId
 * @param {string} adminId  - ID del AdminUser que aprueba
 */
async function approveProof(proofId, adminId) {
  const proof = await prisma.paymentProof.findUnique({
    where:   { id: proofId },
    include: {
      payment: {
        include: {
          booking: {
            include: {
              client:          { select: { firstName: true, email: true, phone: true } },
              bookingSessions: { orderBy: { sessionNumber: 'asc' }, take: 1 },
            },
          },
        },
      },
    },
  })

  if (!proof) throw notFoundError(`Comprobante ${proofId} no encontrado`)

  if (proof.reviewStatus !== 'pending') {
    throw conflictError(`El comprobante ya fue ${proof.reviewStatus === 'approved' ? 'aprobado' : 'rechazado'}`)
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentProof.update({
      where: { id: proofId },
      data:  {
        reviewStatus: 'approved',
        reviewedBy:   adminId,
        reviewedAt:   new Date(),
      },
    })

    await tx.payment.update({
      where: { id: proof.paymentId },
      data:  { status: 'completed', updatedAt: new Date() },
    })

    await tx.booking.update({
      where: { id: proof.payment.bookingId },
      data:  { status: 'confirmed' },
    })
  })

  return {
    proofId,
    status:  'approved',
    message: 'Reserva confirmada exitosamente',
    _notify: {
      client:  proof.payment.booking.client,
      booking: {
        bookingRef:  proof.payment.booking.bookingRef,
        classType:   proof.payment.booking.classType,
        totalAmount: Number(proof.payment.booking.totalAmount),
        firstSession: proof.payment.booking.bookingSessions[0] ?? null,
      },
    },
  }
}

/**
 * Rechaza un comprobante SPEI con una nota explicativa.
 * El cliente deberá subir un nuevo comprobante.
 *
 * @param {string} proofId
 * @param {string} adminId
 * @param {string} notes   - Motivo del rechazo (requerido)
 */
async function rejectProof(proofId, adminId, notes) {
  const proof = await prisma.paymentProof.findUnique({
    where:   { id: proofId },
    include: {
      payment: {
        include: {
          booking: {
            include: { client: { select: { firstName: true, email: true, phone: true } } },
          },
        },
      },
    },
  })

  if (!proof) throw notFoundError(`Comprobante ${proofId} no encontrado`)

  if (proof.reviewStatus !== 'pending') {
    throw conflictError(`El comprobante ya fue revisado (${proof.reviewStatus})`)
  }

  await prisma.paymentProof.update({
    where: { id: proofId },
    data:  {
      reviewStatus: 'rejected',
      reviewedBy:   adminId,
      reviewedAt:   new Date(),
      reviewNotes:  notes,
    },
  })

  return {
    proofId,
    status:  'rejected',
    message: 'Comprobante rechazado. El cliente puede subir uno nuevo.',
    _notify: {
      client:  proof.payment.booking.client,
      booking: { bookingRef: proof.payment.booking.bookingRef },
      notes,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Quick Payment Links
// ─────────────────────────────────────────────────────────────

/**
 * Genera un link de pago único para una reserva.
 * El staff lo envía al cliente por WhatsApp para que pague sin crear la reserva
 * desde el portal (ideal para ventas asistidas).
 *
 * @param {string} bookingId
 * @param {number} expiresInHours  - Default 48h
 */
async function createPaymentLink(bookingId, expiresInHours = 48) {
  const booking = await prisma.booking.findUnique({
    where:   { id: bookingId },
    include: { client: { select: { firstName: true, lastName: true, email: true, phone: true } } },
  })

  if (!booking) throw notFoundError(`Reserva ${bookingId} no encontrada`)

  if (booking.status === 'confirmed') {
    throw businessError('Esta reserva ya está confirmada', 'BOOKING_ALREADY_PAID')
  }

  const token     = randomUUID().replace(/-/g, '')   // 32 chars hex sin guiones
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000)

  await prisma.booking.update({
    where: { id: bookingId },
    data:  {
      paymentLinkToken:     token,
      paymentLinkExpiresAt: expiresAt,
    },
  })

  const linkUrl = `${FRONTEND_URL}/pay/${token}`

  return {
    bookingId,
    bookingRef:  booking.bookingRef,
    token,
    linkUrl,
    expiresAt,
    client: {
      name:  `${booking.client.firstName} ${booking.client.lastName}`,
      email: booking.client.email,
      phone: booking.client.phone ?? null,
    },
    totalAmount: Number(booking.totalAmount),
    currency:    'MXN',
  }
}

/**
 * Resuelve un token de link de pago → devuelve la reserva.
 * El frontend usa este endpoint cuando el cliente abre el link.
 *
 * @param {string} token
 */
async function resolvePaymentLink(token) {
  const booking = await prisma.booking.findUnique({
    where:   { paymentLinkToken: token },
    include: {
      client:          { select: { firstName: true, lastName: true, email: true } },
      bookingSessions: { orderBy: { sessionNumber: 'asc' }, take: 1 },
    },
  })

  if (!booking) throw notFoundError('Link de pago no válido o inexistente')

  if (booking.paymentLinkExpiresAt && booking.paymentLinkExpiresAt < new Date()) {
    throw businessError('Este link de pago ha expirado', 'PAYMENT_LINK_EXPIRED', 422)
  }

  if (booking.status === 'confirmed') {
    throw businessError('Esta reserva ya fue pagada', 'BOOKING_ALREADY_PAID', 422)
  }

  return {
    bookingId:      booking.id,
    bookingRef:     booking.bookingRef,
    classType:      booking.classType,
    numLessons:     booking.numLessons,
    numParticipants:booking.numParticipants,
    totalAmount:    Number(booking.totalAmount),
    currency:       'MXN',
    status:         booking.status,
    client: {
      name:  `${booking.client.firstName} ${booking.client.lastName}`,
      email: booking.client.email,
    },
    expiresAt: booking.paymentLinkExpiresAt,
  }
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function formatProof(proof) {
  return {
    proofId:      proof.id,
    fileUrl:      proof.fileUrl,
    fileName:     proof.fileName,
    uploadedAt:   proof.uploadedAt,
    reviewStatus: proof.reviewStatus,
    payment: {
      paymentId: proof.payment.id,
      amount:    Number(proof.payment.amount),
      status:    proof.payment.status,
    },
    booking: {
      bookingId:  proof.payment.booking.id,
      bookingRef: proof.payment.booking.bookingRef,
      classType:  proof.payment.booking.classType,
      totalAmount:Number(proof.payment.booking.totalAmount),
    },
    client: {
      name:  `${proof.payment.booking.client.firstName} ${proof.payment.booking.client.lastName}`,
      email: proof.payment.booking.client.email,
      phone: proof.payment.booking.client.phone,
    },
  }
}

module.exports = {
  getPendingProofs,
  approveProof,
  rejectProof,
  createPaymentLink,
  resolvePaymentLink,
}
