
import { Hono } from 'hono';
import { sign, verify as verifyJwt } from 'hono/jwt';
import { generateSecret, generateURI, verify } from 'otplib';
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
    admin_2fa_secret?: string;
    admin_2fa_enabled?: number; // 0 or 1
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message, stack: err.stack }, 500);
});

// Security Middleware
app.use('*', async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://api.qrserver.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; img-src 'self' data: https://api.qrserver.com;");
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// Helper: Escape HTML for Telegram
function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Helper: Telegram Notification
async function sendTgMessage(env: Bindings, text: string): Promise<boolean> {
    if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return false;
    
    try {
        const resp = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: env.TG_CHAT_ID,
                text: text,
                parse_mode: 'HTML'
            })
        });
        if (!resp.ok) {
            const body = await resp.text();
            console.error('TG API error', resp.status, body);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Failed to send TG message', e);
        return false;
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
    
    return { tg_notify_create: 0, tg_notify_login: 0, tg_notify_update: 0, admin_2fa_enabled: 0 };
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
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return c.json({ error: 'Only http and https protocols are allowed' }, 400);
        }
        // Prevent self-redirection
        const host = c.req.header('host');
        if (host && u.host === host) {
            return c.json({ error: 'Cannot redirect to self' }, 400);
        }
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
        // Reserved slugs
        if (finalSlug === 'a' || finalSlug === 'c') {
            return c.json({ error: 'Reserved slug' }, 400);
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
    ).bind(finalSlug, url, now, expiresAt, 'active', 1, 0, ip).run();

    // TG Notify
    c.executionCtx.waitUntil((async () => {
        const conf = await getConfig(c.env.DB);
        if (conf.tg_notify_create) {
            await sendTgMessage(c.env, `<b>New Link Created</b>\nSlug: <code>${escapeHtml(finalSlug)}</code>\nURL: ${escapeHtml(url)}\nIP: ${escapeHtml(ip)}`);
        }
    })());

    return c.json({ success: true, slug: finalSlug });
});

// Admin Login
app.post('/api/admin/login', async (c) => {
    const { password, code } = await c.req.json();
    if (password !== c.env.ADMIN_PASSWORD) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const conf = await getConfig(c.env.DB);
    
    // If 2FA enabled, check code
    if (conf.admin_2fa_enabled) {
        if (!code) {
            return c.json({ error: '2fa_required' }, 401);
        }
        try {
            const isValid = await verify({ token: code, secret: conf.admin_2fa_secret || '' });
            if (!isValid?.valid) {
                return c.json({ error: 'Invalid 2FA code' }, 401);
            }
        } catch (e) {
            return c.json({ error: 'Invalid 2FA code' }, 401);
        }
    }

    // Generate JWT
    const payload = {
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    };
    const token = await sign(payload, c.env.ADMIN_PASSWORD, 'HS256');

    // Notify login
    c.executionCtx.waitUntil((async () => {
        if (conf.tg_notify_login) {
            const ip = c.req.header('CF-Connecting-IP') || 'unknown';
            await sendTgMessage(c.env, `<b>Admin Login</b>\nIP: ${ip}\n2FA: ${conf.admin_2fa_enabled ? 'Yes' : 'No'}`);
        }
    })());

    return c.json({ token });
});

// Middleware for Admin API
app.use('/api/admin/*', async (c, next) => {
    // Skip login route
    if (c.req.path === '/api/admin/login') {
        await next();
        return;
    }

    // Check JWT
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            await verifyJwt(token, c.env.ADMIN_PASSWORD, 'HS256');
            await next();
            return;
        } catch (e) {
            // Invalid token, fall through to check legacy password if allowed
        }
    }

    // Check Legacy Password (x-admin-auth)
    // ONLY allowed if 2FA is DISABLED
    const auth = c.req.header('x-admin-auth');
    if (auth === c.env.ADMIN_PASSWORD) {
        const conf = await getConfig(c.env.DB);
        if (!conf.admin_2fa_enabled) {
            await next();
            return;
        }
    }

    // If both failed, return unauthorized (and if JWT failed, we already logged it)
    return c.json({ error: 'Unauthorized' }, 401);
});

// API: 2FA Setup - Generate Secret
app.post('/api/admin/2fa/setup', async (c) => {
    const secret = generateSecret();
    const otpauth = generateURI({
        issuer: 'ShortURL',
        label: 'admin',
        secret
    });
    return c.json({ secret, otpauth });
});

// API: 2FA Enable
app.post('/api/admin/2fa/enable', async (c) => {
    const { secret, code } = await c.req.json();
    
    if (!secret || !code) return c.json({ error: 'Missing secret or code' }, 400);

    try {
        const isValid = await verify({ token: code, secret });
        if (!isValid?.valid) return c.json({ error: 'Invalid code' }, 400);
    } catch (e) {
        return c.json({ error: 'Invalid code or secret' }, 400);
    }

    await c.env.DB.prepare('UPDATE config SET admin_2fa_secret = ?, admin_2fa_enabled = 1 WHERE id = 1')
        .bind(secret).run();
    
    return c.json({ success: true });
});

// API: 2FA Disable
app.post('/api/admin/2fa/disable', async (c) => {
    const { password } = await c.req.json();
    // Extra safety: require password again to disable
    if (password !== c.env.ADMIN_PASSWORD) {
        return c.json({ error: 'Invalid password' }, 401);
    }

    await c.env.DB.prepare('UPDATE config SET admin_2fa_enabled = 0 WHERE id = 1').run();
    return c.json({ success: true });
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
    const ok = await sendTgMessage(c.env, '<b>Test Message</b>\nThis is a test notification from your Short URL Worker.');
    if (!ok) return c.json({ error: 'Failed to send Telegram message' }, 502);
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
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return c.json({ error: 'Only http and https protocols are allowed' }, 400);
        }
        // Prevent self-redirection
        const host = c.req.header('host');
        if (host && u.host === host) {
            return c.json({ error: 'Cannot redirect to self' }, 400);
        }
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
        // Reserved slugs
        if (finalSlug === 'a' || finalSlug === 'c') {
            return c.json({ error: 'Reserved slug' }, 400);
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
            await sendTgMessage(c.env, `<b>Admin Link Created</b>\nSlug: <code>${escapeHtml(finalSlug)}</code>\nURL: ${escapeHtml(url)}`);
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
                await sendTgMessage(c.env, `<b>Link Updated</b>\nSlug: <code>${escapeHtml(slug)}</code>\n${changes.join('\n')}`);
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
