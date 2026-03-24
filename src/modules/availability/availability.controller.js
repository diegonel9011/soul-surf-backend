'use strict'

const { getAvailableSlots, createSlot } = require('./availability.service')
const { ok, created }                   = require('../../utils/response')

/**
 * GET /api/v1/availability?date=YYYY-MM-DD&class_type=private|group
 *
 * Devuelve los slots disponibles para una fecha y tipo de clase.
 * Los slots bloqueados por staff no aparecen.
 * Los slots llenos aparecen con isFull=true para que el frontend
 * los muestre pero los deshabilite.
 */
async function list(req, res, next) {
  try {
    const { date, class_type } = req.validated
    const slots = await getAvailableSlots(date, class_type)
    return ok(res, slots)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/v1/availability  [requiere Bearer token de admin]
 *
 * Crea un nuevo slot de disponibilidad en el calendario.
 * Usado por el staff desde el panel de administración.
 */
async function create(req, res, next) {
  try {
    const slot = await createSlot(req.validated)
    return created(res, slot)
  } catch (err) {
    next(err)
  }
}

module.exports = { list, create }
