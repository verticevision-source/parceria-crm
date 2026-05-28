import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  const adminPassword = await bcrypt.hash('Admin@123', 12)
  const userPassword = await bcrypt.hash('User@123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@crm.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
  })

  const user = await prisma.user.upsert({
    where: { email: 'atendente@crm.com' },
    update: {},
    create: {
      name: 'Atendente Demo',
      email: 'atendente@crm.com',
      passwordHash: userPassword,
      role: 'USER',
      isActive: true,
    },
  })

  const stages = [
    { name: 'Novo Lead', order: 1, color: '#6366f1' },
    { name: 'Primeiro Contato', order: 2, color: '#8b5cf6' },
    { name: 'Em Atendimento', order: 3, color: '#3b82f6' },
    { name: 'Enviou Documentos', order: 4, color: '#06b6d4' },
    { name: 'Em Análise', order: 5, color: '#f59e0b' },
    { name: 'Aprovado', order: 6, color: '#10b981' },
    { name: 'Fechado', order: 7, color: '#22c55e' },
    { name: 'Perdido', order: 8, color: '#ef4444' },
  ]

  for (const stage of stages) {
    const existing = await prisma.pipelineStage.findFirst({ where: { name: stage.name } })
    if (!existing) {
      await prisma.pipelineStage.create({ data: stage })
      console.log(`  ✓ Etapa criada: ${stage.name}`)
    } else {
      console.log(`  - Etapa já existe: ${stage.name}`)
    }
  }

  console.log('')
  console.log('✅ Seed concluído!')
  console.log('')
  console.log('👤 Usuários:')
  console.log(`   🔴 Admin:     ${admin.email}    / Admin@123`)
  console.log(`   🟢 Atendente: ${user.email} / User@123`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
