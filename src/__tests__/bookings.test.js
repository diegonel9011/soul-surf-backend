'use strict'

/**
 * Tests de integración para:
 *   POST /api/v1/bookings
 *   GET  /api/v1/bookings/:id
 */

jest.mock('../config/database', () => ({
  availabilitySlot: {
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  priceRule: {
    findMany: jest.fn(),
  },
  client: {
    upsert: jest.fn(),
  },
  booking: {
    create:     jest.fn(),
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
  },
  bookingSession: {
    create: jest.fn(),
  },
  waiver: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
}))

jest.mock('../utils/email', () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendSpeiInstructions:    jest.fn().mockResolvedValue(undefined),
  sendSpeiApproved:        jest.fn().mockResolvedValue(undefined),
  sendSpeiRejected:        jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../utils/whatsapp', () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendSpeiInstructions:    jest.fn().mockResolvedValue(undefined),
  sendSpeiApproved:        jest.fn().mockResolvedValue(undefined),
  sendSpeiRejected:        jest.fn().mockResolvedValue(undefined),
  sendPaymentLink:         jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const app     = require('../app')
const prisma  = require('../config/database')

// ── UUIDs RFC-válidos (grupo 3 en [1-8], grupo 4 empieza con [89ab]) ─
const SLOT_PRIVATE_UUID = '550e8400-e29b-41d4-a716-446655440001'
const SLOT_GROUP_UUID   = '550e8400-e29b-41d4-a716-446655440002'
const INSTRUCTOR_UUID   = '550e8400-e29b-41d4-a716-446655440003'
const CLIENT_UUID       = '550e8400-e29b-41d4-a716-446655440004'
const BOOKING_UUID      = '550e8400-e29b-41d4-a716-446655440005'
const SESSION_UUID      = '550e8400-e29b-41d4-a716-446655440006'

// ── Fixtures ──────────────────────────────────────────────────

const PRIVATE_SLOT = {
  id:           SLOT_PRIVATE_UUID,
  slotDate:     new Date('2026-04-01T00:00:00.000Z'),
  startTime:    new Date('1970-01-01T08:00:00.000Z'),
  classType:    'private',
  instructorId: INSTRUCTOR_UUID,
  maxCapacity:  1,
  bookedCount:  0,
  status:       'available',
}

const GROUP_SLOT = {
  id:           SLOT_GROUP_UUID,
  slotDate:     new Date('2026-04-01T00:00:00.000Z'),
  startTime:    new Date('1970-01-01T08:00:00.000Z'),
  classType:    'group',
  instructorId: INSTRUCTOR_UUID,
  maxCapacity:  4,
  bookedCount:  0,
  status:       'available',
}

const PRICE_RULES = [
  { id: 1, classType: 'private', minLessons: 1, maxLessons: 2,    pricePerLesson: 1300, active: true },
  { id: 2, classType: 'private', minLessons: 3, maxLessons: 3,    pricePerLesson: 1200, active: true },
  { id: 3, classType: 'private', minLessons: 4, maxLessons: 4,    pricePerLesson: 1150, active: true },
  { id: 4, classType: 'private', minLessons: 5, maxLessons: 5,    pricePerLesson: 1100, active: true },
  { id: 5, classType: 'private', minLessons: 6, maxLessons: null, pricePerLesson: 1050, active: true },
  { id: 6, classType: 'group',   minLessons: 1, maxLessons: null, pricePerLesson: 1000, active: true },
]

const VALID_BOOKING_BODY = {
  class_type:      'private',
  num_lessons:     4,
  num_participants: 1,
  slot_id:         SLOT_PRIVATE_UUID,
  client: {
    first_name: 'Carlos',
    last_name:  'Ramírez',
    email:      'carlos@test.com',
    surf_level: 'beginner',
    lycra_size: 'M',
  },
  waiver: {
    full_name: 'Carlos Ramírez',
    accepted:  true,
  },
}

// ── Mock de $transaction: ejecuta el callback con el mismo mock ─
function setupTransactionMock() {
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma))
}

beforeEach(() => {
  setupTransactionMock()

  prisma.priceRule.findMany.mockImplementation(({ where }) =>
    Promise.resolve(
      PRICE_RULES.filter((r) => r.classType === where.classType && r.active === true)
    )
  )

  // Sin booking previo → primera ref = SSS-2026-0001
  prisma.booking.findFirst.mockResolvedValue(null)

  prisma.client.upsert.mockResolvedValue({
    id:        CLIENT_UUID,
    firstName: 'Carlos',
    lastName:  'Ramírez',
    email:     'carlos@test.com',
  })

  prisma.booking.create.mockImplementation((args) =>
    Promise.resolve({
      id:               BOOKING_UUID,
      bookingRef:       args.data.bookingRef,
      clientId:         CLIENT_UUID,
      classType:        args.data.classType,
      numLessons:       args.data.numLessons,
      lessonsRemaining: args.data.lessonsRemaining,
      numParticipants:  args.data.numParticipants,
      pricePerLesson:   args.data.pricePerLesson,
      totalAmount:      args.data.totalAmount,
      status:           'pending_payment',
      waiverSigned:     true,
      waiverSignedAt:   new Date(),
      createdAt:        new Date(),
      updatedAt:        new Date(),
    })
  )

  prisma.bookingSession.create.mockResolvedValue({
    id:            SESSION_UUID,
    bookingId:     BOOKING_UUID,
    slotId:        SLOT_PRIVATE_UUID,
    sessionDate:   new Date('2026-04-01T00:00:00.000Z'),
    startTime:     new Date('1970-01-01T08:00:00.000Z'),
    instructorId:  INSTRUCTOR_UUID,
    sessionNumber: 1,
    status:        'scheduled',
  })

  prisma.availabilitySlot.update.mockResolvedValue({})
  prisma.waiver.create.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440007' })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/bookings
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/bookings', () => {

  describe('Reserva privada exitosa', () => {
    beforeEach(() => {
      prisma.availabilitySlot.findUnique.mockResolvedValue(PRIVATE_SLOT)
    })

    test('Devuelve 201 con estructura correcta', async () => {
      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(res.status).toBe(201)
      expect(res.body.ok).toBe(true)
      expect(res.body.data).toMatchObject({
        bookingRef:  'SSS-2026-0001',
        classType:   'private',
        numLessons:  4,
        totalAmount: 4600,
        currency:    'MXN',
        status:      'pending_payment',
        nextStep:    'payment',
      })
    })

    test('lessonsRemaining = numLessons - 1 (sistema de créditos)', async () => {
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      const createCall = prisma.booking.create.mock.calls[0][0]
      expect(createCall.data.lessonsRemaining).toBe(3)  // 4 - 1
    })

    test('lessonsRemaining = 0 al comprar 1 sola lección', async () => {
      await request(app)
        .post('/api/v1/bookings')
        .send({ ...VALID_BOOKING_BODY, num_lessons: 1 })

      const createCall = prisma.booking.create.mock.calls[0][0]
      expect(createCall.data.lessonsRemaining).toBe(0)
    })

    test('Precio se bloquea al momento de la cotización', async () => {
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      const createCall = prisma.booking.create.mock.calls[0][0]
      expect(Number(createCall.data.pricePerLesson)).toBe(1150)
      expect(Number(createCall.data.totalAmount)).toBe(4600)
    })

    test('Se crea booking_session con sessionNumber=1', async () => {
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      const sessionCall = prisma.bookingSession.create.mock.calls[0][0]
      expect(sessionCall.data.sessionNumber).toBe(1)
      expect(sessionCall.data.slotId).toBe(SLOT_PRIVATE_UUID)
    })

    test('bookedCount del slot se incrementa en 1 (privada)', async () => {
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      const updateCall = prisma.availabilitySlot.update.mock.calls[0][0]
      expect(updateCall.data.bookedCount).toBe(1)   // 0 + 1
    })

    test('Slot privado lleno → status="full" después de la reserva', async () => {
      // Capacidad=1, bookedCount=0 → al agregar 1 queda lleno
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      const updateCall = prisma.availabilitySlot.update.mock.calls[0][0]
      expect(updateCall.data.status).toBe('full')
    })

    test('Se crea el waiver al aceptar los términos', async () => {
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)
      expect(prisma.waiver.create).toHaveBeenCalledTimes(1)
    })

    test('bookingRef tiene formato SSS-YYYY-XXXX', async () => {
      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)
      expect(res.body.data.bookingRef).toMatch(/^SSS-\d{4}-\d{4}$/)
    })

    test('Segunda reserva incrementa el número de secuencia', async () => {
      prisma.booking.findFirst.mockResolvedValue({ bookingRef: 'SSS-2026-0001' })

      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      const createCall = prisma.booking.create.mock.calls[0][0]
      expect(createCall.data.bookingRef).toBe('SSS-2026-0002')
    })

    test('Client upsert: mismo email actualiza, no duplica', async () => {
      await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(prisma.client.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'carlos@test.com' } })
      )
    })

    test('La respuesta incluye datos de la primera sesión', async () => {
      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(res.body.data.firstSession).toMatchObject({
        sessionDate: '2026-04-01',
        startTime:   '08:00',
        endTime:     '10:00',
      })
    })
  })

  describe('Reserva grupal', () => {
    beforeEach(() => {
      prisma.availabilitySlot.findUnique.mockResolvedValue(GROUP_SLOT)
      prisma.bookingSession.create.mockResolvedValue({
        id:            SESSION_UUID,
        bookingId:     BOOKING_UUID,
        slotId:        SLOT_GROUP_UUID,
        sessionDate:   new Date('2026-04-01T00:00:00.000Z'),
        startTime:     new Date('1970-01-01T08:00:00.000Z'),
        instructorId:  INSTRUCTOR_UUID,
        sessionNumber: 1,
        status:        'scheduled',
      })
    })

    const GROUP_BODY = {
      ...VALID_BOOKING_BODY,
      class_type:      'group',
      num_participants: 2,
      slot_id:         SLOT_GROUP_UUID,
    }

    test('2 participantes → bookedCount incrementa en 2', async () => {
      await request(app).post('/api/v1/bookings').send(GROUP_BODY)

      const updateCall = prisma.availabilitySlot.update.mock.calls[0][0]
      expect(updateCall.data.bookedCount).toBe(2)
    })

    test('4 participantes en slot con cap=4 → slot queda "full"', async () => {
      await request(app)
        .post('/api/v1/bookings')
        .send({ ...GROUP_BODY, num_participants: 4 })

      const updateCall = prisma.availabilitySlot.update.mock.calls[0][0]
      expect(updateCall.data.status).toBe('full')
    })

    test('2 ocupados + 3 nuevos (total 5 > cap 4) → 409 CONFLICT', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        ...GROUP_SLOT, bookedCount: 2,
      })

      const res = await request(app)
        .post('/api/v1/bookings')
        .send({ ...GROUP_BODY, num_participants: 3 })

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('CONFLICT')
    })

    test('Grupal: numParticipants se guarda en la reserva', async () => {
      await request(app).post('/api/v1/bookings').send(GROUP_BODY)

      const createCall = prisma.booking.create.mock.calls[0][0]
      expect(createCall.data.numParticipants).toBe(2)
    })
  })

  describe('Errores de validación (400)', () => {
    test('Falta slot_id → 400', async () => {
      const body = { ...VALID_BOOKING_BODY }
      delete body.slot_id

      const res = await request(app).post('/api/v1/bookings').send(body)
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('VALIDATION_ERROR')
    })

    test('slot_id no es UUID válido → 400', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({ ...VALID_BOOKING_BODY, slot_id: 'no-es-uuid' })

      expect(res.status).toBe(400)
    })

    test('Email inválido → 400', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({
          ...VALID_BOOKING_BODY,
          client: { ...VALID_BOOKING_BODY.client, email: 'no-es-email' },
        })

      expect(res.status).toBe(400)
    })

    test('waiver.accepted=false → 400', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({
          ...VALID_BOOKING_BODY,
          waiver: { full_name: 'Carlos Ramírez', accepted: false },
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('VALIDATION_ERROR')
    })

    test('Falta waiver completo → 400', async () => {
      const body = { ...VALID_BOOKING_BODY }
      delete body.waiver

      const res = await request(app).post('/api/v1/bookings').send(body)
      expect(res.status).toBe(400)
    })

    test('num_lessons = 0 → 400', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({ ...VALID_BOOKING_BODY, num_lessons: 0 })

      expect(res.status).toBe(400)
    })
  })

  describe('Errores de negocio', () => {
    test('Slot inexistente → 404', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue(null)

      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('NOT_FOUND')
    })

    test('Slot bloqueado → 422 SLOT_BLOCKED', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        ...PRIVATE_SLOT, status: 'blocked',
      })

      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(res.status).toBe(422)
      expect(res.body.error).toBe('SLOT_BLOCKED')
    })

    test('classType no coincide con slot → 422 CLASS_TYPE_MISMATCH', async () => {
      // Pedimos 'private' pero el slot es 'group'
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        ...GROUP_SLOT, id: SLOT_PRIVATE_UUID,
      })

      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(res.status).toBe(422)
      expect(res.body.error).toBe('CLASS_TYPE_MISMATCH')
    })

    test('Slot privado ya lleno → 409 CONFLICT', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        ...PRIVATE_SLOT, bookedCount: 1, status: 'full',
      })

      const res = await request(app).post('/api/v1/bookings').send(VALID_BOOKING_BODY)

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('CONFLICT')
    })
  })
})

// ─────────────────────────────────────────────────────────────
// GET /api/v1/bookings/:id
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/bookings/:id', () => {
  const MOCK_BOOKING_FULL = {
    id:               BOOKING_UUID,
    bookingRef:       'SSS-2026-0001',
    classType:        'private',
    numLessons:       4,
    lessonsRemaining: 3,
    numParticipants:  1,
    pricePerLesson:   1150,
    totalAmount:      4600,
    status:           'pending_payment',
    waiverSigned:     true,
    waiverSignedAt:   new Date(),
    createdAt:        new Date(),
    client: {
      id: CLIENT_UUID, firstName: 'Carlos',
      lastName: 'Ramírez', email: 'carlos@test.com', phone: null,
    },
    bookingSessions: [{
      id:            SESSION_UUID,
      sessionNumber: 1,
      sessionDate:   new Date('2026-04-01T00:00:00.000Z'),
      startTime:     new Date('1970-01-01T08:00:00.000Z'),
      status:        'scheduled',
      instructor:    { id: INSTRUCTOR_UUID, name: 'Juan Instructor' },
    }],
    payments: [],
  }

  test('Booking existente → 200 con datos completos', async () => {
    prisma.booking.findUnique.mockResolvedValue(MOCK_BOOKING_FULL)

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_UUID}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toMatchObject({
      bookingRef:       'SSS-2026-0001',
      classType:        'private',
      numLessons:       4,
      lessonsRemaining: 3,
      totalAmount:      4600,
    })
  })

  test('Sesiones con horas formateadas como "HH:MM"', async () => {
    prisma.booking.findUnique.mockResolvedValue(MOCK_BOOKING_FULL)

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_UUID}`)

    const session = res.body.data.sessions[0]
    expect(session.startTime).toBe('08:00')
    expect(session.endTime).toBe('10:00')
    expect(session.sessionDate).toBe('2026-04-01')
  })

  test('Booking inexistente → 404', async () => {
    prisma.booking.findUnique.mockResolvedValue(null)

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_UUID}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('NOT_FOUND')
  })
})
