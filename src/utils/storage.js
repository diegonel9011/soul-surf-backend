'use strict'

/**
 * Adaptador de almacenamiento — Cloudflare R2 (compatible con AWS S3 API).
 *
 * Si las credenciales R2 están configuradas → sube al bucket real.
 * Si no → genera una URL local de desarrollo (no sube nada).
 */

const { randomUUID } = require('crypto')
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = require('../config/env')

const isConfigured =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME

/**
 * Sube un archivo al bucket de R2 y retorna la URL pública.
 *
 * @param {Buffer} buffer    - Contenido del archivo
 * @param {string} filename  - Nombre original del archivo
 * @param {string} mimetype  - MIME type del archivo
 * @param {string} folder    - Carpeta destino en el bucket (ej: 'proofs', 'media')
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadFile(buffer, filename, mimetype, folder = 'uploads') {
  const ext = filename.split('.').pop()
  const key = `${folder}/${randomUUID()}.${ext}`

  if (isConfigured) {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

    const s3 = new S3Client({
      region:   'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    await s3.send(new PutObjectCommand({
      Bucket:      R2_BUCKET_NAME,
      Key:         key,
      Body:        buffer,
      ContentType: mimetype,
    }))

    const publicBase = R2_PUBLIC_URL || `https://${R2_BUCKET_NAME}.r2.dev`
    return { url: `${publicBase}/${key}`, key }
  }

  // ── Modo desarrollo sin credenciales ─────────────────────────
  console.log(`[storage] DEV MODE — archivo no subido: ${key}`)
  const url = `http://localhost:3001/dev-storage/${key}`
  return { url, key }
}

module.exports = { uploadFile }
