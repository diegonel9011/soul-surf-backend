'use strict'

const { Router }           = require('express')
const validate             = require('../../middleware/validate')
const { QuoteQuerySchema } = require('./quote.schema')
const { calculate, priceTable } = require('./quote.controller')

const router = Router()

/**
 * GET /api/v1/quotes/calculate
 * Calcula el total de una cotización en tiempo real.
 */
router.get('/calculate', validate(QuoteQuerySchema, 'query'), calculate)

/**
 * GET /api/v1/quotes/prices
 * Devuelve la tabla completa de tarifas (para renderizar la sección de precios).
 */
router.get('/prices', priceTable)

module.exports = router
