import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import type { BrowserFingerprint, ProxyConfig } from '@linkedin-rental/shared'

interface LaunchOptions {
  profileDir: string
  fingerprint: BrowserFingerprint
  proxy?: ProxyConfig
}

export class BrowserLauncher {
  private chromiumPath: string

  constructor() {
    this.chromiumPath = this.findChromium()
  }

  async launch(options: LaunchOptions): Promise<ChildProcess> {
    const { profileDir, fingerprint, proxy } = options

    // Copy fingerprint extension into the profile
    const extensionDir = this.ensureFingerprintExtension(profileDir, fingerprint)

    const args: string[] = [
      `--user-data-dir=${profileDir}`,
      `--user-agent=${fingerprint.userAgent}`,
      `--lang=${fingerprint.locale}`,
      `--window-size=${fingerprint.screen.width},${fingerprint.screen.height}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
    ]

    if (proxy && proxy.type !== 'none') {
      const proxyScheme = proxy.type === 'socks5' ? 'socks5' : 'http'
      args.push(`--proxy-server=${proxyScheme}://${proxy.host}:${proxy.port}`)
    }

    const chromiumProcess = spawn(this.chromiumPath, args, {
      detached: false,
      stdio: 'ignore',
    })

    chromiumProcess.on('error', (err) => {
      console.error('Failed to launch Chromium:', err)
    })

    return chromiumProcess
  }

  /**
   * Write the fingerprint override extension into the profile directory
   */
  private ensureFingerprintExtension(profileDir: string, fingerprint: BrowserFingerprint): string {
    const extDir = path.join(profileDir, '_fingerprint_ext')
    fs.mkdirSync(extDir, { recursive: true })

    // manifest.json
    fs.writeFileSync(
      path.join(extDir, 'manifest.json'),
      JSON.stringify(
        {
          manifest_version: 3,
          name: 'Profile Fingerprint',
          version: '1.0.0',
          description: 'Enforces browser fingerprint consistency',
          content_scripts: [
            {
              matches: ['<all_urls>'],
              js: ['override.js'],
              run_at: 'document_start',
              world: 'MAIN',
            },
          ],
        },
        null,
        2,
      ),
    )

    // override.js — inject fingerprint overrides
    const overrideScript = `
// Fingerprint overrides — injected by the desktop agent
(function() {
  'use strict';

  const fp = ${JSON.stringify(fingerprint)};

  // Navigator overrides
  Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });

  // Screen overrides
  Object.defineProperty(screen, 'width', { get: () => fp.screen.width });
  Object.defineProperty(screen, 'height', { get: () => fp.screen.height });
  Object.defineProperty(screen, 'availWidth', { get: () => fp.screen.width });
  Object.defineProperty(screen, 'availHeight', { get: () => fp.screen.height - 40 });

  // WebGL overrides
  const origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    const UNMASKED_VENDOR = 0x9245;
    const UNMASKED_RENDERER = 0x9246;
    if (param === UNMASKED_VENDOR) return fp.webglVendor;
    if (param === UNMASKED_RENDERER) return fp.webglRenderer;
    return origGetParameter.call(this, param);
  };

  // Also override WebGL2
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      const UNMASKED_VENDOR = 0x9245;
      const UNMASKED_RENDERER = 0x9246;
      if (param === UNMASKED_VENDOR) return fp.webglVendor;
      if (param === UNMASKED_RENDERER) return fp.webglRenderer;
      return origGetParameter2.call(this, param);
    };
  }

  // Canvas fingerprint noise
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      // Add subtle noise based on the fingerprint to make it consistent but unique
      const imageData = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
      const seed = fp.userAgent.length + fp.hardwareConcurrency;
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] ^= (seed + i) & 1; // Flip LSB deterministically
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return origToDataURL.apply(this, args);
  };
})();
`
    fs.writeFileSync(path.join(extDir, 'override.js'), overrideScript)

    return extDir
  }

  private findChromium(): string {
    const platform = os.platform()

    // Check for bundled Chromium first
    const bundledPath = path.join(os.homedir(), '.linkedin-manager', 'chromium')

    if (platform === 'darwin') {
      const paths = [
        path.join(bundledPath, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
      for (const p of paths) {
        if (fs.existsSync(p)) return p
      }
    } else if (platform === 'win32') {
      const paths = [
        path.join(bundledPath, 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ]
      for (const p of paths) {
        if (fs.existsSync(p)) return p
      }
    } else {
      const paths = [
        path.join(bundledPath, 'chrome'),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ]
      for (const p of paths) {
        if (fs.existsSync(p)) return p
      }
    }

    throw new Error('Chromium not found. Please install Chrome or place Chromium in ~/.linkedin-manager/chromium/')
  }
}
