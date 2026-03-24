'use strict'

/**
 * Genera la referencia legible de una reserva: SSS-YYYY-XXXX
 *
 * Se ejecuta DENTRO de una transacción Prisma para evitar
 * condiciones de carrera. Si dos transacciones concurrentes
 * obtienen el mismo número, la unique constraint en bookingRef
 * rechazará una y deberá reintentarse a nivel de aplicación.
 *
 * Para la escala de este negocio (~pocas reservas/día) este enfoque es suficiente.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<string>}  e.g. "SSS-2026-0001"
 */
async function generateBookingRef(tx) {
  const year   = new Date().getUTCFullYear()
  const prefix = `SSS-${year}-`

  // Busca la última ref del año actual ordenando descendente
  const last = await tx.booking.findFirst({
    where:   { bookingRef: { startsWith: prefix } },
    orderBy: { bookingRef: 'desc' },
    select:  { bookingRef: true },
  })

  const seq = last
    ? parseInt(last.bookingRef.split('-')[2], 10) + 1
    : 1

  return `${prefix}${String(seq).padStart(4, '0')}`
}

module.exports = { generateBookingRef }
