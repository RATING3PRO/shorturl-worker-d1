
import { Hono } from 'hono';
import { adminPage, publicPage, interstitialPage, maintenancePage } from './html';

type Bindings = {
    DB: D1Database;
    ROOT_REDIRECT: string;
    FALLBACK_URL: string;
    ADMIN_PASSWORD: string;
    TURNSTILE_SECRET_KEY: string;
    // Optional: injected vars
    TURNSTILE_SITE_KEY?: string;
    TG_BOT_TOKEN?: string;
    TG_CHAT_ID?: string;
};

type Link = {
    slug: string;
    url: string;
    created_at: number;
    expires_at: number | null;
    status: 'active' | 'paused' | 'disabled';
    interstitial: number;
    visit_count: number;
};

type Config = {
    tg_notify_create: number; // 0 or 1
    tg_notify_login: number;
    tg_notify_update: number;
};

const app = new Hono<{ Bindings: Bindings }>();

// Helper: Telegram Notification
async function sendTgMessage(env: Bindings, text: string) {
    if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return;
    
    // Check user config settings from DB
    // Optimization: We could cache this, but for now we'll query DB or pass flags
    // Actually, let's keep it simple: caller decides if they should send based on config
    
    try {
        await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: env.TG_CHAT_ID,
                text: text,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error('Failed to send TG message', e);
    }
}

// Helper: Get Config
async function getConfig(db: D1Database): Promise<Config> {
    // Ensure config table exists (lazy migration for existing deployments)
    // For performance, we assume it exists or we handle error. 
    // Ideally schema.sql handles this. But let's check or use default.
    try {
        const row = await db.prepare('SELECT * FROM config LIMIT 1').first<Config>();
        if (row) return row;
    } catch {}
    
    return { tg_notify_create: 0, tg_notify_login: 0, tg_notify_update: 0 };
}

// Helper: Turnstile Validation
async function validateTurnstile(token: string, secret: string, ip: string) {
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        body: formData,
        method: 'POST',
    });

    const outcome = await result.json() as any;
    return outcome.success;
}

// Routes
app.get('/', (c) => c.redirect(c.env.ROOT_REDIRECT || 'https://example.com'));

app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /a\nDisallow: /api/admin'));

app.get('/c', (c) => {
    // Inject site key if provided in env, else user must edit html
    let html = publicPage;
    if (c.env.TURNSTILE_SITE_KEY) {
        html = html.replace('YOUR_TURNSTILE_SITE_KEY_HERE', c.env.TURNSTILE_SITE_KEY);
    }
    return c.html(html);
});

app.get('/a', (c) => c.html(adminPage));

// API: Create Link (Public)
app.post('/api/create', async (c) => {
    const body = await c.req.json();
    const { url, slug, expires, 'cf-turnstile-response': turnstileToken } = body;

    // Validate Turnstile
    if (!c.env.TURNSTILE_SECRET_KEY) {
        return c.json({ error: 'Turnstile not configured on server' }, 500);
    }
    const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
    const valid = await validateTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!valid) {
        return c.json({ error: 'Invalid captcha' }, 400);
    }

    if (!url) return c.json({ error: 'URL required' }, 400);

    if (url.length > 1000) {
        return c.json({ error: 'URL too long (max 1000 chars)' }, 400);
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        return c.json({ error: 'Invalid URL format' }, 400);
    }

    // Slug logic
    let finalSlug = slug;
    if (!finalSlug) {
        // Generate random 6-char slug
        finalSlug = Math.random().toString(36).substring(2, 8);
    } else {
        // Admin overrides: allow short slugs, but still validate chars
        // Validate slug chars
        if (!/^[a-zA-Z0-9-_]+$/.test(finalSlug)) {
            return c.json({ error: 'Invalid slug characters' }, 400);
        }
    }

    // Check if exists
    const existing = await c.env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(finalSlug).first();
    if (existing) {
        return c.json({ error: 'Slug already taken' }, 409);
    }

    const now = Date.now();
    let expiresAt = null;
    if (expires) {
        expiresAt = new Date(expires).getTime();
        if (expiresAt < now) return c.json({ error: 'Expiration must be in future' }, 400);
    }

    await c.env.DB.prepare(
        'INSERT INTO links (slug, url, created_at, expires_at, status, interstitial, visit_count, creator_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(finalSlug, url, now, expiresAt, 'active', 0, 0, ip).run();

    // TG Notify
    c.executionCtx.waitUntil((async () => {
        const conf = await getConfig(c.env.DB);
        if (conf.tg_notify_create) {
            await sendTgMessage(c.env, `<b>New Link Created</b>\nSlug: <code>${finalSlug}</code>\nURL: ${url}\nIP: ${ip}`);
        }
    })());

    return c.json({ success: true, slug: finalSlug });
});

// Middleware for Admin API
app.use('/api/admin/*', async (c, next) => {
    const auth = c.req.header('x-admin-auth');
    if (auth !== c.env.ADMIN_PASSWORD) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
});

// API: Get Config
app.get('/api/admin/config', async (c) => {
    const conf = await getConfig(c.env.DB);
    const hasTg = !!(c.env.TG_BOT_TOKEN && c.env.TG_CHAT_ID);
    return c.json({ ...conf, has_tg: hasTg });
});

// API: Update Config
app.post('/api/admin/config', async (c) => {
    const { tg_notify_create, tg_notify_login, tg_notify_update } = await c.req.json();
    
    // Check if TG is configured
    if (!c.env.TG_BOT_TOKEN || !c.env.TG_CHAT_ID) {
        return c.json({ error: 'Telegram secrets not configured' }, 400);
    }

    await c.env.DB.prepare(
        'UPDATE config SET tg_notify_create = ?, tg_notify_login = ?, tg_notify_update = ? WHERE id = 1'
    ).bind(tg_notify_create ? 1 : 0, tg_notify_login ? 1 : 0, tg_notify_update ? 1 : 0).run();
    
    return c.json({ success: true });
});

// API: Test TG
app.post('/api/admin/test-tg', async (c) => {
    if (!c.env.TG_BOT_TOKEN || !c.env.TG_CHAT_ID) {
        return c.json({ error: 'Telegram secrets not configured' }, 400);
    }
    await sendTgMessage(c.env, '<b>Test Message</b>\nThis is a test notification from your Short URL Worker.');
    return c.json({ success: true });
});

// API: Admin Create Link
app.post('/api/admin/create', async (c) => {
    const body = await c.req.json();
    const { url, slug, expires } = body;
    const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';

    if (!url) return c.json({ error: 'URL required' }, 400);

    if (url.length > 1000) {
        return c.json({ error: 'URL too long (max 1000 chars)' }, 400);
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        return c.json({ error: 'Invalid URL format' }, 400);
    }

    // Slug logic
    let finalSlug = slug;
    if (!finalSlug) {
        // Generate random 6-char slug
        finalSlug = Math.random().toString(36).substring(2, 8);
    } else {
        // Admin overrides: allow short slugs (no min length check)
        // Validate slug chars
        if (!/^[a-zA-Z0-9-_]+$/.test(finalSlug)) {
            return c.json({ error: 'Invalid slug characters' }, 400);
        }
    }

    // Check if exists
    const existing = await c.env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(finalSlug).first();
    if (existing) {
        return c.json({ error: 'Slug already taken' }, 409);
    }

    const now = Date.now();
    let expiresAt = null;
    if (expires) {
        expiresAt = new Date(expires).getTime();
        // Admin can create expired links if they really want to, but let's warn or block? 
        // Standard behavior: allow setting past dates but it won't work. 
        // Or enforce future date. Let's enforce future date for consistency.
        if (expiresAt < now) return c.json({ error: 'Expiration must be in future' }, 400);
    }

    await c.env.DB.prepare(
        'INSERT INTO links (slug, url, created_at, expires_at, status, interstitial, visit_count, creator_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(finalSlug, url, now, expiresAt, 'active', 0, 0, ip).run();

    // TG Notify
    c.executionCtx.waitUntil((async () => {
        const conf = await getConfig(c.env.DB);
        if (conf.tg_notify_create) {
            await sendTgMessage(c.env, `<b>Admin Link Created</b>\nSlug: <code>${finalSlug}</code>\nURL: ${url}`);
        }
    })());

    return c.json({ success: true, slug: finalSlug });
});

app.get('/api/admin/links', async (c) => {
    const page = parseInt(c.req.query('page') || '1');
    const search = c.req.query('search') || '';
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM links';
    const params = [];

    if (search) {
        query += ' WHERE slug LIKE ?';
        params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ links: results });
});

app.post('/api/admin/update', async (c) => {
    const { slug, status, interstitial } = await c.req.json();
    
    let changes = [];
    if (status) {
        await c.env.DB.prepare('UPDATE links SET status = ? WHERE slug = ?').bind(status, slug).run();
        changes.push(`Status: ${status}`);
    }
    if (typeof interstitial === 'boolean') {
        await c.env.DB.prepare('UPDATE links SET interstitial = ? WHERE slug = ?').bind(interstitial ? 1 : 0, slug).run();
        changes.push(`Interstitial: ${interstitial}`);
    }

    // TG Notify
    if (changes.length > 0) {
        c.executionCtx.waitUntil((async () => {
            const conf = await getConfig(c.env.DB);
            if (conf.tg_notify_update) {
                await sendTgMessage(c.env, `<b>Link Updated</b>\nSlug: <code>${slug}</code>\n${changes.join('\n')}`);
            }
        })());
    }

    return c.json({ success: true });
});

app.post('/api/admin/delete', async (c) => {
    const { slug } = await c.req.json();
    await c.env.DB.prepare('DELETE FROM links WHERE slug = ?').bind(slug).run();
    return c.json({ success: true });
});

// Short Link Handler (Catch-all)
app.get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const link = await c.env.DB.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first<Link>();

    if (!link) {
        return c.redirect(c.env.FALLBACK_URL || '/');
    }

    // Check expiration
    if (link.expires_at && link.expires_at < Date.now()) {
        return c.redirect(c.env.FALLBACK_URL || '/');
    }

    // Check status
    if (link.status === 'disabled') {
        return c.redirect(c.env.FALLBACK_URL || '/');
    }
    if (link.status === 'paused') {
        return c.html(maintenancePage, 503);
    }

    // Update count (fire and forget / non-blocking if possible, but await is safer for consistency)
    c.executionCtx.waitUntil(
        c.env.DB.prepare('UPDATE links SET visit_count = visit_count + 1 WHERE slug = ?').bind(slug).run()
    );

    // Interstitial
    if (link.interstitial) {
        return c.html(interstitialPage(link.url));
    }

    return c.redirect(link.url, 302);
});

export default app;
