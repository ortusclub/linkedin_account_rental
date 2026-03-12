import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../services/db'
import { requireAuth, requireRole } from '../middleware/auth'
import { AppError } from '../middleware/error-handler'
import { deleteProfile, profileKey } from '../services/s3'
import { generateFingerprint } from '@linkedin-rental/shared'

export const accountsRouter = Router()
accountsRouter.use(requireAuth)

const createAccountSchema = z.object({
  displayName: z.string().min(1),
  linkedinEmail: z.string().email().optional(),
  notes: z.string().optional(),
  proxy: z
    .object({
      type: z.enum(['http', 'socks5', 'residential', 'none']),
      host: z.string(),
      port: z.number(),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
})

const updateAccountSchema = z.object({
  displayName: z.string().min(1).optional(),
  linkedinEmail: z.string().email().optional(),
  status: z.enum(['active', 'suspended', 'needs_reauth']).optional(),
  notes: z.string().optional(),
  proxy: z
    .object({
      type: z.enum(['http', 'socks5', 'residential', 'none']),
      host: z.string(),
      port: z.number(),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
})

const assignSchema = z.object({
  userIds: z.array(z.string().uuid()),
  permission: z.enum(['use', 'manage']).default('use'),
})

// List accounts (members see only assigned accounts, admins see all)
accountsRouter.get('/', async (req, res, next) => {
  try {
    const { orgId, userId, role } = req.auth!

    if (role === 'member') {
      const assignments = await prisma.accountAssignment.findMany({
        where: { userId },
        include: { account: { include: { profile: true } } },
      })
      return res.json({ data: assignments.map((a) => a.account) })
    }

    const accounts = await prisma.linkedInAccount.findMany({
      where: { orgId },
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ data: accounts })
  } catch (err) {
    next(err)
  }
})

// Get single account
accountsRouter.get('/:id', async (req, res, next) => {
  try {
    const account = await prisma.linkedInAccount.findUnique({
      where: { id: req.params.id },
      include: { profile: true, assignments: { include: { user: true } } },
    })
    if (!account || account.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'Account not found')
    }
    return res.json({ data: account })
  } catch (err) {
    next(err)
  }
})

// Create account + browser profile
accountsRouter.post('/', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const body = createAccountSchema.parse(req.body)
    const { orgId } = req.auth!

    // Check account limit
    const org = await prisma.organization.findUnique({ where: { id: orgId } })
    const count = await prisma.linkedInAccount.count({ where: { orgId } })
    if (count >= org!.maxAccounts) {
      throw new AppError(403, `Account limit reached (${org!.maxAccounts})`)
    }

    const fingerprint = generateFingerprint()

    const account = await prisma.linkedInAccount.create({
      data: {
        orgId,
        displayName: body.displayName,
        linkedinEmail: body.linkedinEmail,
        notes: body.notes,
        profile: {
          create: {
            fingerprint: fingerprint as any,
            profileS3Key: profileKey(crypto.randomUUID()), // Will be set properly on first sync
            proxyType: body.proxy?.type,
            proxyHost: body.proxy?.host,
            proxyPort: body.proxy?.port,
            proxyUser: body.proxy?.username,
            proxyPass: body.proxy?.password,
          },
        },
      },
      include: { profile: true },
    })

    // Update the S3 key to use the actual account ID
    await prisma.browserProfile.update({
      where: { accountId: account.id },
      data: { profileS3Key: profileKey(account.id) },
    })

    return res.status(201).json({ data: account })
  } catch (err) {
    next(err)
  }
})

// Update account
accountsRouter.patch('/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const body = updateAccountSchema.parse(req.body)
    const account = await prisma.linkedInAccount.findUnique({ where: { id: req.params.id } })
    if (!account || account.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'Account not found')
    }

    const updated = await prisma.linkedInAccount.update({
      where: { id: req.params.id },
      data: {
        displayName: body.displayName,
        linkedinEmail: body.linkedinEmail,
        status: body.status,
        notes: body.notes,
      },
      include: { profile: true },
    })

    // Update proxy if provided
    if (body.proxy) {
      await prisma.browserProfile.update({
        where: { accountId: req.params.id },
        data: {
          proxyType: body.proxy.type,
          proxyHost: body.proxy.host,
          proxyPort: body.proxy.port,
          proxyUser: body.proxy.username,
          proxyPass: body.proxy.password,
        },
      })
    }

    return res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

// Delete account
accountsRouter.delete('/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const account = await prisma.linkedInAccount.findUnique({ where: { id: req.params.id } })
    if (!account || account.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'Account not found')
    }

    await deleteProfile(account.id)
    await prisma.linkedInAccount.delete({ where: { id: req.params.id } })
    return res.json({ data: { deleted: true } })
  } catch (err) {
    next(err)
  }
})

// Assign users to account
accountsRouter.post('/:id/assign', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const body = assignSchema.parse(req.body)
    const account = await prisma.linkedInAccount.findUnique({ where: { id: req.params.id } })
    if (!account || account.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'Account not found')
    }

    const assignments = await Promise.all(
      body.userIds.map((userId) =>
        prisma.accountAssignment.upsert({
          where: { userId_accountId: { userId, accountId: req.params.id } },
          update: { permission: body.permission },
          create: { userId, accountId: req.params.id, permission: body.permission },
        }),
      ),
    )

    return res.json({ data: assignments })
  } catch (err) {
    next(err)
  }
})

// Remove assignment
accountsRouter.delete('/:id/assign/:userId', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    await prisma.accountAssignment.delete({
      where: { userId_accountId: { userId: req.params.userId, accountId: req.params.id } },
    })
    return res.json({ data: { deleted: true } })
  } catch (err) {
    next(err)
  }
})
