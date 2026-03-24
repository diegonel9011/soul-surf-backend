'use strict'

const { getQuote, getPriceTable } = require('./quote.service')
const { ok }                      = require('../../utils/response')

/**
 * GET /api/v1/quotes/calculate
 *
 * Query params (validados por Zod antes de llegar aquí):
 *   class_type       : 'private' | 'group'
 *   num_lessons      : integer ≥ 1
 *   num_participants : integer 1–4  (default 1)
 *
 * Respuesta exitosa:
 * {
 *   ok: true,
 *   data: {
 *     classType,
 *     numLessons,
 *     numParticipants,
 *     pricePerLesson,
 *     subtotal,
 *     total,
 *     discountApplied,
 *     savingsPerLesson,
 *     totalSavings,
 *     currency,
 *     ruleDescription
 *   }
 * }
 */
async function calculate(req, res, next) {
  try {
    const { class_type, num_lessons, num_participants } = req.validated

    const result = await getQuote(class_type, num_lessons, num_participants)
    return ok(res, result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/v1/quotes/prices
 *
 * Devuelve la tabla completa de tarifas vigentes.
 * Útil para renderizar la sección "Precios" en el frontend
 * sin hardcodear los valores en el cliente.
 */
async function priceTable(req, res, next) {
  try {
    const rules = await getPriceTable()
    return ok(res, rules)
  } catch (err) {
    next(err)
  }
}

module.exports = { calculate, priceTable }
