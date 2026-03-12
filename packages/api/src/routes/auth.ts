import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../services/db'
import { JWT_ACCESS_TOKEN_EXPIRY, JWT_REFRESH_TOKEN_EXPIRY } from '@linkedin-rental/shared'
import type { AuthPayload } from '../middleware/auth'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

function generateTokens(payload: AuthPayload) {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: JWT_ACCESS_TOKEN_EXPIRY,
  })
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: JWT_REFRESH_TOKEN_EXPIRY,
  })
  return { accessToken, refreshToken }
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body)
    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      return res.status(409).json({ error: 'conflict', message: 'Email already registered' })
    }

    const passwordHash = await bcrypt.hash(body.password, 12)

    const org = await prisma.organization.create({
      data: { name: body.orgName },
    })

    const user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: body.email,
        passwordHash,
        role: 'owner',
      },
    })

    const tokens = generateTokens({ userId: user.id, orgId: org.id, role: user.role })
    return res.status(201).json({ data: { user: { id: user.id, email: user.email, role: user.role }, org: { id: org.id, name: org.name }, ...tokens } })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' })
    }

    const tokens = generateTokens({ userId: user.id, orgId: user.orgId, role: user.role })
    return res.json({ data: { user: { id: user.id, email: user.email, role: user.role }, ...tokens } })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      return res.status(401).json({ error: 'unauthorized', message: 'Missing refresh token' })
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as AuthPayload
    const tokens = generateTokens({ userId: payload.userId, orgId: payload.orgId, role: payload.role })
    return res.json({ data: tokens })
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid refresh token' })
  }
})
