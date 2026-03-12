import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../services/db'
import { requireAuth, requireRole } from '../middleware/auth'

export const orgRouter = Router()
orgRouter.use(requireAuth)

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
})

orgRouter.get('/', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.auth!.orgId } })
    const accountCount = await prisma.linkedInAccount.count({ where: { orgId: req.auth!.orgId } })
    const userCount = await prisma.user.count({ where: { orgId: req.auth!.orgId } })
    return res.json({ data: { ...org, accountCount, userCount } })
  } catch (err) {
    next(err)
  }
})

orgRouter.patch('/', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const body = updateOrgSchema.parse(req.body)
    const org = await prisma.organization.update({
      where: { id: req.auth!.orgId },
      data: body,
    })
    return res.json({ data: org })
  } catch (err) {
    next(err)
  }
})
