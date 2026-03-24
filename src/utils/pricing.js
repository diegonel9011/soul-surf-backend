'use strict'

const prisma = require('../config/database')

/**
 * Busca en price_rules la tarifa vigente para la combinación
 * classType + numLessons.
 *
 * Lógica de lookup:
 *   - rule.minLessons <= numLessons <= rule.maxLessons
 *   - maxLessons === null significa "sin límite superior" (paquete 6+)
 *   - Solo reglas activas (active = true)
 *
 * @param {('private'|'group')} classType
 * @param {number}              numLessons
 * @returns {Promise<import('@prisma/client').PriceRule | null>}
 */
async function findPriceRule(classType, numLessons) {
  // Trae todas las reglas activas del tipo solicitado.
  // Son pocas filas (máx ~6) así que no hay problema de rendimiento.
  const rules = await prisma.priceRule.findMany({
    where:   { classType, active: true },
    orderBy: { minLessons: 'asc' },
  })

  // Encuentra la primera regla donde numLessons cae en el rango.
  // maxLessons === null → no hay límite superior (cubre 6, 7, 8… clases)
  return rules.find((r) =>
    numLessons >= r.minLessons &&
    (r.maxLessons === null || numLessons <= r.maxLessons)
  ) ?? null
}

/**
 * Calcula el total de una cotización y devuelve el desglose completo.
 *
 * Reglas de negocio aplicadas:
 *  - Privada: el descuento aplica por NÚMERO DE LECCIONES del paquete.
 *    Un cliente que compra 4 lecciones paga $1,150 cada una = $4,600 total.
 *  - Grupal: precio fijo por persona ($1,000), sin descuento por volumen.
 *    2 personas = $2,000; 4 personas = $4,000.
 *  - numParticipants solo afecta grupales; para privadas siempre es 1.
 *
 * @param {('private'|'group')} classType
 * @param {number}              numLessons      - Total de clases del paquete (≥1)
 * @param {number}              numParticipants - Personas (solo relevante en grupales)
 * @returns {Promise<QuoteResult>}
 *
 * @typedef {Object} QuoteResult
 * @property {number}  pricePerLesson   - Precio por lección aplicado
 * @property {number}  numLessons       - Lecciones del paquete
 * @property {number}  numParticipants  - Personas (grupales)
 * @property {number}  subtotal         - pricePerLesson * numLessons * numParticipants
 * @property {number}  total            - Igual a subtotal (sin impuestos en este sistema)
 * @property {boolean} discountApplied  - true si el precio es menor al base
 * @property {number}  savingsPerLesson - Ahorro por lección vs precio base
 * @property {number}  totalSavings     - Ahorro total del paquete
 * @property {string}  currency         - Siempre "MXN"
 * @property {string}  classType
 * @property {string}  ruleDescription  - Descripción legible de la tarifa aplicada
 */
async function calculateQuote(classType, numLessons, numParticipants = 1) {
  // Validaciones básicas de contrato (la validación profunda la hace Zod en el controller)
  if (!['private', 'group'].includes(classType)) {
    throw Object.assign(new Error(`classType inválido: ${classType}`), { statusCode: 400, code: 'INVALID_CLASS_TYPE' })
  }
  if (numLessons < 1) {
    throw Object.assign(new Error('numLessons debe ser ≥ 1'), { statusCode: 400, code: 'INVALID_LESSONS' })
  }
  if (numParticipants < 1) {
    throw Object.assign(new Error('numParticipants debe ser ≥ 1'), { statusCode: 400, code: 'INVALID_PARTICIPANTS' })
  }

  // Para clases privadas siempre hay 1 participante (1 alumno : 1 instructor)
  const participants = classType === 'private' ? 1 : numParticipants

  const rule = await findPriceRule(classType, numLessons)

  if (!rule) {
    throw Object.assign(
      new Error(`No se encontró tarifa para classType=${classType}, numLessons=${numLessons}`),
      { statusCode: 422, code: 'PRICE_RULE_NOT_FOUND' }
    )
  }

  const pricePerLesson  = Number(rule.pricePerLesson)
  const subtotal        = pricePerLesson * numLessons * participants
  const total           = subtotal  // Sin impuestos adicionales

  // ── Cálculo de ahorro (solo aplica a privadas con paquete ≥ 3) ──
  const BASE_PRIVATE_PRICE = 1300   // precio base de 1-2 lecciones privadas
  const basePrice   = classType === 'private' ? BASE_PRIVATE_PRICE : pricePerLesson
  const savingsPerLesson = basePrice - pricePerLesson
  const totalSavings     = savingsPerLesson * numLessons * participants

  // ── Descripción legible para mostrar en el frontend ──
  let ruleDescription
  if (classType === 'group') {
    ruleDescription = `Clase grupal: $${pricePerLesson.toLocaleString('es-MX')} MXN por persona`
  } else if (rule.maxLessons === null) {
    ruleDescription = `Paquete ${numLessons} clases privadas (${rule.minLessons}+ lecciones): $${pricePerLesson.toLocaleString('es-MX')} MXN/clase`
  } else if (rule.minLessons === rule.maxLessons) {
    ruleDescription = `Paquete ${numLessons} clases privadas: $${pricePerLesson.toLocaleString('es-MX')} MXN/clase`
  } else {
    ruleDescription = `Clase privada: $${pricePerLesson.toLocaleString('es-MX')} MXN/clase`
  }

  return {
    classType,
    numLessons,
    numParticipants:  participants,
    pricePerLesson,
    subtotal,
    total,
    discountApplied:  savingsPerLesson > 0,
    savingsPerLesson,
    totalSavings,
    currency:         'MXN',
    ruleDescription,
  }
}

module.exports = { calculateQuote, findPriceRule }
