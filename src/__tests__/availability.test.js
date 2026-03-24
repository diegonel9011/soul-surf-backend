'use strict'

/**
 * Tests de integración para:
 *   GET  /api/v1/availability
 *   POST /api/v1/availability  (requiere JWT)
 */

jest.mock('../config/database', () => ({
  availabilitySlot: {
    findMany:   jest.fn(),
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
  },
  priceRule: { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const app     = require('../app')
const prisma  = require('../config/database')

// ── UUIDs RFC-válidos para los fixtures ───────────────────────
const SLOT_UUID       = '550e8400-e29b-41d4-a716-446655440001'
const INSTRUCTOR_UUID = '550e8400-e29b-41d4-a716-446655440002'
const NEW_SLOT_UUID   = '550e8400-e29b-41d4-a716-446655440003'

// ── Helper para generar un token válido en tests ──────────────
function makeAdminToken() {
  return jwt.sign(
    { id: INSTRUCTOR_UUID, email: 'admin@test.com', role: 'admin' },
    process.env.JWT_SECRET ?? 'soul_surf_dev_secret_key_change_in_production_32chars',
    { expiresIn: '1h' }
  )
}

// ── Slot de ejemplo ───────────────────────────────────────────
const MOCK_SLOT = {
  id:           SLOT_UUID,
  slotDate:     new Date('2026-04-01T00:00:00.000Z'),
  startTime:    new Date('1970-01-01T08:00:00.000Z'),
  classType:    'private',
  instructorId: INSTRUCTOR_UUID,
  maxCapacity:  1,
  bookedCount:  0,
  status:       'available',
  instructor:   { id: INSTRUCTOR_UUID, name: 'Juan Instructor' },
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/availability
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/availability', () => {
  test('Parámetros válidos → 200 con array de slots', async () => {
    prisma.availabilitySlot.findMany.mockResolvedValue([MOCK_SLOT])

    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '2026-04-01', class_type: 'private' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(1)
  })

  test('Respuesta contiene campos correctos con horas formateadas', async () => {
    prisma.availabilitySlot.findMany.mockResolvedValue([MOCK_SLOT])

    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '2026-04-01', class_type: 'private' })

    const slot = res.body.data[0]
    expect(slot).toMatchObject({
      slotId:         SLOT_UUID,
      date:           '2026-04-01',
      startTime:      '08:00',
      endTime:        '10:00',       // startTime + 2 horas
      classType:      'private',
      maxCapacity:    1,
      bookedCount:    0,
      availableSpots: 1,
      isFull:         false,
      isAvailable:    true,
    })
    expect(slot.instructor.name).toBe('Juan Instructor')
  })

  test('Sin slots disponibles → 200 con array vacío', async () => {
    prisma.availabilitySlot.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '2026-04-01', class_type: 'group' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  test('Slot lleno → aparece con isFull=true y availableSpots=0', async () => {
    const fullSlot = { ...MOCK_SLOT, classType: 'group', maxCapacity: 4, bookedCount: 4, status: 'full' }
    prisma.availabilitySlot.findMany.mockResolvedValue([fullSlot])

    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '2026-04-01', class_type: 'group' })

    const slot = res.body.data[0]
    expect(slot.isFull).toBe(true)
    expect(slot.isAvailable).toBe(false)
    expect(slot.availableSpots).toBe(0)
  })

  test('Falta parámetro date → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/availability')
      .query({ class_type: 'private' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  test('date con formato inválido → 400', async () => {
    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '01-04-2026', class_type: 'private' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  test('class_type inválido → 400', async () => {
    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '2026-04-01', class_type: 'vip' })

    expect(res.status).toBe(400)
  })

  test('Falta class_type → 400', async () => {
    const res = await request(app)
      .get('/api/v1/availability')
      .query({ date: '2026-04-01' })

    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/v1/availability  (admin)
// ─────────────────────────────────────────────────────────────

describe('POST /api/v1/availability', () => {
  const validBody = {
    date:          '2026-04-05',
    start_time:    '08:00',
    class_type:    'private',
    instructor_id: INSTRUCTOR_UUID,
  }

  test('Sin token → 401', async () => {
    const res = await request(app).post('/api/v1/availability').send(validBody)
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  test('Token inválido → 401', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', 'Bearer token_invalido')
      .send(validBody)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('INVALID_TOKEN')
  })

  test('Token válido + datos correctos → 201 con slot creado', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue(null)
    prisma.availabilitySlot.create.mockResolvedValue({
      ...MOCK_SLOT,
      id:       NEW_SLOT_UUID,
      slotDate: new Date('2026-04-05T00:00:00.000Z'),
    })

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.slotId).toBe(NEW_SLOT_UUID)
  })

  test('Slot duplicado → 409 CONFLICT', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue(MOCK_SLOT)

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send(validBody)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('CONFLICT')
  })

  test('start_time con formato inválido → 400', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ ...validBody, start_time: '8am' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  test('Slot grupal sin max_capacity → usa default de 4', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue(null)
    prisma.availabilitySlot.create.mockResolvedValue({
      ...MOCK_SLOT,
      classType:   'group',
      maxCapacity: 4,
    })

    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ ...validBody, class_type: 'group' })

    const createCall = prisma.availabilitySlot.create.mock.calls[0][0]
    expect(createCall.data.maxCapacity).toBe(4)
  })
})
