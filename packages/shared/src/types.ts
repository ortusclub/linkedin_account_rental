// ── Organization ──

export interface Organization {
  id: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  maxAccounts: number
  createdAt: string
  updatedAt: string
}

// ── User ──

export type UserRole = 'owner' | 'admin' | 'member'

export interface User {
  id: string
  orgId: string
  email: string
  role: UserRole
  createdAt: string
}

// ── LinkedIn Account ──

export type AccountStatus = 'active' | 'suspended' | 'needs_reauth'

export interface LinkedInAccount {
  id: string
  orgId: string
  displayName: string
  linkedinEmail?: string
  status: AccountStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Browser Profile ──

export interface BrowserFingerprint {
  userAgent: string
  platform: string
  screen: { width: number; height: number }
  webglVendor: string
  webglRenderer: string
  timezone: string
  locale: string
  hardwareConcurrency: number
  deviceMemory: number
  fonts: string[]
}

export type ProxyType = 'http' | 'socks5' | 'residential' | 'none'

export interface ProxyConfig {
  type: ProxyType
  host: string
  port: number
  username?: string
  password?: string
}

export interface InstalledExtension {
  id: string
  name: string
  chromeStoreId?: string
  version: string
}

export interface BrowserProfile {
  id: string
  accountId: string
  fingerprint: BrowserFingerprint
  proxy?: ProxyConfig
  profileS3Key?: string
  profileSizeMb?: number
  installedExtensions: InstalledExtension[]
  lastLaunched?: string
  lastSynced?: string
  createdAt: string
  updatedAt: string
}

// ── Account Assignment ──

export type AssignmentPermission = 'use' | 'manage'

export interface AccountAssignment {
  id: string
  userId: string
  accountId: string
  permission: AssignmentPermission
  assignedAt: string
}

// ── Browser Session ──

export type SessionStatus = 'running' | 'closed' | 'error'

export interface BrowserSession {
  id: string
  accountId: string
  userId: string
  startedAt: string
  endedAt?: string
  ipAddress?: string
  status: SessionStatus
}

// ── API Responses ──

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  error: string
  message: string
  statusCode: number
}

export interface LaunchResponse {
  sessionId: string
  downloadUrl: string
  fingerprint: BrowserFingerprint
  proxy?: ProxyConfig
}

export interface SyncResponse {
  uploadUrl: string
}

// ── Auth ──

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  orgName: string
}
