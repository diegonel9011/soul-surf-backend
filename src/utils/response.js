'use strict'

/**
 * Helpers para respuestas consistentes en toda la API.
 *
 * Formato de éxito:  { ok: true,  data: <payload> }
 * Formato de error:  { ok: false, error: <CODE>, message: <string> }
 */

function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, data })
}

function created(res, data) {
  return ok(res, data, 201)
}

function notFound(res, message = 'Recurso no encontrado') {
  return res.status(404).json({ ok: false, error: 'NOT_FOUND', message })
}

function conflict(res, message) {
  return res.status(409).json({ ok: false, error: 'CONFLICT', message })
}

module.exports = { ok, created, notFound, conflict }
