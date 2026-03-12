import { Router } from 'express'
import { prisma } from '../services/db'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/error-handler'
import { acquireSessionMutex, releaseSessionMutex, getActiveSession } from '../services/redis'
import { getProfileDownloadUrl, getProfileUploadUrl } from '../services/s3'
import { SESSION_MUTEX_TTL_SECONDS } from '@linkedin-rental/shared'
import type { BrowserFingerprint, ProxyConfig } from '@linkedin-rental/shared'

export const sessionsRouter = Router()
sessionsRouter.use(requireAuth)

// Launch a browser session — returns signed download URL + fingerprint + proxy
sessionsRouter.post('/:accountId/launch', async (req, res, next) => {
  try {
    const { accountId } = req.params
    const { userId, orgId } = req.auth!

    // Verify access
    const account = await prisma.linkedInAccount.findUnique({
      where: { id: accountId },
      include: { profile: true },
    })
    if (!account || account.orgId !== orgId) {
      throw new AppError(404, 'Account not found')
    }

    // Check assignment (admins/owners bypass)
    if (req.auth!.role === 'member') {
      const assignment = await prisma.accountAssignment.findUnique({
        where: { userId_accountId: { userId, accountId } },
      })
      if (!assignment) {
        throw new AppError(403, 'You are not assigned to this account')
      }
    }

    // Check for active session
    const activeSessionId = await getActiveSession(accountId)
    if (activeSessionId) {
      throw new AppError(409, 'Another session is already active for this account')
    }

    // Create session record
    const session = await prisma.browserSession.create({
      data: {
        accountId,
        userId,
        ipAddress: req.ip,
        status: 'running',
      },
    })

    // Acquire mutex
    const acquired = await acquireSessionMutex(accountId, session.id, SESSION_MUTEX_TTL_SECONDS)
    if (!acquired) {
      await prisma.browserSession.update({
        where: { id: session.id },
        data: { status: 'error', endedAt: new Date() },
      })
      throw new AppError(409, 'Failed to acquire session lock')
    }

    // Update last launched
    await prisma.browserProfile.update({
      where: { accountId },
      data: { lastLaunched: new Date() },
    })

    // Generate signed download URL
    const downloadUrl = await getProfileDownloadUrl(accountId)

    const profile = account.profile!
    const fingerprint = profile.fingerprint as unknown as BrowserFingerprint
    const proxy: ProxyConfig | undefined =
      profile.proxyType && profile.proxyType !== 'none'
        ? {
            type: profile.proxyType as ProxyConfig['type'],
            host: profile.proxyHost!,
            port: profile.proxyPort!,
            username: profile.proxyUser || undefined,
            password: profile.proxyPass || undefined,
          }
        : undefined

    return res.json({
      data: {
        sessionId: session.id,
        downloadUrl,
        fingerprint,
        proxy,
      },
    })
  } catch (err) {
    next(err)
  }
})

// Sync profile back — returns signed upload URL
sessionsRouter.post('/:accountId/sync', async (req, res, next) => {
  try {
    const { accountId } = req.params

    const account = await prisma.linkedInAccount.findUnique({ where: { id: accountId } })
    if (!account || account.orgId !== req.auth!.orgId) {
      throw new AppError(404, 'Account not found')
    }

    const uploadUrl = await getProfileUploadUrl(accountId)

    // Update installed extensions if provided
    if (req.body.installedExtensions) {
      await prisma.browserProfile.update({
        where: { accountId },
        data: {
          installedExtensions: req.body.installedExtensions,
          lastSynced: new Date(),
          profileSizeMb: req.body.profileSizeMb,
        },
      })
    }

    return res.json({ data: { uploadUrl } })
  } catch (err) {
    next(err)
  }
})

// Stop session — release mutex
sessionsRouter.post('/:accountId/stop', async (req, res, next) => {
  try {
    const { accountId } = req.params
    const { sessionId } = req.body

    if (!sessionId) {
      throw new AppError(400, 'sessionId is required')
    }

    await releaseSessionMutex(accountId, sessionId)

    await prisma.browserSession.update({
      where: { id: sessionId },
      data: { status: 'closed', endedAt: new Date() },
    })

    return res.json({ data: { stopped: true } })
  } catch (err) {
    next(err)
  }
})

// List session history
sessionsRouter.get('/:accountId/history', async (req, res, next) => {
  try {
    const { accountId } = req.params
    const sessions = await prisma.browserSession.findMany({
      where: { accountId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    return res.json({ data: sessions })
  } catch (err) {
    next(err)
  }
})
