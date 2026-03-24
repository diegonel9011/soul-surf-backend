'use strict'

const prisma                             = require('../../config/database')
const { notFoundError, conflictError }   = require('../../utils/errors')
const { formatTime, formatDate, parseTime, parseDate, calcEndTime } = require('../../utils/time')

/**
 * Formatea un slot de BD al shape que devuelve la API.
 */
function formatSlot(slot) {
  const availableSpots = slot.maxCapacity - slot.bookedCount

  return {
    slotId:          slot.id,
    date:            formatDate(slot.slotDate),
    startTime:       formatTime(slot.startTime),
    endTime:         calcEndTime(slot.startTime),
    classType:       slot.classType,
    instructor:      slot.instructor
      ? { id: slot.instructor.id, name: slot.instructor.name }
      : null,
    maxCapacity:     slot.maxCapacity,
    bookedCount:     slot.bookedCount,
    availableSpots,
    isFull:          slot.status === 'full',
    isAvailable:     slot.status === 'available' && availableSpots > 0,
  }
}

/**
 * Devuelve los slots disponibles para una fecha y tipo de clase.
 * Excluye slots bloqueados; incluye los llenos (frontend los muestra como no disponibles).
 *
 * @param {string} date       "YYYY-MM-DD"
 * @param {string} classType  "private" | "group"
 */
async function getAvailableSlots(date, classType) {
  const slots = await prisma.availabilitySlot.findMany({
    where: {
      slotDate:  parseDate(date),
      classType,
      status:    { not: 'blocked' },  // nunca mostramos slots bloqueados por staff
    },
    include: {
      instructor: { select: { id: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  return slots.map(formatSlot)
}

/**
 * Crea un nuevo slot de disponibilidad (operación de staff/admin).
 * Valida que no exista un slot duplicado para el mismo instructor, fecha y hora.
 *
 * @param {object} data
 */
async function createSlot(data) {
  const {
    date,
    start_time,
    class_type,
    instructor_id,
    max_capacity,
  } = data

  // La capacidad por defecto depende del tipo de clase
  const defaultCapacity = class_type === 'group' ? 4 : 1
  const capacity        = max_capacity ?? defaultCapacity

  // Validar que no haya un slot duplicado (misma fecha, hora, instructor)
  const existing = await prisma.availabilitySlot.findFirst({
    where: {
      slotDate:     parseDate(date),
      startTime:    parseTime(start_time),
      instructorId: instructor_id ?? null,
    },
  })

  if (existing) {
    throw conflictError(
      `Ya existe un slot para ese instructor en ${date} a las ${start_time}`
    )
  }

  const slot = await prisma.availabilitySlot.create({
    data: {
      slotDate:     parseDate(date),
      startTime:    parseTime(start_time),
      classType:    class_type,
      instructorId: instructor_id ?? null,
      maxCapacity:  capacity,
      bookedCount:  0,
      status:       'available',
    },
    include: {
      instructor: { select: { id: true, name: true } },
    },
  })

  return formatSlot(slot)
}

/**
 * Obtiene un slot por ID (uso interno en booking.service).
 * @param {string} slotId
 */
async function getSlotById(slotId) {
  const slot = await prisma.availabilitySlot.findUnique({
    where:   { id: slotId },
    include: { instructor: { select: { id: true, name: true } } },
  })

  if (!slot) throw notFoundError(`Slot ${slotId} no encontrado`)
  return slot
}

module.exports = { getAvailableSlots, createSlot, getSlotById, formatSlot }
