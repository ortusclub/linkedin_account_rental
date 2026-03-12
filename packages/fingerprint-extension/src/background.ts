/**
 * Background service worker — handles webRequest header overrides
 * (e.g., User-Agent header enforcement) that content scripts cannot do.
 *
 * The desktop agent writes fingerprint config into the extension before launch.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Fingerprint Extension] Background service worker installed')
})
