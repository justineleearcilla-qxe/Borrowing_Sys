import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import { env } from './config/env'
import { ApiError } from './utils/http'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import categoryRoutes from './routes/categories'
import itemRoutes from './routes/items'
import loanRoutes from './routes/loans'
import reservationRoutes from './routes/reservations'
import waitlistRoutes from './routes/waitlist'
import notificationRoutes from './routes/notifications'
import creditRoutes from './routes/credits'
import dashboardRoutes from './routes/dashboard'
import reportRoutes from './routes/reports'

export function createApp() {
  const app = express()

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  const origins = env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  app.use(cors({ origin: origins.length ? origins : true, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(morgan('dev'))
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)))

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRoutes)
  app.use('/api/categories', categoryRoutes)
  app.use('/api/items', itemRoutes)
  app.use('/api/loans', loanRoutes)
  app.use('/api/reservations', reservationRoutes)
  app.use('/api/waitlist', waitlistRoutes)
  app.use('/api/notifications', notificationRoutes)
  app.use('/api/credits', creditRoutes)
  app.use('/api/dashboard', dashboardRoutes)
  app.use('/api/reports', reportRoutes)

  app.use((_req, _res, next) => next(new ApiError(404, 'Not found')))
  app.use(errorHandler)

  return app
}
