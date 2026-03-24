'use strict'

/**
 * Tests unitarios para utils/pricing.js
 * Cubre todos los tramos de precio, casos borde y errores de negocio.
 * Prisma se mockea completamente — no se necesita DB.
 */

// ── Mock de Prisma (debe ir antes de cualquier require) ───────
jest.mock('../config/database', () => ({
  priceRule: {
    findMany: jest.fn(),
  },
}))

const prisma            = require('../config/database')
const { calculateQuote } = require('../utils/pricing')

// ── Datos de reglas que replica exactamente el seed ──────────
const PRICE_RULES = [
  { id: 1, classType: 'private', minLessons: 1, maxLessons: 2,    pricePerLesson: 1300, active: true },
  { id: 2, classType: 'private', minLessons: 3, maxLessons: 3,    pricePerLesson: 1200, active: true },
  { id: 3, classType: 'private', minLessons: 4, maxLessons: 4,    pricePerLesson: 1150, active: true },
  { id: 4, classType: 'private', minLessons: 5, maxLessons: 5,    pricePerLesson: 1100, active: true },
  { id: 5, classType: 'private', minLessons: 6, maxLessons: null, pricePerLesson: 1050, active: true },
  { id: 6, classType: 'group',   minLessons: 1, maxLessons: null, pricePerLesson: 1000, active: true },
]

beforeEach(() => {
  // findMany filtra por classType en el servicio, así que devolvemos
  // las reglas del tipo que corresponde según el primer argumento de la llamada
  prisma.priceRule.findMany.mockImplementation(({ where }) => {
    const rules = PRICE_RULES.filter(
      (r) => r.classType === where.classType && r.active === true
    )
    return Promise.resolve(rules)
  })
})

// ─────────────────────────────────────────────────────────────
// CLASES PRIVADAS
// ─────────────────────────────────────────────────────────────

describe('Clase privada — precios por tramo', () => {
  test('1 lección → $1,300/lección, total $1,300, sin descuento', async () => {
    const r = await calculateQuote('private', 1, 1)
    expect(r.pricePerLesson).toBe(1300)
    expect(r.total).toBe(1300)
    expect(r.discountApplied).toBe(false)
    expect(r.savingsPerLesson).toBe(0)
    expect(r.totalSavings).toBe(0)
  })

  test('2 lecciones → $1,300/lección, total $2,600, sin descuento', async () => {
    const r = await calculateQuote('private', 2, 1)
    expect(r.pricePerLesson).toBe(1300)
    expect(r.total).toBe(2600)
    expect(r.discountApplied).toBe(false)
  })

  test('3 lecciones → $1,200/lección, total $3,600, con descuento', async () => {
    const r = await calculateQuote('private', 3, 1)
    expect(r.pricePerLesson).toBe(1200)
    expect(r.total).toBe(3600)
    expect(r.discountApplied).toBe(true)
    expect(r.savingsPerLesson).toBe(100)
    expect(r.totalSavings).toBe(300)
  })

  test('4 lecciones → $1,150/lección, total $4,600', async () => {
    const r = await calculateQuote('private', 4, 1)
    expect(r.pricePerLesson).toBe(1150)
    expect(r.total).toBe(4600)
    expect(r.discountApplied).toBe(true)
    expect(r.savingsPerLesson).toBe(150)
    expect(r.totalSavings).toBe(600)
  })

  test('5 lecciones → $1,100/lección, total $5,500', async () => {
    const r = await calculateQuote('private', 5, 1)
    expect(r.pricePerLesson).toBe(1100)
    expect(r.total).toBe(5500)
    expect(r.discountApplied).toBe(true)
    expect(r.savingsPerLesson).toBe(200)
    expect(r.totalSavings).toBe(1000)
  })

  test('6 lecciones → $1,050/lección (tramo 6+, maxLessons=null), total $6,300', async () => {
    const r = await calculateQuote('private', 6, 1)
    expect(r.pricePerLesson).toBe(1050)
    expect(r.total).toBe(6300)
    expect(r.discountApplied).toBe(true)
  })

  test('10 lecciones → $1,050/lección (sigue en el tramo 6+)', async () => {
    const r = await calculateQuote('private', 10, 1)
    expect(r.pricePerLesson).toBe(1050)
    expect(r.total).toBe(10500)
  })

  test('100 lecciones → $1,050/lección (maxLessons=null no tiene techo)', async () => {
    const r = await calculateQuote('private', 100, 1)
    expect(r.pricePerLesson).toBe(1050)
    expect(r.total).toBe(105000)
  })
})

describe('Clase privada — numParticipants forzado a 1', () => {
  test('numParticipants=3 se ignora en privada, total = 1 persona', async () => {
    const r = await calculateQuote('private', 1, 3)
    expect(r.numParticipants).toBe(1)
    expect(r.total).toBe(1300)   // no 3900
  })
})

// ─────────────────────────────────────────────────────────────
// CLASES GRUPALES
// ─────────────────────────────────────────────────────────────

describe('Clase grupal — precio fijo por persona', () => {
  test('1 persona → $1,000, sin descuento', async () => {
    const r = await calculateQuote('group', 1, 1)
    expect(r.pricePerLesson).toBe(1000)
    expect(r.total).toBe(1000)
    expect(r.discountApplied).toBe(false)
  })

  test('2 personas → $2,000 total', async () => {
    const r = await calculateQuote('group', 1, 2)
    expect(r.total).toBe(2000)
    expect(r.numParticipants).toBe(2)
  })

  test('4 personas → $4,000 total (cupo máximo)', async () => {
    const r = await calculateQuote('group', 1, 4)
    expect(r.total).toBe(4000)
    expect(r.numParticipants).toBe(4)
  })

  test('Grupal no aplica descuento por volumen — 6 lecciones sigue en $1,000', async () => {
    const r = await calculateQuote('group', 6, 2)
    expect(r.pricePerLesson).toBe(1000)
    expect(r.discountApplied).toBe(false)
    expect(r.totalSavings).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// CAMPOS DE RESPUESTA
// ─────────────────────────────────────────────────────────────

describe('Estructura de respuesta', () => {
  test('Contiene todos los campos requeridos', async () => {
    const r = await calculateQuote('private', 4, 1)
    expect(r).toMatchObject({
      classType:       expect.any(String),
      numLessons:      expect.any(Number),
      numParticipants: expect.any(Number),
      pricePerLesson:  expect.any(Number),
      subtotal:        expect.any(Number),
      total:           expect.any(Number),
      discountApplied: expect.any(Boolean),
      savingsPerLesson:expect.any(Number),
      totalSavings:    expect.any(Number),
      currency:        'MXN',
      ruleDescription: expect.any(String),
    })
  })

  test('currency siempre es MXN', async () => {
    const priv  = await calculateQuote('private', 1, 1)
    const group = await calculateQuote('group', 1, 2)
    expect(priv.currency).toBe('MXN')
    expect(group.currency).toBe('MXN')
  })
})

// ─────────────────────────────────────────────────────────────
// ERRORES
// ─────────────────────────────────────────────────────────────

describe('Manejo de errores', () => {
  test('classType inválido lanza error 400', async () => {
    await expect(calculateQuote('vip', 1, 1))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CLASS_TYPE' })
  })

  test('numLessons = 0 lanza error 400', async () => {
    await expect(calculateQuote('private', 0, 1))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_LESSONS' })
  })

  test('numParticipants = 0 lanza error 400', async () => {
    await expect(calculateQuote('group', 1, 0))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PARTICIPANTS' })
  })

  test('Sin regla de precio coincidente lanza 422 PRICE_RULE_NOT_FOUND', async () => {
    // Simulamos una BD vacía
    prisma.priceRule.findMany.mockResolvedValueOnce([])
    await expect(calculateQuote('private', 1, 1))
      .rejects.toMatchObject({ statusCode: 422, code: 'PRICE_RULE_NOT_FOUND' })
  })
})
