import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../services/db'
import { requireAuth, requireRole } from '../middleware/auth'

export const proxiesRouter = Router()
proxiesRouter.use(requireAuth)

// Proxies are stored at the profile level; this endpoint lists distinct proxies across the org
proxiesRouter.get('/', async (req, res, next) => {
  try {
    const profiles = await prisma.browserProfile.findMany({
      where: {
        account: { orgId: req.auth!.orgId },
        proxyHost: { not: null },
      },
      select: {
        id: true,
        proxyType: true,
        proxyHost: true,
        proxyPort: true,
        proxyUser: true,
        accountId: true,
        account: { select: { displayName: true } },
      },
    })
    return res.json({ data: profiles })
  } catch (err) {
    next(err)
  }
})

const checkProxySchema = z.object({
  type: z.enum(['http', 'socks5', 'residential']),
  host: z.string(),
  port: z.number(),
  username: z.string().optional(),
  password: z.string().optional(),
})

// Test proxy connectivity
proxiesRouter.post('/check', async (req, res, next) => {
  try {
    const body = checkProxySchema.parse(req.body)
    // Basic TCP check — in production, use an HTTP request through the proxy
    const net = await import('net')
    const start = Date.now()

    const result = await new Promise<{ reachable: boolean; latencyMs: number }>((resolve) => {
      const socket = net.createConnection({ host: body.host, port: body.port, timeout: 5000 }, () => {
        const latencyMs = Date.now() - start
        socket.destroy()
        resolve({ reachable: true, latencyMs })
      })
      socket.on('error', () => resolve({ reachable: false, latencyMs: -1 }))
      socket.on('timeout', () => {
        socket.destroy()
        resolve({ reachable: false, latencyMs: -1 })
      })
    })

    return res.json({ data: result })
  } catch (err) {
    next(err)
  }
})
