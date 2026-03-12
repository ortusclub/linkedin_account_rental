# LinkedIn Account Management SaaS — MVP Spec

## 1. Product Overview

A multi-tenant SaaS where teams manage multiple LinkedIn accounts through persistent browser profiles — similar to GoLogin's model. Each profile retains cookies, localStorage, fingerprint parameters, and proxy configuration so LinkedIn sees a consistent device across sessions — eliminating new-device detection and CAPTCHAs.

Users install a lightweight desktop agent (Electron app wrapping a managed Chromium build). When they click "Launch" in the dashboard, the agent downloads the profile from the server, opens a real local browser window with the correct fingerprint + proxy, and syncs the profile back on close. Users can install their own Chrome extensions (e.g. LinkedIn automation tools) into each profile.

**Core value prop:** Open any assigned LinkedIn account in one click, with a real local browser, zero fingerprint drift, and full extension support.

---

## 2. High-Level Architecture

```
┌─────────────────┐        ┌──────────────────┐       ┌──────────────────┐
│  Desktop Agent   │        │   API Server     │◄─────►│   PostgreSQL     │
│  (Electron +     │◄──────►│   (Node/Express)  │       │                  │
│   Chromium)      │  REST  └────────┬─────────┘       └──────────────────┘
└────────┬────────┘                 │
         │                          ├──────►  Redis (sessions, rate limits)
    Launches local                  │
    Chromium with                   ├──────►  S3 / MinIO (profile storage)
    profile + proxy                 │
         │                 ┌────────▼─────────┐
         │                 │  Web Dashboard    │
         │                 │  (React SPA)      │
         │                 │  served by API    │
         │                 └──────────────────┘
         │
┌────────▼────────┐
│  Managed Chromium│
│  (real browser   │
│   window on      │
│   user's machine)│
└─────────────────┘
```

### Components

| Component | Tech | Role |
|---|---|---|
| **API Server** | Node.js + Express (TypeScript) | Auth, CRUD, profile orchestration, signed URL generation |
| **Database** | PostgreSQL 15+ | Accounts, profiles, assignments, audit log |
| **Cache** | Redis | Session tokens, active-session mutex, rate limiting |
| **Profile Storage** | S3-compatible (AWS S3 or MinIO for self-host) | Encrypted browser profile archives (cookies, localStorage, IndexedDB, extensions) |
| **Desktop Agent** | Electron (TypeScript) | Local app that downloads profiles, launches Chromium, syncs back on close |
| **Managed Chromium** | Chromium build bundled with agent (or system Chrome) | The actual browser the user interacts with — real window, real extensions |
| **Web Dashboard** | React + Vite + TailwindCSS | Account management, team admin, proxy config (served by API server) |
| **Reverse Proxy** | Caddy or Nginx | TLS termination |

---

## 3. Database Schema

### 3.1 `organizations`
```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    plan            TEXT NOT NULL DEFAULT 'free',  -- free | pro | enterprise
    max_accounts    INT NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 `users`
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org ON users(org_id);
```

### 3.3 `linkedin_accounts`
```sql
CREATE TABLE linkedin_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    display_name    TEXT NOT NULL,           -- e.g. "John Doe — Sales"
    linkedin_email  TEXT,                    -- LinkedIn login email (encrypted at rest)
    status          TEXT NOT NULL DEFAULT 'active',  -- active | suspended | needs_reauth
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_la_org ON linkedin_accounts(org_id);
```

### 3.4 `browser_profiles`
One-to-one with `linkedin_accounts`.
```sql
CREATE TABLE browser_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL UNIQUE REFERENCES linkedin_accounts(id) ON DELETE CASCADE,

    -- Fingerprint parameters (stored as JSONB for flexibility)
    fingerprint     JSONB NOT NULL DEFAULT '{}',
    /*  fingerprint contains:
        {
          "userAgent": "...",
          "screen": { "width": 1920, "height": 1080 },
          "platform": "Win32",
          "webglVendor": "...",
          "webglRenderer": "...",
          "timezone": "America/New_York",
          "locale": "en-US",
          "hardwareConcurrency": 8,
          "deviceMemory": 8,
          "fonts": ["Arial", "Helvetica", ...]
        }
    */

    -- Proxy config
    proxy_type      TEXT,           -- http | socks5 | residential | none
    proxy_host      TEXT,
    proxy_port      INT,
    proxy_user      TEXT,
    proxy_pass      TEXT,           -- encrypted at rest

    -- Storage location
    profile_s3_key  TEXT,           -- S3 key for the profile archive (.tar.gz)
    profile_size_mb NUMERIC(6,2),

    -- Extension tracking
    installed_extensions JSONB DEFAULT '[]',
    /*  installed_extensions contains:
        [
          { "id": "ext-uuid", "name": "LinkedIn Helper 2", "chromeStoreId": "...", "version": "4.2.1" },
          { "id": "ext-uuid", "name": "Dux-Soup", "chromeStoreId": "...", "version": "8.0.0" }
        ]
        Extensions live inside the profile user-data dir and are synced with it.
        This field is metadata only — the actual extension files are in the profile blob.
    */

    -- Session state
    last_launched    TIMESTAMPTZ,
    last_synced      TIMESTAMPTZ,   -- last time profile was uploaded back to S3

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 `account_assignments`
Maps users to the LinkedIn accounts they can access.
```sql
CREATE TABLE account_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    permission      TEXT NOT NULL DEFAULT 'use',  -- use | manage
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, account_id)
);
CREATE INDEX idx_aa_user ON account_assignments(user_id);
CREATE INDEX idx_aa_account ON account_assignments(account_id);
```

### 3.6 `sessions` (browser sessions / audit log)
```sql
CREATE TABLE browser_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES linkedin_accounts(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    ip_address      INET,
    status          TEXT NOT NULL DEFAULT 'running'  -- running | closed | error
);
CREATE INDEX idx_bs_account ON browser_sessions(account_id);
```

---

## 4. API Endpoints

All endpoints prefixed with `/api/v1`. Auth via `Authorization: Bearer <jwt>`.

### 4.1 Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create org + owner user |
| POST | `/auth/login` | Returns JWT + refresh token |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |

### 4.2 Organization
| Method | Path | Description |
|---|---|---|
| GET | `/org` | Get current org details |
| PATCH | `/org` | Update org name/settings |

### 4.3 Users (admin+)
| Method | Path | Description |
|---|---|---|
| GET | `/users` | List org members |
| POST | `/users/invite` | Invite member by email |
| PATCH | `/users/:id` | Update role |
| DELETE | `/users/:id` | Remove member |

### 4.4 LinkedIn Accounts
| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | List accounts (filtered by assignment for members) |
| POST | `/accounts` | Create account + generate browser profile |
| GET | `/accounts/:id` | Get account detail + profile metadata |
| PATCH | `/accounts/:id` | Update display name, notes, proxy |
| DELETE | `/accounts/:id` | Delete account + profile blob |
| POST | `/accounts/:id/assign` | Assign user(s) to account |
| DELETE | `/accounts/:id/assign/:userId` | Remove assignment |

### 4.5 Browser Sessions
| Method | Path | Description |
|---|---|---|
| POST | `/accounts/:id/launch` | Register session start, return signed S3 download URL for profile |
| POST | `/accounts/:id/sync` | Agent calls this on browser close — returns signed S3 upload URL to sync profile back |
| POST | `/accounts/:id/stop` | Mark session ended (called by agent after upload completes) |
| GET | `/accounts/:id/sessions` | List session history |

### 4.6 Extensions
| Method | Path | Description |
|---|---|---|
| POST | `/accounts/:id/extensions` | Upload a `.crx` or `.zip` extension to inject into the profile |
| GET | `/accounts/:id/extensions` | List installed extensions for this profile |
| DELETE | `/accounts/:id/extensions/:extId` | Remove extension from profile |

### 4.7 Proxy Management
| Method | Path | Description |
|---|---|---|
| GET | `/proxies` | List saved proxies for the org |
| POST | `/proxies` | Add proxy |
| DELETE | `/proxies/:id` | Remove proxy |
| POST | `/proxies/:id/check` | Test proxy connectivity + speed |

---

## 5. Browser Profile Lifecycle

```
CREATE ACCOUNT (server-side)
     │
     ▼
Generate fingerprint (randomized but internally consistent params)
     │
     ▼
Save fingerprint to browser_profiles table
     │
     ▼
Create empty Chromium user-data dir, tar.gz, upload to S3
     │
     ▼
READY — profile available for launch

═══════════════════════════════════════════════════════

LAUNCH SESSION (desktop agent)
     │
     ▼
User clicks "Launch" in dashboard or agent UI
     │
     ▼
Agent calls POST /accounts/:id/launch
     │
     ▼
Server checks Redis mutex (no other active session for this account)
     │
     ▼
Server returns: signed S3 download URL + fingerprint JSON + proxy config
     │
     ▼
Agent downloads profile archive from S3 → extracts to local temp dir
     │
     ▼
Agent launches Chromium with:
  --user-data-dir=<extracted profile dir>
  --proxy-server=<proxy>
  --load-extension=<extensions in profile dir>
  Fingerprint enforced via Chromium launch flags + bundled
  fingerprint-override extension (injected automatically)
     │
     ▼
User has a real browser window — installs extensions, browses LinkedIn, etc.
     │
     ▼
ON BROWSER CLOSE:
  Agent calls POST /accounts/:id/sync → gets signed S3 upload URL
  Agent tar.gz's the user-data dir (now includes any new extensions) → uploads to S3
  Agent calls POST /accounts/:id/stop → server releases Redis mutex
  Agent cleans up local temp dir
```

### Fingerprint Enforcement

The agent bundles a **fingerprint-override extension** that is automatically loaded into every profile. This extension uses Chrome's extension APIs to override detectable properties at a level that cannot be detected by page JavaScript.

| Property | Enforcement Method |
|---|---|
| User-Agent | Chromium launch flag `--user-agent` + extension `webRequest` header override |
| Screen resolution | Extension content script overrides `screen.width/height` |
| WebGL vendor/renderer | Extension overrides `getParameter` on WebGL context |
| Canvas fingerprint | Extension injects subtle deterministic noise into `toDataURL` / `toBlob` |
| Timezone | `--timezone` launch flag (Chromium supports this natively) |
| Locale | `--lang` launch flag |
| navigator.platform | Extension content script override |
| navigator.hardwareConcurrency | Extension content script override |
| navigator.deviceMemory | Extension content script override |
| AudioContext fingerprint | Extension overrides `getFloatFrequencyData` |
| ClientRects | Extension adds micro-noise to `getBoundingClientRect` |
| Font enumeration | Extension limits `document.fonts.check()` to fingerprint's font list |

### Extension Support

Extensions are first-class in this architecture because the user gets a real Chromium window:

- **User-installed extensions:** Users install extensions normally (Chrome Web Store or .crx upload). They persist in the profile's `Extensions/` directory and are synced back to S3 on close.
- **Org-managed extensions:** Admins can upload `.crx` files via the API and push them to specific profiles. Useful for deploying LinkedIn automation tools across all accounts.
- **Extension isolation:** Each browser profile has its own extension set. Account A's extensions don't affect Account B.
- **Tracking:** The `installed_extensions` JSONB field on `browser_profiles` is updated after each sync so admins can see what's installed from the dashboard without downloading the profile.

---

## 6. Desktop Agent (Electron App)

The desktop agent is the key differentiator — like GoLogin's Orbita browser, but as a lightweight Electron shell.

### What It Does
1. Authenticates with the API server (user logs in once, token stored in OS keychain)
2. Shows a local account list (synced from dashboard assignments)
3. On "Launch": downloads profile, launches Chromium, monitors for close
4. On close: syncs profile back, reports session end
5. Manages a local Chromium installation (auto-updated)

### Architecture
```
┌─────────────────────────────────────────────┐
│  Electron Shell                              │
│                                              │
│  ┌──────────────┐   ┌───────────────────┐   │
│  │  Tray / UI    │   │  Profile Manager  │   │
│  │  (account     │   │  - Download from  │   │
│  │   list,       │   │    S3             │   │
│  │   launch btn) │   │  - Extract        │   │
│  └──────┬───────┘   │  - Compress        │   │
│         │           │  - Upload to S3    │   │
│         │           └────────┬──────────┘   │
│         │                    │               │
│  ┌──────▼────────────────────▼──────────┐   │
│  │  Chromium Launcher                    │   │
│  │  - Spawns Chromium child process      │   │
│  │  - Passes --user-data-dir, --proxy,   │   │
│  │    --load-extension flags             │   │
│  │  - Injects fingerprint extension      │   │
│  │  - Monitors process for exit          │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Bundled Chromium (auto-updated)      │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Platforms
- **macOS** — `.dmg` installer, universal binary (arm64 + x64)
- **Windows** — `.exe` installer (NSIS), auto-update via electron-updater
- **Linux** — `.AppImage` or `.deb`

### Profile Storage on Disk
```
~/.linkedin-manager/
  profiles/
    <account-uuid>/          ← extracted user-data dir (only while session active)
  chromium/                  ← managed Chromium installation
  config.json                ← API URL, auth token ref
```

Profiles are **deleted from disk after sync**. Only actively running profiles exist locally.

### Offline / Conflict Handling
- If the agent loses connectivity mid-session, the browser stays open. Sync happens when connectivity returns.
- If two users somehow both have the same profile open (race condition), the server rejects the second `POST /launch` with `409 Conflict`.

---

## 6b. Browser Delivery Options (Future)

### Option B — Cloud Browser Streaming (future add-on)
For users who can't install the desktop agent (e.g. Chromebook, mobile, locked-down corporate machines):
- Server launches Chromium in a container, streams viewport over WebSocket.
- Higher server cost but zero client install.
- Not MVP — add when there's demand.

### Option C — Web-Only Quick View (future)
- Read-only LinkedIn session preview via server-side rendering.
- Useful for monitoring accounts without launching a full browser.

---

## 7. Frontend Dashboard

### Pages

| Route | Description |
|---|---|
| `/login` | Email + password login |
| `/dashboard` | Account grid — cards showing each assigned LinkedIn account |
| `/dashboard/accounts/:id` | Account detail — profile info, proxy, session history, launch button |
| `/dashboard/accounts/new` | Create new account form |
| `/dashboard/team` | Manage team members + assignments (admin+) |
| `/dashboard/proxies` | Manage proxy list |
| `/dashboard/settings` | Org settings, billing |

### Account Card (dashboard grid)
```
┌─────────────────────────────────┐
│  John Doe — Sales               │
│  Status: Active                 │
│  Proxy: us-east.proxy.io:9090   │
│  Extensions: 2 installed        │
│  Last used: 2h ago              │
│                                 │
│  [ Launch ]  [ Extensions ]     │
└─────────────────────────────────┘
```

### Account Detail Page
- Profile fingerprint summary (OS, screen, timezone, locale)
- Proxy configuration (editable)
- Installed extensions list (with "Upload Extension" button)
- Session history table (who launched, when, duration)
- Assignment management (which team members can access)

---

## 8. Security Considerations

| Concern | Mitigation |
|---|---|
| Credentials at rest | AES-256 encryption for LinkedIn passwords and proxy passwords; encryption key in env/KMS, not in DB |
| Profile blobs | S3 server-side encryption (SSE-S3 or SSE-KMS) |
| Session hijack | Short-lived JWTs (15 min) + HTTP-only refresh tokens + Redis revocation list |
| Concurrent access | Redis mutex per account — only one active browser session at a time |
| Proxy credential leaks | Proxy creds injected at launch time only, never sent to frontend |
| Profile on user disk | Profile extracted only while session is active, deleted after sync. Encrypted at rest via OS-level encryption (FileVault / BitLocker) recommended |
| Extension safety | Org admins can view all installed extensions per profile from the dashboard; can remotely remove extensions |
| Audit trail | All session starts/stops logged with user + IP in `browser_sessions` |

---

## 9. Infrastructure (Production)

```
                         ┌──────────────┐
                         │   Cloudflare  │
                         │   (CDN + WAF) │
                         └──────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │    Load Balancer       │
                    │    (ALB / Caddy)       │
                    └───┬───────────────┬───┘
                        │               │
               ┌────────▼──────┐ ┌──────▼────────┐
               │  API Server   │ │  API Server    │
               │  (ECS / k8s)  │ │  (replica)     │
               └────────┬──────┘ └───────┬────────┘
                        │                │
            ┌───────────▼────────────────▼──────────┐
            │              Shared Services           │
            │  PostgreSQL (RDS)  |  Redis (Elasti-   │
            │                    |  Cache)            │
            └───────────────────────────────────────┘
                        │
                 ┌──────▼──────┐
                 │  S3 Bucket  │
                 │  (profiles) │
                 └─────────────┘

       Desktop agents connect from user machines:
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │  Agent 1   │  │  Agent 2   │  │  Agent N   │
       │  (macOS)   │  │  (Windows) │  │  (Linux)   │
       └───────────┘  └───────────┘  └───────────┘
```

### Scaling Notes
- **No server-side browser compute for MVP.** All browser sessions run on user machines via the desktop agent.
- Server only handles API requests, auth, and S3 signed URL generation — very lightweight.
- A single API server can handle hundreds of concurrent users. Scale horizontally behind a load balancer when needed.
- S3 is the bottleneck for large orgs — profile archives are typically 50–200 MB. Use S3 Transfer Acceleration or regional buckets if latency is an issue.
- Redis handles session mutexes — ensure HA with Redis Sentinel or ElastiCache multi-AZ.

---

## 10. MVP Milestones

| Phase | Scope |
|---|---|
| **P0 — Foundation** | Auth, org/user CRUD, DB schema, project scaffold (API + web dashboard) |
| **P1 — Profile Engine** | Fingerprint generation algorithm, S3 profile storage, upload/download with signed URLs |
| **P2 — Desktop Agent** | Electron app scaffold, Chromium bundling, profile download/extract/launch/sync lifecycle |
| **P3 — Fingerprint Extension** | Bundled Chrome extension that enforces fingerprint overrides (canvas, WebGL, navigator, etc.) |
| **P4 — Dashboard** | Account grid, account detail, team management, proxy management, extension management |
| **P5 — Extension Support** | Upload .crx via API, push to profiles, track installed extensions |
| **P6 — Hardening** | Encryption at rest, Redis session mutex, audit log, error handling, auto-updater for agent |
| **P7 — Deploy + Package** | API: Docker + CI/CD. Agent: electron-builder for macOS/Windows/Linux installers, code signing |

---

## 11. Key Technical Decisions for MVP

1. **Local browser, not cloud browser** — like GoLogin, the browser runs on the user's machine. This eliminates server compute costs, gives native performance, and enables real Chrome extension support. Cloud streaming is a future add-on, not the MVP.
2. **Fingerprint stored in DB, not in profile blob** — allows editing fingerprint params from the dashboard without re-downloading the profile. The agent fetches the fingerprint JSON at launch time.
3. **Fingerprint enforced via bundled extension** — a Chrome extension (auto-loaded, hidden from user) overrides all detectable browser properties. More reliable than page-level injection because extensions run in a privileged context.
4. **Profile sync is stop-triggered** — profiles are uploaded back to S3 only when a session ends. No continuous sync (complexity not worth it for MVP).
5. **Extensions are first-class** — users install extensions into profiles just like a normal browser. They persist across sessions because they live in the profile's user-data dir. This is how users add LinkedIn automation tools later.
6. **No LinkedIn automation built-in** — this is a profile/session manager only. Automation comes from third-party extensions (LinkedIn Helper, Dux-Soup, Expandi, etc.) that users install themselves.
7. **Monorepo** — `packages/api`, `packages/web`, `packages/agent`, `packages/fingerprint-extension` in one repo with shared TypeScript types.
8. **Electron for the agent** — proven distribution model, auto-update support, cross-platform. Chromium is bundled so users don't need Chrome installed.
