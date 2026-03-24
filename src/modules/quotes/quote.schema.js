'use strict'

const { z } = require('zod')

/**
 * Schema de validación para GET /api/v1/quotes/calculate
 * Los query params llegan como strings → coerce los convierte a número.
 */
const QuoteQuerySchema = z.object({
  class_type: z.enum(['private', 'group'], {
    errorMap: () => ({ message: "class_type debe ser 'private' o 'group'" }),
  }),

  num_lessons: z.coerce
    .number({ invalid_type_error: 'num_lessons debe ser un número' })
    .int('num_lessons debe ser un entero')
    .min(1, 'num_lessons debe ser al menos 1')
    .max(50, 'num_lessons no puede superar 50'),

  num_participants: z.coerce
    .number({ invalid_type_error: 'num_participants debe ser un número' })
    .int('num_participants debe ser un entero')
    .min(1, 'num_participants debe ser al menos 1')
    .max(4, 'Las clases grupales tienen un máximo de 4 participantes')
    .optional()
    .default(1),
})

module.exports = { QuoteQuerySchema }
