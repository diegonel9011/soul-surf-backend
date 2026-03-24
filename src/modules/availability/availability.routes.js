'use strict'

const { Router }    = require('express')
const validate      = require('../../middleware/validate')
const { requireAdmin } = require('../../middleware/auth')
const { AvailabilityQuerySchema, CreateSlotSchema } = require('./availability.schema')
const { list, create } = require('./availability.controller')

const router = Router()

/**
 * GET /api/v1/availability
 * Público — el frontend lo llama en tiempo real mientras el cliente elige fecha.
 */
router.get('/', validate(AvailabilityQuerySchema, 'query'), list)

/**
 * POST /api/v1/availability
 * Admin — el staff crea los slots del calendario desde el panel de control.
 */
router.post('/', requireAdmin, validate(CreateSlotSchema), create)

module.exports = router
