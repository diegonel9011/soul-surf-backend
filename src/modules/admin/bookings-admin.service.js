'use strict'

const prisma = require('../../config/database')

/**
 * Lista todas las reservas con datos del cliente, sesión y pago.
 * Soporta filtros opcionales: status, classType, search (nombre/email/ref).
 */
async function listBookings({ status, classType, search, page = 1, limit = 20 } = {}) {
  const where = {}

  if (status)    where.status    = status
  if (classType) where.classType = classType
  if (search) {
    where.OR = [
      { bookingRef:  { contains: search, mode: 'insensitive' } },
      { client: { email:     { contains: search, mode: 'insensitive' } } },
      { client: { firstName: { contains: search, mode: 'insensitive' } } },
      { client: { lastName:  { contains: search, mode: 'insensitive' } } },
    ]
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        bookingSessions: {
          orderBy: { sessionNumber: 'asc' },
          take: 1,
          select: { sessionDate: true, startTime: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, paymentMethod: true, amount: true },
        },
      },
    }),
    prisma.booking.count({ where }),
  ])

  return {
    bookings: bookings.map(formatBooking),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

function formatBooking(b) {
  const session = b.bookingSessions[0]
  const payment = b.payments[0]
  return {
    id:          b.id,
    bookingRef:  b.bookingRef,
    status:      b.status,
    classType:   b.classType,
    numLessons:  b.numLessons,
    numParticipants: b.numParticipants,
    totalAmount: Number(b.totalAmount),
    currency:    b.currency,
    createdAt:   b.createdAt,
    client: {
      id:        b.client.id,
      firstName: b.client.firstName,
      lastName:  b.client.lastName,
      email:     b.client.email,
      phone:     b.client.phone ?? null,
    },
    firstSession: session ? {
      date:      session.sessionDate,
      startTime: session.startTime,
    } : null,
    payment: payment ? {
      id:            payment.id,
      status:        payment.status,
      paymentMethod: payment.paymentMethod,
      amount:        Number(payment.amount),
    } : null,
  }
}

module.exports = { listBookings }
