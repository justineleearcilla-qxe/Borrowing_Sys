import { NextFunction, Request, Response } from 'express'
import { ApiError } from '../utils/http'

/**
 * Dependency-free fixed-window rate limiter, used to slow down credential
 * stuffing on /api/auth/login and /api/auth/register.
 *
 * Deliberately NOT in-memory-map-forever: entries are dropped as soon as the
 * window rolls over, so memory stays bounded by the number of distinct
 * keys seen in the last WINDOW_MS.
 *
 * For multi-process deployments you would swap this for a shared store
 * (Redis); for the single Node process this app runs, a Map is correct.
 */

interface Options {
  windowMs: number
  max: number
  /** Key that identifies the caller. Defaults to IP address. */
  keyFn?: (req: Request) => string
  message?: string
}

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// Opportunistic sweep so an attacker rotating keys cannot grow the Map forever.
let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k)
}

export function rateLimit(opts: Options) {
  const windowMs = opts.windowMs
  const max = opts.max
  const keyFn = opts.keyFn ?? ((req: Request) => req.ip || req.socket.remoteAddress || 'unknown')
  const message = opts.message ?? 'Too many attempts. Please wait a few minutes and try again.'

  return function limiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now()
    sweep(now)
    const key = keyFn(req)
    let bucket = store.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      store.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return next(new ApiError(429, message))
    }
    next()
  }
}
