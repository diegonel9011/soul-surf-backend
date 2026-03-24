'use strict'

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const app     = require('../app')

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../config/database', () => ({
  booking:      { findUnique: jest.fn(), update: jest.fn() },
  payment:      { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  paymentProof: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  priceRule:    { findMany: jest.fn() },
  $transaction: jest.fn(),
}))

// mercadopago is not used in admin routes but is imported transitively via app.js
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Preference:        jest.fn(),
  Payment:           jest.fn(),
}))

jest.mock('../utils/storage', () => ({
  uploadFile: jest.fn(),
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

const prisma = require('../config/database')

// ── JWT helper ────────────────────────────────────────────────
// JWT_SECRET default del test (env.js usa process.env o default)
const TEST_SECRET = process.env.JWT_SECRET ?? 'dev_secret_change_in_production'

function makeToken(payload = {}) {
  return jwt.sign(
    { id: ADMIN_ID, email: 'admin@test.com', role: 'admin', ...payload },
    TEST_SECRET,
    { expiresIn: '1h' }
  )
}

// ── UUIDs válidos RFC-4122 ────────────────────────────────────
const ADMIN_ID   = '550e8400-e29b-41d4-a716-446655440020'
const BOOKING_ID = '550e8400-e29b-41d4-a716-446655440021'
const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440022'
const PROOF_ID   = '550e8400-e29b-41d4-a716-446655440023'

const sampleProof = {
  id:           PROOF_ID,
  fileUrl:      'https://r2.example.com/proofs/comp.jpg',
  fileName:     'comp.jpg',
  uploadedAt:   new Date('2026-03-01T10:00:00Z'),
  reviewStatus: 'pending',
  payment: {
    id:      PAYMENT_ID,
    amount:  1300,
    status:  'processing',
    booking: {
      id:          BOOKING_ID,
      bookingRef:  'SSS-2026-0001',
      classType:   'private',
      totalAmount: 1300,
      client: {
        firstName: 'Ana',
        lastName:  'García',
        email:     'ana@test.com',
        phone:     '+52 954 100 0000',
      },
    },
  },
}

// ─────────────────────────────────────────────────────────────
// Autenticación — rutas protegidas
// ─────────────────────────────────────────────────────────────

describe('Protección de rutas de admin', () => {
  it('401 sin token en GET /admin/payments/spei/pending', async () => {
    const res = await request(app).get('/api/v1/admin/payments/spei/pending')
    expect(res.status).toBe(401)
  })

  it('401 con token inválido', async () => {
    const res = await request(app)
      .get('/api/v1/admin/payments/spei/pending')
      .set('Authorization', 'Bearer token_invalido')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────
// GET /api/v1/admin/payments/spei/pending
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/payments/spei/pending', () => {
  const url   = '/api/v1/admin/payments/spei/pending'
  let token

  beforeEach(() => {
    jest.clearAllMocks()
    token = makeToken()
  })

  it('devuelve lista de comprobantes pendientes', async () => {
    prisma.paymentProof.findMany.mockResolvedValue([sampleProof])

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0]).toMatchObject({
      proofId:      PROOF_ID,
      reviewStatus: 'pending',
      client: {
        email: 'ana@test.com',
      },
    })
  })

  it('devuelve array vacío si no hay pendientes', async () => {
    prisma.paymentProof.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/payments/spei/:proofId/approve
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/payments/spei/:proofId/approve', () => {
  let token

  beforeEach(() => {
    jest.clearAllMocks()
    token = makeToken()
  })

  it('aprueba el comprobante y confirma la reserva', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue({
      id:           PROOF_ID,
      reviewStatus: 'pending',
      paymentId:    PAYMENT_ID,
      payment: {
        bookingId: BOOKING_ID,
        booking: {
          bookingRef:      'SSS-2026-0001',
          classType:       'private',
          totalAmount:     2600,
          client:          { firstName: 'Ana', email: 'ana@test.com', phone: null },
          bookingSessions: [],
        },
      },
    })
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma))
    prisma.paymentProof.update.mockResolvedValue({})
    prisma.payment.update.mockResolvedValue({})
    prisma.booking.update.mockResolvedValue({})

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/approve`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ proofId: PROOF_ID, status: 'approved' })
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'confirmed' } })
    )
  })

  it('409 si el comprobante ya fue aprobado', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue({
      id:           PROOF_ID,
      reviewStatus: 'approved',
      paymentId:    PAYMENT_ID,
      payment: {
        bookingId: BOOKING_ID,
        booking: {
          bookingRef: 'SSS-2026-0001',
          client: { firstName: 'Ana', email: 'ana@test.com', phone: null },
        },
      },
    })

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/approve`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
  })

  it('409 si el comprobante ya fue rechazado', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue({
      id:           PROOF_ID,
      reviewStatus: 'rejected',
      paymentId:    PAYMENT_ID,
      payment: {
        bookingId: BOOKING_ID,
        booking: {
          bookingRef: 'SSS-2026-0001',
          client: { firstName: 'Ana', email: 'ana@test.com', phone: null },
        },
      },
    })

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/approve`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
  })

  it('404 si el comprobante no existe', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/approve`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/payments/spei/:proofId/reject
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/payments/spei/:proofId/reject', () => {
  let token

  beforeEach(() => {
    jest.clearAllMocks()
    token = makeToken()
  })

  it('rechaza el comprobante con una nota', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue({
      id:           PROOF_ID,
      reviewStatus: 'pending',
      payment: {
        bookingId: BOOKING_ID,
        booking: {
          bookingRef: 'SSS-2026-0001',
          client: { firstName: 'Ana', email: 'ana@test.com', phone: null },
        },
      },
    })
    prisma.paymentProof.update.mockResolvedValue({})

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'El monto no coincide con la reserva' })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ proofId: PROOF_ID, status: 'rejected' })
    expect(prisma.paymentProof.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: 'rejected',
          reviewNotes:  'El monto no coincide con la reserva',
        }),
      })
    )
  })

  it('400 si falta el campo notes', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_NOTES')
  })

  it('400 si notes es un string vacío', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_NOTES')
  })

  it('409 si el comprobante ya fue revisado', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue({
      id:           PROOF_ID,
      reviewStatus: 'approved',
      payment: {
        bookingId: BOOKING_ID,
        booking: {
          bookingRef: 'SSS-2026-0001',
          client: { firstName: 'Ana', email: 'ana@test.com', phone: null },
        },
      },
    })

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Motivo' })

    expect(res.status).toBe(409)
  })

  it('404 si el comprobante no existe', async () => {
    prisma.paymentProof.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/v1/admin/payments/spei/${PROOF_ID}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Motivo' })

    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/bookings/:bookingId/payment-link
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/bookings/:bookingId/payment-link', () => {
  const url   = `/api/v1/admin/bookings/${BOOKING_ID}/payment-link`
  let token

  const sampleBooking = {
    id:          BOOKING_ID,
    bookingRef:  'SSS-2026-0001',
    totalAmount: 1300,
    status:      'pending',
    client: {
      firstName: 'Ana',
      lastName:  'García',
      email:     'ana@test.com',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    token = makeToken()
  })

  it('genera un link de pago con token y expiración', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)
    prisma.booking.update.mockResolvedValue({})

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      bookingId:  BOOKING_ID,
      bookingRef: 'SSS-2026-0001',
      currency:   'MXN',
    })
    expect(res.body.data.token).toHaveLength(32)
    expect(res.body.data.linkUrl).toContain(res.body.data.token)
    expect(res.body.data.expiresAt).toBeTruthy()
  })

  it('respeta expires_in_hours custom', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)
    prisma.booking.update.mockResolvedValue({})

    const before = Date.now()
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ expires_in_hours: 24 })

    expect(res.status).toBe(201)
    const expiresAt = new Date(res.body.data.expiresAt).getTime()
    const expected  = before + 24 * 3600 * 1000
    // Tolerancia de 5 segundos
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5000)
  })

  it('422 si la reserva ya está confirmada', async () => {
    prisma.booking.findUnique.mockResolvedValue({ ...sampleBooking, status: 'confirmed' })

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('BOOKING_ALREADY_PAID')
  })

  it('404 si la reserva no existe', async () => {
    prisma.booking.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────
// GET /api/v1/pay/:token  (ruta pública)
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/pay/:token', () => {
  const TOKEN = 'abcdef1234567890abcdef1234567890'  // 32 chars hex

  const sampleBookingWithToken = {
    id:                   BOOKING_ID,
    bookingRef:           'SSS-2026-0001',
    classType:            'private',
    numLessons:           1,
    numParticipants:      1,
    totalAmount:          1300,
    status:               'pending',
    paymentLinkToken:     TOKEN,
    paymentLinkExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),  // futuro
    client: {
      firstName: 'Ana',
      lastName:  'García',
      email:     'ana@test.com',
    },
    bookingSessions: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('devuelve los datos de la reserva con token válido', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBookingWithToken)

    const res = await request(app).get(`/api/v1/pay/${TOKEN}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      bookingId:   BOOKING_ID,
      bookingRef:  'SSS-2026-0001',
      classType:   'private',
      totalAmount: 1300,
      currency:    'MXN',
    })
  })

  it('404 si el token no existe', async () => {
    prisma.booking.findUnique.mockResolvedValue(null)
    const res = await request(app).get(`/api/v1/pay/${TOKEN}`)
    expect(res.status).toBe(404)
  })

  it('422 si el link ha expirado', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      ...sampleBookingWithToken,
      paymentLinkExpiresAt: new Date(Date.now() - 1000),  // pasado
    })

    const res = await request(app).get(`/api/v1/pay/${TOKEN}`)
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('PAYMENT_LINK_EXPIRED')
  })

  it('422 si la reserva ya fue pagada', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      ...sampleBookingWithToken,
      status: 'confirmed',
    })

    const res = await request(app).get(`/api/v1/pay/${TOKEN}`)
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('BOOKING_ALREADY_PAID')
  })

  it('no requiere autenticación', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBookingWithToken)

    // Sin header Authorization
    const res = await request(app).get(`/api/v1/pay/${TOKEN}`)
    expect(res.status).toBe(200)
  })
})
