'use strict'

const { z } = require('zod')

const CreatePreferenceSchema = z.object({
  booking_id: z.string().uuid('booking_id debe ser un UUID válido'),
})

const SpeiInstructionsSchema = z.object({
  booking_id: z.string().uuid('booking_id debe ser un UUID válido'),
})

module.exports = { CreatePreferenceSchema, SpeiInstructionsSchema }
