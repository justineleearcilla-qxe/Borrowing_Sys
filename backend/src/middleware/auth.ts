import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/http'

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required')
    let payload: { sub?: string | number }
    try {
      payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { sub: string | number }
    } catch {
      throw new ApiError(401, 'Invalid or expired session. Please log in again.')
    }
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } })
    if (!user) throw new ApiError(401, 'Account no longer exists')
    req.user = user
    next()
  } catch (e) {
    next(e)
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return next(new ApiError(403, 'Admin access required'))
  next()
}
