'use strict'

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt           = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
  console.log('🌊 Iniciando seed de Soul Surf School...\n')

  // ── 1. Price Rules ────────────────────────────────────────────
  // Reglas de negocio acordadas con el cliente.
  // Se usa deleteMany + createMany para hacer el seed idempotente.
  await prisma.priceRule.deleteMany()

  await prisma.priceRule.createMany({
    data: [
      // Clases privadas — precio base y tramos de paquete
      { classType: 'private', minLessons: 1, maxLessons: 2,    pricePerLesson: 1300.00 },
      { classType: 'private', minLessons: 3, maxLessons: 3,    pricePerLesson: 1200.00 },
      { classType: 'private', minLessons: 4, maxLessons: 4,    pricePerLesson: 1150.00 },
      { classType: 'private', minLessons: 5, maxLessons: 5,    pricePerLesson: 1100.00 },
      { classType: 'private', minLessons: 6, maxLessons: null, pricePerLesson: 1050.00 }, // 6+ sin límite
      // Clases grupales — máx 2 alumnos/instructor, precio único por persona
      { classType: 'group',         minLessons: 1, maxLessons: null, pricePerLesson: 1000.00 },
      // Excursión medio día — $2,800/persona, hasta 4 personas, 2 guías
      { classType: 'half_day_trip', minLessons: 1, maxLessons: null, pricePerLesson: 2800.00 },
      // Excursión día completo — $5,000/persona, hasta 4 personas, 2 guías
      { classType: 'full_day_trip', minLessons: 1, maxLessons: null, pricePerLesson: 5000.00 },
    ],
  })
  console.log('✓ Price rules cargadas (8 reglas)')

  // ── 2. Admin user inicial ─────────────────────────────────────
  const seedPassword = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMeNow123!'
  const passwordHash = await bcrypt.hash(seedPassword, 12)

  await prisma.adminUser.upsert({
    where:  { email: 'admin@soulsurfschool.mx' },
    update: { passwordHash },  // Actualiza el hash si ya existe (útil al cambiar contraseña)
    create: {
      name:         'Admin Soul Surf',
      email:        'admin@soulsurfschool.mx',
      passwordHash,
      role:         'admin',
    },
  })
  console.log('✓ Admin user listo  →  admin@soulsurfschool.mx')
  console.log(`  Contraseña seed: ${seedPassword}`)
  console.log('  ⚠️  Cambia esta contraseña en el primer login.')

  // ── 3. Instructor de ejemplo ──────────────────────────────────
  await prisma.instructor.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:    '00000000-0000-0000-0000-000000000001',
      name:  'Instructor Ejemplo',
      phone: '+529541000000',
    },
  })
  console.log('✓ Instructor de ejemplo creado')

  console.log('\n🏄 Seed completado exitosamente.')
}

main()
  .catch((e) => { console.error('❌ Error en seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
