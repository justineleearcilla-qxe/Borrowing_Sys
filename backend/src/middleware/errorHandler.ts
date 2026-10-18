import { NextFunction, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { ApiError } from '../utils/http'

interface HttpLikeError {
  status?: number
  statusCode?: number
  message?: string
  type?: string
  code?: string
}

/**
 * Prisma error codes worth translating into something a person can act on.
 *
 * The DB driver's own messages are intentionally NOT copied into the HTTP
 * response - they can contain column names, constraint names and the values
 * that were submitted. They are logged below instead, which is where a
 * developer wants them anyway.
 */
const PRISMA_KNOWN: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: 'That value is already in use. Please choose a different one.' },
  P2003: { status: 400, message: 'A related record could not be found. Please check your selection.' },
  P2004: { status: 400, message: 'The database rejected one of the submitted values.' },
  P2000: { status: 400, message: 'One of the values you sent is too long.' },
  P2011: { status: 400, message: 'A required value is missing.' },
  P2012: { status: 400, message: 'A required value is missing.' },
  P2023: { status: 400, message: 'The value you sent was in an unexpected format.' },
  P2025: { status: 404, message: 'The record you were working with no longer exists.' },
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Our own deliberately-raised errors: message is safe to show as-is.
  if (err instanceof ApiError) return res.status(err.status).json({ message: err.message })

  const e = (err ?? {}) as HttpLikeError

  if (e.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' })
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Image exceeds the 5MB size limit' })
  if (e.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ message: 'Unexpected upload field. Use "image".' })
  if (e.statusCode === 413 || e.status === 413) return res.status(413).json({ message: 'Payload too large' })

  // --- Database errors -----------------------------------------------------
  // Anything below here logs the real cause server-side and returns a
  // friendly, generic message. Raw driver text never reaches the browser.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const friendly = PRISMA_KNOWN[Number(err.code)]
    console.error('[prisma] known request error', err.code, err.message)
    if (friendly) return res.status(friendly.status).json({ message: friendly.message })
    return res.status(500).json({ message: 'Internal server error' })
  }

  // Reached when a value fails Prisma's runtime type check - e.g. NaN passed
  // as an id, or an unknown enum member. Almost always a validation gap, so
  // the user gets a 4xx rather than a mysterious 500.
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[prisma] client validation error', err.message)
    return res
      .status(400)
      .json({ message: 'Some of the submitted values were not valid. Please check your input and try again.' })
  }

  // Driver could not reach PostgreSQL at all (bad DSN, DB down, pool timeout).
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('[prisma] initialization error', err.message)
    return res
      .status(503)
      .json({ message: 'The database is temporarily unavailable. Please try again shortly.' })
  }

  console.error(err)
  return res.status(500).json({ message: 'Internal server error' })
}
