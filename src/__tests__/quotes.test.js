'use strict'

/**
 * Tests de integración para GET /api/v1/quotes/calculate
 * y GET /api/v1/quotes/prices.
 * Prisma mockeado — no se necesita DB.
 */

jest.mock('../config/database', () => ({
  priceRule: { findMany: jest.fn() },
}))

const request = require('supertest')
const app     = require('../app')
const prisma  = require('../config/database')

const PRICE_RULES = [
  { id: 1, classType: 'private', minLessons: 1, maxLessons: 2,    pricePerLesson: 1300, active: true },
  { id: 2, classType: 'private', minLessons: 3, maxLessons: 3,    pricePerLesson: 1200, active: true },
  { id: 3, classType: 'private', minLessons: 4, maxLessons: 4,    pricePerLesson: 1150, active: true },
  { id: 4, classType: 'private', minLessons: 5, maxLessons: 5,    pricePerLesson: 1100, active: true },
  { id: 5, classType: 'private', minLessons: 6, maxLessons: null, pricePerLesson: 1050, active: true },
  { id: 6, classType: 'group',   minLessons: 1, maxLessons: null, pricePerLesson: 1000, active: true },
]

beforeEach(() => {
  prisma.priceRule.findMany.mockImplementation(({ where }) => {
    return Promise.resolve(
      PRICE_RULES.filter((r) => {
        // getPriceTable no filtra por classType (trae todas); calculateQuote sí lo hace
        if (where.classType !== undefined && r.classType !== where.classType) return false
        return r.active === true
      })
    )
  })
})

// ─────────────────────────────────────────────────────────────
// GET /api/v1/quotes/calculate
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/quotes/calculate', () => {
  test('Cotización privada 4 lecciones → 200 con total correcto', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'private', num_lessons: 4 })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toMatchObject({
      classType:      'private',
      numLessons:     4,
      pricePerLesson: 1150,
      total:          4600,
      discountApplied: true,
      currency:       'MXN',
    })
  })

  test('Cotización grupal 3 personas → total $3,000', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'group', num_lessons: 1, num_participants: 3 })

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(3000)
    expect(res.body.data.numParticipants).toBe(3)
    expect(res.body.data.discountApplied).toBe(false)
  })

  test('Cotización privada 6 lecciones → $1,050 (tramo 6+)', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'private', num_lessons: 6 })

    expect(res.status).toBe(200)
    expect(res.body.data.pricePerLesson).toBe(1050)
  })

  test('Falta class_type → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ num_lessons: 2 })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  test('class_type inválido → 400', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'vip', num_lessons: 2 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  test('num_lessons = 0 → 400', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'private', num_lessons: 0 })

    expect(res.status).toBe(400)
  })

  test('num_participants = 5 en grupal → 400 (máximo 4)', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'group', num_lessons: 1, num_participants: 5 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  test('num_participants omitido → usa default 1', async () => {
    const res = await request(app)
      .get('/api/v1/quotes/calculate')
      .query({ class_type: 'group', num_lessons: 1 })

    expect(res.status).toBe(200)
    expect(res.body.data.numParticipants).toBe(1)
    expect(res.body.data.total).toBe(1000)
  })
})

// ─────────────────────────────────────────────────────────────
// GET /api/v1/quotes/prices
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/quotes/prices', () => {
  test('Devuelve array con las 6 reglas de precio', async () => {
    const res = await request(app).get('/api/v1/quotes/prices')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(6)
  })

  test('Todas las reglas tienen currency MXN', async () => {
    const res = await request(app).get('/api/v1/quotes/prices')
    res.body.data.forEach((rule) => {
      expect(rule.currency).toBe('MXN')
    })
  })

  test('La regla de 6+ tiene label "6+ clases"', async () => {
    const res  = await request(app).get('/api/v1/quotes/prices')
    const rule = res.body.data.find((r) => r.classType === 'private' && r.minLessons === 6)
    expect(rule).toBeDefined()
    expect(rule.label).toBe('6+ clases')
    expect(rule.maxLessons).toBeNull()
  })
})
