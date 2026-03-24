'use strict'

/**
 * Middleware de validación con Zod.
 * Valida el input del request y almacena los datos coercionados y con
 * defaults aplicados en `req.validated` (disponible en todos los controllers).
 *
 * Express v5 hace req.query read-only, por eso usamos req.validated
 * en lugar de intentar sobrescribir req.query directamente.
 *
 * Uso:
 *   router.get('/ruta', validate(MiSchema, 'query'), controller)
 *   router.post('/ruta', validate(MiSchema),         controller)  // default: 'body'
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    try {
      const target = source === 'query' ? req.query : req.body
      req.validated = schema.parse(target)
      next()
    } catch (err) {
      next(err)
    }
  }
}

module.exports = validate
