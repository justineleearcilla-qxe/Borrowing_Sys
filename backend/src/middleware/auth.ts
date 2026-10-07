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

/**
 * Roles allowed to manage reservations (approve / reject / convert to loan).
 *
 * SECURITY NOTE: this is deliberately wider than requireAdmin because the
 * spec asks for "Admin/teacher can approve". Drop 'FACULTY' here if your
 * school wants reservations to be an admin-only action - nothing else in the
 * codebase needs to change.
 */
const STAFF_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'FACULTY'])

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const role = req.user?.role
  if (!role || !STAFF_ROLES.has(role)) {
    return next(new ApiError(403, 'Equipment desk access required'))
  }
  next()
}
