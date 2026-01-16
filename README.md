# Cloudflare Worker Short URL Service

A serverless URL shortener built with Cloudflare Workers, Hono, and D1 Database.

## Features

- **Shorten Links**: Public interface at `/c`.
- **Admin Dashboard**: Secure management interface at `/a`.
- **Link Management**: Create, Pause, Disable, Delete links.
- **Interstitial Page**: Optional "You are being redirected" page with 5s countdown (configurable per link).
- **Analytics**: Tracks visit counts.
- **Security**: 
  - Cloudflare Turnstile integration for public creation.
  - Password-protected admin API.
- **Notifications**: Telegram Bot notifications for:
  - New link creation.
  - Admin login.
  - Link updates/deletions.
- **Customization**: Custom slugs, expiration dates.

## Prerequisites

- [Node.js](https://nodejs.org/) installed (for building).
- [Cloudflare Account](https://dash.cloudflare.com/).

## Setup & Deployment

### 1. Build Project

First, install dependencies and build the project locally:

```bash
npm install
npm run deploy
```

> Note: `npm run deploy` will use Wrangler to deploy your worker. You will be prompted to login to Cloudflare if not already logged in.

### 2. Configure D1 Database (Cloudflare Dashboard)

1.  Log in to **Cloudflare Dashboard** -> **Workers & Pages** -> **D1**.
2.  Click **Create Database** and name it `shorturl-db`.
3.  Go to your **Worker** -> **Settings** -> **Functions** -> **D1 Database Bindings**.
4.  Add a new binding:
    - **Variable name**: `DB`
    - **D1 Database**: Select the `shorturl-db` you just created.
5.  **Redeploy** the worker (go to **Deployments** tab -> **Deploy** or just wait for next deployment).

### 3. Initialize Database Schema (Cloudflare Dashboard)

1.  Open your D1 database `shorturl-db` in the Cloudflare Dashboard.
2.  Go to the **Console** tab.
3.  Copy and paste the following SQL to create the table:

```sql
DROP TABLE IF EXISTS links;
CREATE TABLE links (
    slug TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    status TEXT DEFAULT 'active',
    interstitial INTEGER DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    creator_ip TEXT
);
```

4.  Click **Execute**.
5.  Then paste and execute this index creation command:

```sql
CREATE INDEX IF NOT EXISTS idx_expires_at ON links(expires_at);
```

6.  **Create Config Table** (for Telegram notifications):

```sql
CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tg_notify_create INTEGER DEFAULT 0,
    tg_notify_login INTEGER DEFAULT 0,
    tg_notify_update INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO config (id, tg_notify_create, tg_notify_login, tg_notify_update) VALUES (1, 0, 0, 0);
```

### 4. Configure Variables & Secrets (Cloudflare Dashboard)

Go to your **Worker** -> **Settings** -> **Variables**.

**Environment Variables** (Click "Add variable"):
- `ROOT_REDIRECT`: Target URL for root path `/` (e.g., `https://example.com`).
- `FALLBACK_URL`: Target URL for 404s (e.g., `https://example.com/404`).
- `TURNSTILE_SITE_KEY`: Your Turnstile Site Key (required for `/c` page).
- `TG_CHAT_ID`: Telegram Chat ID to receive notifications (e.g., `123456789`).

**Secrets** (Click "Add variable" -> "Encrypt"):
- `ADMIN_PASSWORD`: Password for accessing `/a`.
- `TURNSTILE_SECRET_KEY`: Your Turnstile Secret Key.
- `TG_BOT_TOKEN`: Telegram Bot Token (e.g., `123456:ABC-DEF...`).

## Usage

- **Public Creation**: Visit `https://your-worker.workers.dev/c`
  - URL Limit: Max 1000 characters.
  - Custom Slug: Min 3 characters.
- **Admin Panel**: Visit `https://your-worker.workers.dev/a`
  - Login with `ADMIN_PASSWORD`.
  - Admin can create short links with any slug length (e.g., 1 or 2 chars allowed).
- **Redirect**: Visit `https://your-worker.workers.dev/slug`
