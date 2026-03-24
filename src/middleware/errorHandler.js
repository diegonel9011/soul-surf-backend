'use strict'

const { ZodError } = require('zod')

/**
 * Middleware global de manejo de errores.
 * Centraliza el formato de respuestas de error para toda la API.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Errores de validación Zod → 400
  if (err instanceof ZodError) {
    return res.status(400).json({
      ok:     false,
      error:  'VALIDATION_ERROR',
      issues: err.issues.map((e) => ({
        field:   e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // Errores de negocio lanzados con statusCode explícito
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      ok:    false,
      error: err.code ?? 'BUSINESS_ERROR',
      message: err.message,
    })
  }

  // Error genérico — no exponer detalles en producción
  console.error('[errorHandler]', err)
  return res.status(500).json({
    ok:    false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Ocurrió un error interno. Por favor intenta más tarde.',
  })
}

module.exports = errorHandler
