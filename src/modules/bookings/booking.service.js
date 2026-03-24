'use strict'

const prisma                  = require('../../config/database')
const { calculateQuote }      = require('../../utils/pricing')
const { generateBookingRef }  = require('../../utils/booking-ref')
const { formatTime, formatDate } = require('../../utils/time')
const { notFoundError, conflictError, businessError } = require('../../utils/errors')

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Formatea un booking completo para la respuesta de la API.
 */
function formatBooking(booking, firstSession) {
  return {
    bookingId:        booking.id,
    bookingRef:       booking.bookingRef,
    status:           booking.status,
    classType:        booking.classType,
    numLessons:       booking.numLessons,
    lessonsRemaining: booking.lessonsRemaining,
    numParticipants:  booking.numParticipants,
    pricePerLesson:   Number(booking.pricePerLesson),
    totalAmount:      Number(booking.totalAmount),
    currency:         'MXN',
    waiverSigned:     booking.waiverSigned,
    createdAt:        booking.createdAt,
    firstSession: firstSession ? {
      sessionId:    firstSession.id,
      sessionDate:  formatDate(firstSession.sessionDate),
      startTime:    formatTime(firstSession.startTime),
      endTime:      formatEndTime(firstSession.startTime),
      instructorId: firstSession.instructorId ?? null,
    } : null,
    nextStep: 'payment',  // indica al frontend que debe redirigir al flujo de pago
  }
}

/** Calcula la hora de fin sumando 2 horas a un campo @db.Time */
function formatEndTime(startTimeVal) {
  const d = new Date(startTimeVal)
  d.setUTCHours(d.getUTCHours() + 2)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// ─────────────────────────────────────────────────────────────
// Operaciones de servicio
// ─────────────────────────────────────────────────────────────

/**
 * Crea una reserva completa en una transacción atómica.
 *
 * Pasos internos:
 *  1. Validar que el slot existe y tiene cupo suficiente
 *  2. Calcular el precio según las price_rules vigentes
 *  3. TRANSACCIÓN:
 *     a. Upsert del cliente (mismo email → actualiza, no duplica)
 *     b. Generar bookingRef único (SSS-YYYY-XXXX)
 *     c. Crear booking con lessonsRemaining = numLessons - 1
 *     d. Crear booking_session para la primera clase (sessionNumber=1)
 *     e. Incrementar slot.bookedCount + auto-marcar 'full' si se llenó
 *     f. Crear waiver con la aceptación del cliente
 *
 * @param {object} data  Validado por CreateBookingSchema
 */
async function createBooking(data) {
  const {
    class_type,
    num_lessons,
    num_participants,
    slot_id,
    client: clientData,
    waiver: waiverData,
  } = data

  // ── 1. Validar slot ─────────────────────────────────────────
  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slot_id },
  })

  if (!slot) {
    throw notFoundError(`El slot ${slot_id} no existe`)
  }

  if (slot.status === 'blocked') {
    throw businessError('Este horario está bloqueado y no acepta reservas', 'SLOT_BLOCKED')
  }

  if (slot.classType !== class_type) {
    throw businessError(
      `El slot es de tipo '${slot.classType}' pero se solicitó '${class_type}'`,
      'CLASS_TYPE_MISMATCH'
    )
  }

  // Para privadas siempre se ocupa 1 lugar; para grupales, uno por participante
  const spotsNeeded = class_type === 'group' ? num_participants : 1

  if (slot.bookedCount + spotsNeeded > slot.maxCapacity) {
    throw conflictError(
      `Sin cupo disponible. Quedan ${slot.maxCapacity - slot.bookedCount} lugar(es) en este horario`
    )
  }

  // ── 2. Calcular precio (valida que exista regla de precio) ──
  const quote = await calculateQuote(class_type, num_lessons, num_participants)

  // ── 3. Transacción atómica ──────────────────────────────────
  const result = await prisma.$transaction(async (tx) => {

    // 3a. Upsert del cliente
    const dbClient = await tx.client.upsert({
      where:  { email: clientData.email },
      update: {
        phone:     clientData.phone     ?? undefined,
        surfLevel: clientData.surf_level,
        lycraSize: clientData.lycra_size ?? undefined,
      },
      create: {
        firstName: clientData.first_name,
        lastName:  clientData.last_name,
        email:     clientData.email,
        phone:     clientData.phone     ?? null,
        surfLevel: clientData.surf_level,
        lycraSize: clientData.lycra_size ?? null,
      },
    })

    // 3b. Generar referencia única
    const bookingRef = await generateBookingRef(tx)

    // 3c. Crear booking
    // lessonsRemaining = numLessons - 1 porque la primera sesión ya se agenda aquí
    const booking = await tx.booking.create({
      data: {
        bookingRef,
        clientId:        dbClient.id,
        classType:       class_type,
        numLessons:      num_lessons,
        lessonsRemaining: num_lessons - 1,
        numParticipants: quote.numParticipants,
        pricePerLesson:  quote.pricePerLesson,
        totalAmount:     quote.total,
        status:          'pending_payment',
        waiverSigned:    true,
        waiverSignedAt:  new Date(),
      },
    })

    // 3d. Crear la primera sesión (sessionNumber=1)
    const firstSession = await tx.bookingSession.create({
      data: {
        bookingId:     booking.id,
        slotId:        slot.id,
        sessionDate:   slot.slotDate,
        startTime:     slot.startTime,
        instructorId:  slot.instructorId ?? null,
        sessionNumber: 1,
        status:        'scheduled',
      },
    })

    // 3e. Actualizar conteo del slot y marcar 'full' si se llenó
    const newBookedCount = slot.bookedCount + spotsNeeded
    const newSlotStatus  = newBookedCount >= slot.maxCapacity ? 'full' : 'available'

    await tx.availabilitySlot.update({
      where: { id: slot.id },
      data:  { bookedCount: newBookedCount, status: newSlotStatus },
    })

    // 3f. Crear waiver con metadata de auditoría
    await tx.waiver.create({
      data: {
        bookingId:    booking.id,
        clientId:     dbClient.id,
        fullName:     waiverData.full_name,
        ipAddress:    null,   // se rellenará en el controller con req.ip
        userAgent:    null,   // se rellenará en el controller con req.headers['user-agent']
        acceptedAt:   new Date(),
      },
    })

    return { booking, firstSession, client: dbClient }
  })

  return formatBooking(result.booking, result.firstSession)
}

/**
 * Obtiene una reserva por su ID (para la página de confirmación).
 * Incluye las sesiones agendadas y el estado del pago.
 *
 * @param {string} bookingId UUID
 */
async function getBookingById(bookingId) {
  const booking = await prisma.booking.findUnique({
    where:   { id: bookingId },
    include: {
      client:          { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      bookingSessions: {
        include: { instructor: { select: { id: true, name: true } } },
        orderBy: { sessionNumber: 'asc' },
      },
      payments: {
        select: { id: true, paymentMethod: true, amount: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!booking) throw notFoundError(`Reserva ${bookingId} no encontrada`)

  return {
    bookingId:        booking.id,
    bookingRef:       booking.bookingRef,
    status:           booking.status,
    classType:        booking.classType,
    numLessons:       booking.numLessons,
    lessonsRemaining: booking.lessonsRemaining,
    numParticipants:  booking.numParticipants,
    pricePerLesson:   Number(booking.pricePerLesson),
    totalAmount:      Number(booking.totalAmount),
    currency:         'MXN',
    waiverSigned:     booking.waiverSigned,
    createdAt:        booking.createdAt,
    client: {
      id:        booking.client.id,
      firstName: booking.client.firstName,
      lastName:  booking.client.lastName,
      email:     booking.client.email,
      phone:     booking.client.phone,
    },
    sessions: booking.bookingSessions.map((s) => ({
      sessionId:     s.id,
      sessionNumber: s.sessionNumber,
      sessionDate:   formatDate(s.sessionDate),
      startTime:     formatTime(s.startTime),
      endTime:       formatEndTime(s.startTime),
      status:        s.status,
      instructor:    s.instructor ? { id: s.instructor.id, name: s.instructor.name } : null,
    })),
    payments: booking.payments.map((p) => ({
      paymentId:     p.id,
      paymentMethod: p.paymentMethod,
      amount:        Number(p.amount),
      status:        p.status,
      createdAt:     p.createdAt,
    })),
  }
}

module.exports = { createBooking, getBookingById }
