import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { RequestHandler } from 'express'
import { env } from '../config/env'
import { ApiError } from '../utils/http'

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true })
    cb(null, env.UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`)
  },
})

const uploader = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true)
    cb(new ApiError(400, 'Only image files are allowed'))
  },
}).single('image')

export const uploadImage: RequestHandler = (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) {
      if (err instanceof ApiError) return next(err)
      const message = (err as { message?: string }).message ?? 'Upload failed'
      return next(new ApiError(400, message))
    }
    next()
  })
}
