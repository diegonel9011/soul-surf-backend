'use strict'

const { MercadoPagoConfig } = require('mercadopago')

/**
 * Cliente singleton de MercadoPago.
 * Se inicializa con el access token del entorno.
 * En tests este módulo se mockea completamente.
 */
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN ?? '',
  options: {
    timeout: 10000,
  },
})

module.exports = mpClient
