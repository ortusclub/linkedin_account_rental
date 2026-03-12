import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../services/db'
import { requireAuth, requireRole } from '../middleware/auth'
import { AppError } from '../middleware/error-handler'

export const usersRouter = Router()
usersRouter.use(requireAuth)
usersRouter.use(requireRole('owner', 'admin'))

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
  temporaryPassword: z.string().min(8),
})

const updateUserSchema = z.object({
  role: z.enum(['admin', 'member']),
})

// List org members
usersRouter.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { orgId: req.auth!.orgId },
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return res.json({ data: users })
  } catch (err) {
    next(err)
  }
})

// Invite member
usersRouter.post('/invite', async (req, res, next) => {
  try {
    const body = inviteSchema.parse(req.body)
    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      throw new AppError(409, 'Email already in use')
    }

    const passwordHash = await bcrypt.hash(body.temporaryPassword, 12)
    const user = await prisma.user.create({
      data: {
        orgId: req.auth!.orgId,
        email: body.email,
        passwordHash,
        role: body.role,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    })

    return res.status(201).json({ data: user })
  } catch (err) {
    next(err)
  }
})

// Update user role
usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateUserSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user || user.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'User not found')
    }
    if (user.role === 'owner') {
      throw new AppError(403, 'Cannot change owner role')
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: body.role },
      select: { id: true, email: true, role: true, createdAt: true },
    })
    return res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

// Remove member
usersRouter.delete('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user || user.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'User not found')
    }
    if (user.role === 'owner') {
      throw new AppError(403, 'Cannot remove owner')
    }

    await prisma.user.delete({ where: { id: req.params.id } })
    return res.json({ data: { deleted: true } })
  } catch (err) {
    next(err)
  }
})
