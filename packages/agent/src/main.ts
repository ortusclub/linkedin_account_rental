/**
 * Desktop Agent — Electron main process
 *
 * Responsibilities:
 * 1. Authenticate with the API server
 * 2. List assigned LinkedIn accounts
 * 3. Launch Chromium with downloaded profile + fingerprint + proxy
 * 4. Sync profile back to S3 on browser close
 */

// This is the entry point for the Electron main process.
// Full implementation requires electron-vite setup — this file defines the architecture.

import { app, BrowserWindow, ipcMain } from 'electron'
import { ProfileManager } from './services/profile-manager'
import { BrowserLauncher } from './services/browser-launcher'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: __dirname + '/preload.js',
    },
  })

  // In dev, load from vite dev server; in prod, load built HTML
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000')
  } else {
    mainWindow.loadFile('dist/renderer/index.html')
  }
})

// IPC handlers for renderer → main process communication

const profileManager = new ProfileManager()
const browserLauncher = new BrowserLauncher()

ipcMain.handle('launch-account', async (_event, accountId: string, apiToken: string) => {
  try {
    // 1. Call API to get download URL, fingerprint, proxy
    const launchData = await profileManager.requestLaunch(accountId, apiToken)

    // 2. Download and extract profile
    const profileDir = await profileManager.downloadProfile(launchData.downloadUrl, accountId)

    // 3. Launch Chromium with profile
    const chromiumProcess = await browserLauncher.launch({
      profileDir,
      fingerprint: launchData.fingerprint,
      proxy: launchData.proxy,
    })

    // 4. Wait for browser to close
    await new Promise<void>((resolve) => {
      chromiumProcess.on('exit', () => resolve())
    })

    // 5. Sync profile back
    await profileManager.syncProfile(accountId, profileDir, apiToken, launchData.sessionId)

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
