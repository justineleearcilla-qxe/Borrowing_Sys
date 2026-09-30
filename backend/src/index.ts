import 'dotenv/config'
import fs from 'fs'
import cron from 'node-cron'
import { createApp } from './app'
import { env } from './config/env'
import { prisma } from './lib/prisma'
import { runMaintenanceSweep } from './services/cron'

async function main() {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true })

  await runMaintenanceSweep()
  cron.schedule('0 * * * *', () => {
    void runMaintenanceSweep().catch((e) => console.error('[cron] sweep failed', e))
  })

  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`EquipHub API listening on http://localhost:${env.PORT}`)
  })
}

main()
  .catch(async (e) => {
    console.error('Fatal startup error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
