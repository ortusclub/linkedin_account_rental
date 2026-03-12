export const PLAN_LIMITS = {
  free: { maxAccounts: 5, maxUsers: 2 },
  pro: { maxAccounts: 50, maxUsers: 10 },
  enterprise: { maxAccounts: 500, maxUsers: 100 },
} as const

export const SESSION_MUTEX_TTL_SECONDS = 3600 * 4 // 4 hours max session
export const JWT_ACCESS_TOKEN_EXPIRY = '15m'
export const JWT_REFRESH_TOKEN_EXPIRY = '7d'
export const PROFILE_S3_PREFIX = 'profiles/'
export const EXTENSION_S3_PREFIX = 'extensions/'
