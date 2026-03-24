'use strict'

/**
 * Fábrica de errores de negocio con statusCode y code adjuntos.
 * El errorHandler global los captura y formatea la respuesta HTTP.
 */

function businessError(message, code = 'BUSINESS_ERROR', statusCode = 422) {
  return Object.assign(new Error(message), { code, statusCode })
}

function notFoundError(message = 'Recurso no encontrado') {
  return Object.assign(new Error(message), { code: 'NOT_FOUND', statusCode: 404 })
}

function conflictError(message) {
  return Object.assign(new Error(message), { code: 'CONFLICT', statusCode: 409 })
}

function unauthorizedError(message = 'No autorizado') {
  return Object.assign(new Error(message), { code: 'UNAUTHORIZED', statusCode: 401 })
}

module.exports = { businessError, notFoundError, conflictError, unauthorizedError }
