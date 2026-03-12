import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

const SESSION_MUTEX_PREFIX = 'session:mutex:'

export async function acquireSessionMutex(accountId: string, sessionId: string, ttlSeconds: number): Promise<boolean> {
  const key = `${SESSION_MUTEX_PREFIX}${accountId}`
  const result = await redis.set(key, sessionId, 'EX', ttlSeconds, 'NX')
  return result === 'OK'
}

export async function releaseSessionMutex(accountId: string, sessionId: string): Promise<boolean> {
  const key = `${SESSION_MUTEX_PREFIX}${accountId}`
  const current = await redis.get(key)
  if (current === sessionId) {
    await redis.del(key)
    return true
  }
  return false
}

export async function getActiveSession(accountId: string): Promise<string | null> {
  const key = `${SESSION_MUTEX_PREFIX}${accountId}`
  return redis.get(key)
}
