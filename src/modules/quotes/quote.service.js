'use strict'

const { calculateQuote } = require('../../utils/pricing')

/**
 * Servicio del cotizador.
 * Capa fina entre el controller y la función pura de pricing.
 * Aquí se pueden agregar en el futuro: caché, logging de cotizaciones, etc.
 */
async function getQuote(classType, numLessons, numParticipants) {
  return calculateQuote(classType, numLessons, numParticipants)
}

/**
 * Devuelve todas las tarifas vigentes para mostrarlas en una
 * tabla de precios en el frontend (sección "¿Cuánto cuesta?").
 */
async function getPriceTable() {
  const prisma = require('../../config/database')

  const rules = await prisma.priceRule.findMany({
    where:   { active: true },
    orderBy: [{ classType: 'asc' }, { minLessons: 'asc' }],
  })

  return rules.map((r) => ({
    classType:      r.classType,
    minLessons:     r.minLessons,
    maxLessons:     r.maxLessons,
    pricePerLesson: Number(r.pricePerLesson),
    currency:       'MXN',
    label: r.maxLessons === null
      ? `${r.minLessons}+ clases`
      : r.minLessons === r.maxLessons
        ? `${r.minLessons} ${r.minLessons === 1 ? 'clase' : 'clases'}`
        : `${r.minLessons}–${r.maxLessons} clases`,
  }))
}

module.exports = { getQuote, getPriceTable }
