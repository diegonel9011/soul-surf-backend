'use strict'

const request = require('supertest')
const app     = require('../app')

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../config/database', () => ({
  booking:      { findUnique: jest.fn(), update: jest.fn() },
  payment:      { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  paymentProof: { create: jest.fn() },
  priceRule:    { findMany: jest.fn() },
  $transaction: jest.fn(),
}))

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

const prisma               = require('../config/database')
const { Preference, Payment: MpPayment } = require('mercadopago')
const { uploadFile }       = require('../utils/storage')

// UUIDs válidos RFC-4122
const BOOKING_ID  = '550e8400-e29b-41d4-a716-446655440010'
const PAYMENT_ID  = '550e8400-e29b-41d4-a716-446655440011'
const PROOF_ID    = '550e8400-e29b-41d4-a716-446655440012'
const CLIENT_ID   = '550e8400-e29b-41d4-a716-446655440013'

const sampleBooking = {
  id:              BOOKING_ID,
  bookingRef:      'SSS-2026-0001',
  classType:       'private',
  numLessons:      2,
  numParticipants: 1,
  totalAmount:     2600,
  status:          'pending',
  client: {
    id:        CLIENT_ID,
    firstName: 'Ana',
    lastName:  'García',
    email:     'ana@test.com',
  },
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/payments/mercadopago/preference
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/payments/mercadopago/preference', () => {
  const url = '/api/v1/payments/mercadopago/preference'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('crea una preferencia nueva y devuelve checkoutUrl', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)
    prisma.payment.findFirst.mockResolvedValue(null)
    prisma.payment.create.mockResolvedValue({ id: PAYMENT_ID, mpPreferenceId: 'pref_123' })

    const mpInstance = {
      create: jest.fn().mockResolvedValue({
        id:                   'pref_123',
        init_point:           'https://mp.com/checkout/pref_123',
        sandbox_init_point:   'https://sandbox.mp.com/checkout/pref_123',
      }),
    }
    Preference.mockImplementation(() => mpInstance)

    const res = await request(app)
      .post(url)
      .send({ booking_id: BOOKING_ID })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      preferenceId: 'pref_123',
      checkoutUrl:  expect.stringContaining('pref_123'),
      sandboxUrl:   expect.stringContaining('pref_123'),
      paymentId:    PAYMENT_ID,
    })
  })

  it('reutiliza preferencia existente si ya hay un pago pendiente', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)
    prisma.payment.findFirst.mockResolvedValue({
      id:            PAYMENT_ID,
      mpPreferenceId: 'pref_existing',
      status:         'pending',
    })

    const res = await request(app)
      .post(url)
      .send({ booking_id: BOOKING_ID })

    expect(res.status).toBe(201)
    expect(res.body.data.preferenceId).toBe('pref_existing')
    expect(Preference).not.toHaveBeenCalled()
  })

  it('400 si falta booking_id', async () => {
    const res = await request(app).post(url).send({})
    expect(res.status).toBe(400)
  })

  it('400 si booking_id no es UUID válido', async () => {
    const res = await request(app).post(url).send({ booking_id: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })

  it('404 si la reserva no existe', async () => {
    prisma.booking.findUnique.mockResolvedValue(null)
    const res = await request(app).post(url).send({ booking_id: BOOKING_ID })
    expect(res.status).toBe(404)
  })

  it('422 si la reserva ya está confirmada', async () => {
    prisma.booking.findUnique.mockResolvedValue({ ...sampleBooking, status: 'confirmed' })
    const res = await request(app).post(url).send({ booking_id: BOOKING_ID })
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('BOOKING_ALREADY_PAID')
  })

  it('422 si la reserva fue cancelada', async () => {
    prisma.booking.findUnique.mockResolvedValue({ ...sampleBooking, status: 'cancelled' })
    const res = await request(app).post(url).send({ booking_id: BOOKING_ID })
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('BOOKING_CANCELLED')
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/payments/mercadopago/webhook
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/payments/mercadopago/webhook', () => {
  const url = '/api/v1/payments/mercadopago/webhook'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('procesa un pago aprobado y confirma la reserva', async () => {
    const mpPaymentInstance = {
      get: jest.fn().mockResolvedValue({
        id:                 'mp_pay_99',
        status:             'approved',
        status_detail:      'accredited',
        transaction_amount: 2600,
        external_reference: BOOKING_ID,
        order:              { id: 'order_1' },
      }),
    }
    MpPayment.mockImplementation(() => mpPaymentInstance)

    const existingPayment = { id: PAYMENT_ID, status: 'pending' }
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma))
    prisma.payment.findFirst.mockResolvedValue(existingPayment)
    prisma.payment.update.mockResolvedValue({})
    prisma.booking.update.mockResolvedValue({})

    const res = await request(app)
      .post(url)
      .send({ type: 'payment', data: { id: 'mp_pay_99' } })

    expect(res.status).toBe(200)
    expect(res.body.data.processed).toBe(true)
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'confirmed' } })
    )
  })

  it('siempre devuelve 200 aunque ocurra un error interno', async () => {
    MpPayment.mockImplementation(() => ({
      get: jest.fn().mockRejectedValue(new Error('MP API down')),
    }))

    const res = await request(app)
      .post(url)
      .send({ type: 'payment', data: { id: 'mp_pay_error' } })

    expect(res.status).toBe(200)
    expect(res.body.data.processed).toBe(false)
  })

  it('ignora notificaciones que no son de tipo payment', async () => {
    const res = await request(app)
      .post(url)
      .send({ type: 'merchant_order', data: { id: '123' } })

    expect(res.status).toBe(200)
    expect(res.body.data.processed).toBe(false)
    expect(res.body.data.reason).toBe('not_a_payment_notification')
  })

  it('no confirma la reserva si el pago fue rechazado', async () => {
    MpPayment.mockImplementation(() => ({
      get: jest.fn().mockResolvedValue({
        id:                 'mp_pay_rej',
        status:             'rejected',
        status_detail:      'cc_rejected_insufficient_amount',
        transaction_amount: 2600,
        external_reference: BOOKING_ID,
        order:              null,
      }),
    }))

    prisma.$transaction.mockImplementation(async (cb) => cb(prisma))
    prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: 'pending' })
    prisma.payment.update.mockResolvedValue({})

    const res = await request(app)
      .post(url)
      .send({ type: 'payment', data: { id: 'mp_pay_rej' } })

    expect(res.status).toBe(200)
    expect(res.body.data.processed).toBe(true)
    expect(prisma.booking.update).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────
// GET /api/v1/payments/spei/instructions
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/payments/spei/instructions', () => {
  const url = '/api/v1/payments/spei/instructions'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('devuelve instrucciones y datos bancarios', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)
    prisma.payment.findFirst.mockResolvedValue(null)
    prisma.payment.create.mockResolvedValue({ id: PAYMENT_ID })

    const res = await request(app)
      .get(url)
      .query({ booking_id: BOOKING_ID })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      paymentId:  PAYMENT_ID,
      bookingRef: 'SSS-2026-0001',
      amount:     2600,
      currency:   'MXN',
    })
    expect(res.body.data.bank).toHaveProperty('clabe')
    expect(Array.isArray(res.body.data.instructions)).toBe(true)
    expect(res.body.data.instructions.length).toBeGreaterThan(0)
  })

  it('reutiliza el Payment SPEI pendiente existente', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)
    prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: 'pending' })

    const res = await request(app)
      .get(url)
      .query({ booking_id: BOOKING_ID })

    expect(res.status).toBe(200)
    expect(prisma.payment.create).not.toHaveBeenCalled()
  })

  it('400 si falta booking_id', async () => {
    const res = await request(app).get(url)
    expect(res.status).toBe(400)
  })

  it('404 si la reserva no existe', async () => {
    prisma.booking.findUnique.mockResolvedValue(null)
    const res = await request(app).get(url).query({ booking_id: BOOKING_ID })
    expect(res.status).toBe(404)
  })

  it('la referencia tiene 7 dígitos', async () => {
    prisma.booking.findUnique.mockResolvedValue(sampleBooking)  // bookingRef: SSS-2026-0001
    prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID })

    const res = await request(app).get(url).query({ booking_id: BOOKING_ID })

    expect(res.status).toBe(200)
    expect(res.body.data.bank.reference).toMatch(/^\d{7}$/)
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/payments/spei/upload-proof
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/payments/spei/upload-proof', () => {
  const url = '/api/v1/payments/spei/upload-proof'

  const samplePayment = {
    id:        PAYMENT_ID,
    bookingId: BOOKING_ID,
    status:    'pending',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    uploadFile.mockResolvedValue({ url: 'https://r2.example.com/proofs/comprobante.jpg' })
    prisma.payment.findUnique.mockResolvedValue(samplePayment)
    prisma.paymentProof.create.mockResolvedValue({
      id:           PROOF_ID,
      paymentId:    PAYMENT_ID,
      reviewStatus: 'pending',
    })
    prisma.payment.update.mockResolvedValue({})
  })

  it('sube un comprobante y devuelve proofId', async () => {
    const res = await request(app)
      .post(url)
      .field('payment_id', PAYMENT_ID)
      .field('booking_id', BOOKING_ID)
      .attach('proof', Buffer.from('fake image data'), {
        filename:    'comprobante.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      proofId:      PROOF_ID,
      paymentId:    PAYMENT_ID,
      reviewStatus: 'pending',
    })
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'processing' }) })
    )
  })

  it('400 si no se adjunta archivo', async () => {
    const res = await request(app)
      .post(url)
      .field('payment_id', PAYMENT_ID)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_FILE')
  })

  it('400 si falta payment_id', async () => {
    const res = await request(app)
      .post(url)
      .attach('proof', Buffer.from('data'), { filename: 'f.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_PAYMENT_ID')
  })

  it('404 si el payment no existe', async () => {
    prisma.payment.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(url)
      .field('payment_id', PAYMENT_ID)
      .attach('proof', Buffer.from('data'), { filename: 'f.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(404)
  })

  it('404 si booking_id no coincide con el payment', async () => {
    const OTHER_BOOKING = '550e8400-e29b-41d4-a716-446655440099'

    const res = await request(app)
      .post(url)
      .field('payment_id', PAYMENT_ID)
      .field('booking_id', OTHER_BOOKING)
      .attach('proof', Buffer.from('data'), { filename: 'f.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(404)
  })
})
