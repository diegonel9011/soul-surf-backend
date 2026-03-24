'use strict'

/**
 * Helpers de fecha/hora.
 *
 * Contexto: Prisma retorna los campos @db.Time como objetos Date
 * con fecha base 1970-01-01 y la hora en UTC. Los campos @db.Date
 * vienen como Date con hora 00:00:00 UTC.
 * Usamos métodos UTC para evitar desplazamientos por timezone del servidor.
 */

/**
 * Convierte un objeto Date de Prisma (@db.Time) → "HH:MM"
 * @param {Date|string} val
 * @returns {string}  e.g. "08:00"
 */
function formatTime(val) {
  const d = new Date(val)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Convierte un objeto Date de Prisma (@db.Date) → "YYYY-MM-DD"
 * @param {Date|string} val
 * @returns {string}  e.g. "2026-04-01"
 */
function formatDate(val) {
  const d = new Date(val)
  const year  = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day   = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Convierte "HH:MM" → Date con fecha base 1970-01-01 UTC.
 * Es el formato que Prisma espera para campos @db.Time.
 * @param {string} timeStr  e.g. "08:00"
 * @returns {Date}
 */
function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(0)           // 1970-01-01T00:00:00.000Z
  d.setUTCHours(h, m, 0, 0)
  return d
}

/**
 * Convierte "YYYY-MM-DD" → Date con hora 00:00:00 UTC.
 * Es el formato que Prisma espera para campos @db.Date.
 * @param {string} dateStr  e.g. "2026-04-01"
 * @returns {Date}
 */
function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/**
 * Dado un tiempo de inicio (@db.Time), calcula el tiempo de fin + 2 horas.
 * @param {Date|string} startTimeVal
 * @returns {string}  e.g. "10:00"
 */
function calcEndTime(startTimeVal) {
  const d = new Date(startTimeVal)
  d.setUTCHours(d.getUTCHours() + 2)
  return formatTime(d)
}

module.exports = { formatTime, formatDate, parseTime, parseDate, calcEndTime }
