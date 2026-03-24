'use strict'

const { z } = require('zod')

// Regex para validar formato YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
// Regex para validar formato HH:MM (24h)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Schema para GET /api/v1/availability
 */
const AvailabilityQuerySchema = z.object({
  date: z
    .string({ required_error: 'El parámetro date es requerido' })
    .regex(DATE_REGEX, 'date debe tener el formato YYYY-MM-DD'),

  class_type: z.enum(['private', 'group'], {
    required_error: "class_type es requerido ('private' o 'group')",
    message:        "class_type debe ser 'private' o 'group'",
  }),
})

/**
 * Schema para POST /api/v1/availability (admin)
 */
const CreateSlotSchema = z.object({
  date: z
    .string({ required_error: 'date es requerido' })
    .regex(DATE_REGEX, 'date debe tener el formato YYYY-MM-DD'),

  start_time: z
    .string({ required_error: 'start_time es requerido' })
    .regex(TIME_REGEX, 'start_time debe tener el formato HH:MM (ej: 08:00)'),

  class_type: z.enum(['private', 'group'], {
    message: "class_type debe ser 'private' o 'group'",
  }),

  instructor_id: z
    .string()
    .uuid('instructor_id debe ser un UUID válido')
    .optional(),

  // Para grupales: típicamente 4. Para privadas: siempre 1.
  max_capacity: z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .optional(),
})

module.exports = { AvailabilityQuerySchema, CreateSlotSchema }
