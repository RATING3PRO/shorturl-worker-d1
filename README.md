# Cloudflare Worker Short URL Service

A serverless URL shortener built with Cloudflare Workers, Hono, and D1 Database.

## Features

- **Shorten Links**: Public interface at `/c`.
- **Admin Dashboard**: Secure management interface at `/a`.
- **Link Management**: Pause, Disable, Delete links.
- **Interstitial Page**: Optional "You are being redirected" page with 5s countdown (configurable per link).
- **Analytics**: Tracks visit counts.
- **Security**: 
  - Cloudflare Turnstile integration for public creation.
  - Password-protected admin API.
- **Customization**: Custom slugs, expiration dates.

## Prerequisites

- [Node.js](https://nodejs.org/) installed.
- [Cloudflare Account](https://dash.cloudflare.com/).
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`npm install -g wrangler`).

## Setup & Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Create & Bind D1 Database

1.  **Create D1 Database**:
    You can create a D1 database in the Cloudflare Dashboard or via CLI:
    ```bash
    npx wrangler d1 create shorturl-db
    ```
    Note the `database_id` if using CLI.

2.  **Bind in Dashboard**:
    - Go to your Worker in Cloudflare Dashboard.
    - Navigate to **Settings** -> **Functions** -> **D1 Database Bindings**.
    - Add a new binding:
        - **Variable name**: `DB`
        - **D1 Database**: Select the database you created (`shorturl-db`).
    - **Deploy** the worker to make changes take effect.

### 3. Initialize Database Schema

You need to execute the SQL commands in `schema.sql` to create the table. You can do this in the Cloudflare Dashboard:

1.  Open your D1 database in the Cloudflare Dashboard.
2.  Go to the **Console** tab.
3.  Copy the contents of `schema.sql` and paste it into the console query editor.
4.  Click **Execute**.

**Schema Content:**

Please execute the following SQL. If you encounter errors, try running the `CREATE TABLE` block first, and then the `CREATE INDEX` command.

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
CREATE INDEX IF NOT EXISTS idx_expires_at ON links(expires_at);
```

### 4. Configure Variables & Secrets

All configuration should be done in Cloudflare Dashboard -> Settings -> Variables (or via `wrangler secret put`).

**Required Secrets:**
- `ADMIN_PASSWORD`: Password for accessing `/a`.
- `TURNSTILE_SECRET_KEY`: Secret key from Cloudflare Turnstile.

**Recommended Variables:**
- `ROOT_REDIRECT`: Where to redirect users who visit the root `/` (e.g., `https://example.com`).
- `FALLBACK_URL`: Where to redirect if a short link is not found (e.g., `https://example.com/404`).
- `TURNSTILE_SITE_KEY`: The Site Key for Turnstile (required for public creation page).

```bash
# Example of setting secrets via CLI
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TURNSTILE_SECRET_KEY

# Example of setting variables via CLI (or use Dashboard)
npx wrangler deploy --var ROOT_REDIRECT:https://mysite.com --var FALLBACK_URL:https://mysite.com/404
```

### 5. Deploy

```bash
npx wrangler deploy
```

## Usage

- **Public Creation**: Visit `https://your-worker.workers.dev/c`
- **Admin Panel**: Visit `https://your-worker.workers.dev/a`
  - Enter the password you set in step 4.
- **Redirect**: Visit `https://your-worker.workers.dev/slug`

## Local Development

```bash
npm run dev
```

Note: Local dev uses a local D1 SQLite file.
