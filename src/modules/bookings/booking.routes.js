'use strict'

const { Router }              = require('express')
const validate                = require('../../middleware/validate')
const { CreateBookingSchema } = require('./booking.schema')
const { create, getById }     = require('./booking.controller')

const router = Router()

/**
 * POST /api/v1/bookings
 * Público — el cliente crea su reserva desde el portal web.
 */
router.post('/', validate(CreateBookingSchema), create)

/**
 * GET /api/v1/bookings/:id
 * Público — página de confirmación de reserva.
 */
router.get('/:id', getById)

module.exports = router
