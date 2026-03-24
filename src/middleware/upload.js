'use strict'

const multer = require('multer')

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE_BYTES    = 5 * 1024 * 1024   // 5 MB

/**
 * Multer con almacenamiento en memoria.
 * El buffer se sube a Cloudflare R2 en el service layer.
 * Limita a 1 archivo, 5 MB, formatos de imagen o PDF.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(Object.assign(
        new Error('Formato no permitido. Sube una imagen (JPG, PNG, WEBP) o PDF.'),
        { statusCode: 400, code: 'INVALID_FILE_TYPE' }
      ))
    }
  },
})

module.exports = upload
