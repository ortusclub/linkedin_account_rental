import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as tar from 'tar'
import type { LaunchResponse } from '@linkedin-rental/shared'

const BASE_DIR = path.join(os.homedir(), '.linkedin-manager', 'profiles')

export class ProfileManager {
  constructor() {
    fs.mkdirSync(BASE_DIR, { recursive: true })
  }

  /**
   * Call the API to register a session launch and get download URL + fingerprint + proxy
   */
  async requestLaunch(accountId: string, apiToken: string): Promise<LaunchResponse> {
    const apiBase = this.getApiBase()
    const res = await fetch(`${apiBase}/api/v1/sessions/${accountId}/launch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || 'Failed to launch session')
    }

    const body = await res.json()
    return body.data as LaunchResponse
  }

  /**
   * Download the profile archive from S3 and extract it locally
   */
  async downloadProfile(downloadUrl: string, accountId: string): Promise<string> {
    const profileDir = path.join(BASE_DIR, accountId)

    // Clean up any existing profile dir
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true })
    }
    fs.mkdirSync(profileDir, { recursive: true })

    // Download the archive
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      // No existing profile — start fresh
      console.log('No existing profile found, starting fresh')
      return profileDir
    }

    const archivePath = path.join(BASE_DIR, `${accountId}.tar.gz`)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(archivePath, buffer)

    // Extract
    await tar.extract({
      file: archivePath,
      cwd: profileDir,
    })

    // Clean up archive
    fs.unlinkSync(archivePath)

    return profileDir
  }

  /**
   * Compress profile dir and upload back to S3, then notify the API
   */
  async syncProfile(
    accountId: string,
    profileDir: string,
    apiToken: string,
    sessionId: string,
  ): Promise<void> {
    const apiBase = this.getApiBase()

    // Get upload URL
    const syncRes = await fetch(`${apiBase}/api/v1/sessions/${accountId}/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        installedExtensions: this.detectExtensions(profileDir),
      }),
    })

    if (!syncRes.ok) {
      throw new Error('Failed to get sync upload URL')
    }

    const { data } = await syncRes.json()
    const uploadUrl = data.uploadUrl

    // Compress profile
    const archivePath = path.join(BASE_DIR, `${accountId}-upload.tar.gz`)
    await tar.create(
      { gzip: true, file: archivePath, cwd: profileDir },
      ['.'],
    )

    // Upload to S3
    const archiveBuffer = fs.readFileSync(archivePath)
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/gzip' },
      body: archiveBuffer,
    })

    // Clean up
    fs.unlinkSync(archivePath)
    fs.rmSync(profileDir, { recursive: true })

    // Notify API session is done
    await fetch(`${apiBase}/api/v1/sessions/${accountId}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })
  }

  /**
   * Scan the profile's Extensions directory to detect installed extensions
   */
  private detectExtensions(profileDir: string): Array<{ id: string; name: string; version: string }> {
    const extDir = path.join(profileDir, 'Default', 'Extensions')
    if (!fs.existsSync(extDir)) return []

    const extensions: Array<{ id: string; name: string; version: string }> = []

    for (const extId of fs.readdirSync(extDir)) {
      const extPath = path.join(extDir, extId)
      if (!fs.statSync(extPath).isDirectory()) continue

      // Each extension has version subdirectories
      const versions = fs.readdirSync(extPath).filter((v) =>
        fs.statSync(path.join(extPath, v)).isDirectory(),
      )
      const latestVersion = versions.sort().pop()
      if (!latestVersion) continue

      // Try to read manifest.json
      const manifestPath = path.join(extPath, latestVersion, 'manifest.json')
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          extensions.push({
            id: extId,
            name: manifest.name || extId,
            version: manifest.version || latestVersion,
          })
        } catch {
          extensions.push({ id: extId, name: extId, version: latestVersion })
        }
      }
    }

    return extensions
  }

  private getApiBase(): string {
    // In production, read from config file; for now, env var or default
    return process.env.API_URL || 'http://localhost:3001'
  }
}
