/**
 * Content script — injected into every page at document_start in MAIN world.
 * Reads fingerprint config from a JSON file written by the desktop agent,
 * then overrides all detectable browser properties.
 *
 * The fingerprint JSON is embedded by the agent when it builds the extension
 * for each profile launch. See browser-launcher.ts for the injection logic.
 */

// This file is the template. The actual fingerprint data is injected by the
// desktop agent's BrowserLauncher.ensureFingerprintExtension() method.
// See packages/agent/src/services/browser-launcher.ts

console.log('[Fingerprint Extension] Content script loaded — overrides active')
