'use strict'

const app          = require('./app')
const { PORT }     = require('./config/env')
const prisma       = require('./config/database')

async function main() {
  // Verificar conexión a la base de datos antes de arrancar
  await prisma.$connect()
  console.log('[db] Conexión a PostgreSQL establecida')

  app.listen(PORT, () => {
    console.log(`[server] Soul Surf API corriendo en http://localhost:${PORT}`)
    console.log(`[server] Entorno: ${process.env.NODE_ENV ?? 'development'}`)
  })
}

main().catch((err) => {
  console.error('[server] Error al arrancar:', err)
  process.exit(1)
})
