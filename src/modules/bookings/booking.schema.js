'use strict'

const { z } = require('zod')

/**
 * Schema para POST /api/v1/bookings
 *
 * El waiver (responsiva) es OBLIGATORIO para crear una reserva.
 * El cliente debe aceptar los términos antes de continuar al pago.
 */
const CreateBookingSchema = z.object({
  class_type: z.enum(['private', 'group', 'half_day_trip', 'full_day_trip'], {
    message: "class_type debe ser 'private', 'group', 'half_day_trip' o 'full_day_trip'",
  }),

  num_lessons: z.coerce
    .number({ invalid_type_error: 'num_lessons debe ser un número' })
    .int('num_lessons debe ser un entero')
    .min(1, 'num_lessons debe ser al menos 1')
    .max(50, 'num_lessons no puede superar 50'),

  num_participants: z.coerce
    .number()
    .int()
    .min(1, 'num_participants debe ser al menos 1')
    .max(4, 'Las clases grupales tienen máximo 4 participantes')
    .default(1),

  // UUID del slot de disponibilidad elegido por el cliente
  slot_id: z.string().uuid('slot_id debe ser un UUID válido'),

  // Datos del cliente
  client: z.object({
    first_name: z.string().min(2, 'Nombre muy corto').max(100),
    last_name:  z.string().min(2, 'Apellido muy corto').max(100),
    email:      z.string().email('Email inválido'),
    phone:      z.string().max(30).optional(),
    surf_level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    lycra_size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']).optional(),
  }),

  // Responsiva digital — acepta tanto objeto completo como boolean simple
  waiver: z.union([
    z.object({
      full_name: z.string().min(2).max(200),
      accepted:  z.literal(true, { message: 'Debes aceptar los términos y condiciones para continuar' }),
    }),
    z.literal(true, { message: 'Debes aceptar los términos y condiciones para continuar' }),
  ]),

  // Alternativa: waiver_accepted: true (formato simplificado del frontend)
  waiver_accepted: z.literal(true).optional(),

  payment_method: z.enum(['mercadopago', 'spei']).optional(),

  notes: z.string().max(500).optional(),
})

module.exports = { CreateBookingSchema }
