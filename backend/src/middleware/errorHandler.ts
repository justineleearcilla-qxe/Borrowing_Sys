import { NextFunction, Request, Response } from 'express'
import { ApiError } from '../utils/http'

interface HttpLikeError {
  status?: number
  statusCode?: number
  message?: string
  type?: string
  code?: string
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) return res.status(err.status).json({ message: err.message })

  const e = (err ?? {}) as HttpLikeError

  if (e.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' })
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Image exceeds the 5MB size limit' })
  if (e.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ message: 'Unexpected upload field. Use "image".' })
  if (e.statusCode === 413 || e.status === 413) return res.status(413).json({ message: 'Payload too large' })

  console.error(err)
  return res.status(500).json({ message: 'Internal server error' })
}
