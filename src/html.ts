
export const publicPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shorten URL</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; background: #f4f4f5; color: #18181b; }
        .card { background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }
        h1 { margin-top: 0; text-align: center; }
        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        input[type="url"], input[type="text"], input[type="datetime-local"] { width: 100%; padding: 0.5rem; border: 1px solid #d4d4d8; border-radius: 0.25rem; box-sizing: border-box; }
        button { width: 100%; background: #000; color: white; padding: 0.75rem; border: none; border-radius: 0.25rem; font-weight: 600; cursor: pointer; }
        button:hover { background: #27272a; }
        #result { margin-top: 1rem; padding: 1rem; background: #ecfdf5; border: 1px solid #059669; color: #065f46; border-radius: 0.25rem; display: none; word-break: break-all; }
        #error { margin-top: 1rem; padding: 1rem; background: #fef2f2; border: 1px solid #dc2626; color: #991b1b; border-radius: 0.25rem; display: none; }
        .cf-turnstile { margin-top: 1rem; display: flex; justify-content: center; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Shorten URL</h1>
        <form id="createForm">
            <div class="form-group">
                <label for="url">Target URL</label>
                <input type="url" id="url" name="url" required maxlength="1000" placeholder="https://example.com/very/long/url">
            </div>
            <div class="form-group">
                <label for="slug">Custom Slug (Optional)</label>
                <input type="text" id="slug" name="slug" minlength="3" placeholder="custom-name" pattern="[a-zA-Z0-9-_]+" title="Alphanumeric, dashes, and underscores only">
            </div>
            <div class="form-group">
                <label for="expires">Expires At (Optional)</label>
                <input type="datetime-local" id="expires" name="expires">
            </div>
            
            <div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY_HERE"></div>
            
            <button type="submit">Create Short Link</button>
        </form>
        <div id="result"></div>
        <div id="error"></div>
    </div>

    <script>
        // Replace with your actual site key if not injected by worker
        // The worker should replace YOUR_TURNSTILE_SITE_KEY_HERE
        
        document.getElementById('createForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const resultDiv = document.getElementById('result');
            const errorDiv = document.getElementById('error');
            resultDiv.style.display = 'none';
            errorDiv.style.display = 'none';

            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            try {
                const res = await fetch('/api/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const json = await res.json();
                
                if (res.ok) {
                    resultDiv.textContent = 'Success! ' + window.location.origin + '/' + json.slug;
                    resultDiv.style.display = 'block';
                    e.target.reset();
                    if (window.turnstile) window.turnstile.reset();
                } else {
                    throw new Error(json.error || 'Failed to create link');
                }
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;

export const adminPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Admin</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; background: #f4f4f5; color: #18181b; }
        .card { background: white; padding: 1.5rem; border-radius: 0.5rem; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); margin-bottom: 1rem; }
        h1 { margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e4e4e7; }
        th { background: #f4f4f5; font-weight: 600; }
        .status-active { color: #059669; font-weight: 600; }
        .status-paused { color: #d97706; font-weight: 600; }
        .status-disabled { color: #dc2626; font-weight: 600; }
        button { padding: 0.25rem 0.5rem; border: 1px solid #d4d4d8; background: white; border-radius: 0.25rem; cursor: pointer; font-size: 0.875rem; margin-right: 0.25rem; }
        button:hover { background: #f4f4f5; }
        .btn-delete { color: #dc2626; border-color: #fca5a5; }
        .btn-delete:hover { background: #fef2f2; }
        input[type="password"] { padding: 0.5rem; border: 1px solid #d4d4d8; border-radius: 0.25rem; }
        #login-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .login-box { background: white; padding: 2rem; border-radius: 0.5rem; width: 300px; }
        .controls { display: flex; gap: 0.5rem; align-items: center; }
    </style>
</head>
<body>
    <div id="login-overlay">
        <div class="login-box">
            <h2>Admin Login</h2>
            <form id="loginForm">
                <div style="margin-bottom: 1rem;">
                    <label>Password</label>
                    <input type="password" id="password" required style="width: 100%; box-sizing: border-box;">
                </div>
                <button type="submit" style="width: 100%; background: #000; color: white;">Login</button>
            </form>
        </div>
    </div>

    <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h1>Link Management</h1>
            <div>
                <button onclick="toggleSettings()">⚙️ Settings</button>
                <button onclick="logout()">Logout</button>
            </div>
        </div>
        
        <!-- Settings Modal/Section -->
        <div id="settings-panel" style="display: none; margin-bottom: 1.5rem; padding: 1rem; background: #fff; border: 1px solid #e4e4e7; border-radius: 0.5rem;">
            <h3 style="margin-top: 0;">Telegram Notifications</h3>
            <div id="tg-not-configured" style="display: none; color: #d97706; margin-bottom: 1rem;">
                ⚠️ Telegram Bot Token or Chat ID not configured in Secrets.
            </div>
            <div id="tg-configured" style="display: none;">
                <div style="margin-bottom: 0.5rem;">
                    <label>
                        <input type="checkbox" id="tg_create"> Notify on New Link Creation
                    </label>
                </div>
                <div style="margin-bottom: 0.5rem;">
                    <label>
                        <input type="checkbox" id="tg_login"> Notify on Admin Login
                    </label>
                </div>
                <div style="margin-bottom: 0.5rem;">
                    <label>
                        <input type="checkbox" id="tg_update"> Notify on Link Update/Delete
                    </label>
                </div>
                <div style="margin-top: 1rem;">
                    <button onclick="saveConfig()" style="background: #000; color: white;">Save Settings</button>
                    <button onclick="testTg()">Send Test Message</button>
                </div>
            </div>
        </div>

        <!-- Create Link Section -->
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f9fafb; border-radius: 0.5rem; border: 1px solid #e5e7eb;">
            <h3 style="margin-top: 0;">Create New Link</h3>
            <form id="adminCreateForm" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; align-items: end;">
                <div>
                    <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">Target URL</label>
                    <input type="url" name="url" required maxlength="1000" placeholder="https://example.com" style="width: 100%; padding: 0.5rem; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">Slug (Optional)</label>
                    <input type="text" name="slug" minlength="3" placeholder="custom-slug" style="width: 100%; padding: 0.5rem; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">Expires At</label>
                    <input type="datetime-local" name="expires" style="width: 100%; padding: 0.5rem; box-sizing: border-box;">
                </div>
                <button type="submit" style="background: #000; color: white; padding: 0.5rem 1rem; height: 38px;">Create</button>
            </form>
        </div>

        <div id="error-msg" style="color: red; margin-bottom: 1rem;"></div>
        <div class="controls">
            <input type="text" id="search" placeholder="Search slug..." style="padding: 0.5rem;">
            <button onclick="loadLinks()">Refresh</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Slug</th>
                    <th>Target</th>
                    <th>Visits</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>Jump Page</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="links-body"></tbody>
        </table>
        <div style="margin-top: 1rem; display: flex; justify-content: center; gap: 1rem;">
            <button onclick="prevPage()">Previous</button>
            <span id="page-indicator">Page 1</span>
            <button onclick="nextPage()">Next</button>
        </div>
    </div>

    <script>
        let currentPage = 1;
        let token = localStorage.getItem('admin_token');

        if (token) {
            document.getElementById('login-overlay').style.display = 'none';
            loadLinks();
            loadConfig();
        }

        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            token = document.getElementById('password').value;
            localStorage.setItem('admin_token', token);
            document.getElementById('login-overlay').style.display = 'none';
            loadLinks();
            loadConfig();
        });
        
        document.getElementById('adminCreateForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            try {
                const res = await apiCall('/api/admin/create', 'POST', data);
                if (res.success) {
                    alert('Link created: ' + res.slug);
                    e.target.reset();
                    loadLinks();
                } else {
                    alert('Error: ' + res.error);
                }
            } catch (err) {
                alert('Failed: ' + err.message);
            }
        });

        function logout() {
            localStorage.removeItem('admin_token');
            location.reload();
        }

        function toggleSettings() {
            const el = document.getElementById('settings-panel');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }

        async function apiCall(endpoint, method = 'GET', body = null) {
            const headers = { 'x-admin-auth': token };
            if (body) headers['Content-Type'] = 'application/json';
            
            const res = await fetch(endpoint, {
                method,
                headers,
                body: body ? JSON.stringify(body) : null
            });
            
            if (res.status === 401) {
                logout();
                throw new Error('Unauthorized');
            }
            return res.json();
        }

        async function loadConfig() {
            try {
                const conf = await apiCall('/api/admin/config');
                if (conf.has_tg) {
                    document.getElementById('tg-configured').style.display = 'block';
                    document.getElementById('tg_create').checked = !!conf.tg_notify_create;
                    document.getElementById('tg_login').checked = !!conf.tg_notify_login;
                    document.getElementById('tg_update').checked = !!conf.tg_notify_update;
                } else {
                    document.getElementById('tg-not-configured').style.display = 'block';
                }
            } catch (e) {
                console.error('Failed to load config', e);
            }
        }

        async function saveConfig() {
            try {
                const data = {
                    tg_notify_create: document.getElementById('tg_create').checked,
                    tg_notify_login: document.getElementById('tg_login').checked,
                    tg_notify_update: document.getElementById('tg_update').checked
                };
                const res = await apiCall('/api/admin/config', 'POST', data);
                if (res.success) alert('Settings saved');
                else alert('Error: ' + res.error);
            } catch (e) {
                alert('Failed: ' + e.message);
            }
        }

        async function testTg() {
            try {
                const res = await apiCall('/api/admin/test-tg', 'POST', {});
                if (res.success) alert('Test message sent!');
                else alert('Error: ' + res.error);
            } catch (e) {
                alert('Failed: ' + e.message);
            }
        }

        function formatDate(ts) {
            if (!ts) return 'Never';
            return new Date(ts).toLocaleString();
        }

        async function loadLinks() {
            try {
                const search = document.getElementById('search').value;
                const data = await apiCall(\`/api/admin/links?page=\${currentPage}&search=\${search}\`);
                const tbody = document.getElementById('links-body');
                tbody.innerHTML = '';
                
                data.links.forEach(link => {
                    const row = document.createElement('tr');
                    row.innerHTML = \`
                        <td><a href="/\${link.slug}" target="_blank">\${link.slug}</a></td>
                        <td title="\${link.url}" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${link.url}</td>
                        <td>\${link.visit_count}</td>
                        <td>\${formatDate(link.expires_at)}</td>
                        <td><span class="status-\${link.status}">\${link.status}</span></td>
                        <td>\${link.interstitial ? 'Yes' : 'No'}</td>
                        <td>
                            <button onclick="toggleStatus('\${link.slug}', '\${link.status}')">
                                \${link.status === 'active' ? 'Pause' : link.status === 'paused' ? 'Disable' : 'Activate'}
                            </button>
                            <button onclick="toggleInterstitial('\${link.slug}', \${link.interstitial})">
                                \${link.interstitial ? 'No Jump' : 'Jump'}
                            </button>
                            <button class="btn-delete" onclick="deleteLink('\${link.slug}')">Delete</button>
                        </td>
                    \`;
                    tbody.appendChild(row);
                });
                
                document.getElementById('page-indicator').textContent = \`Page \${currentPage}\`;
            } catch (err) {
                document.getElementById('error-msg').textContent = err.message;
            }
        }

        async function toggleStatus(slug, currentStatus) {
            const newStatus = currentStatus === 'active' ? 'paused' : currentStatus === 'paused' ? 'disabled' : 'active';
            await apiCall('/api/admin/update', 'POST', { slug, status: newStatus });
            loadLinks();
        }

        async function toggleInterstitial(slug, currentVal) {
            await apiCall('/api/admin/update', 'POST', { slug, interstitial: !currentVal });
            loadLinks();
        }

        async function deleteLink(slug) {
            if(!confirm('Are you sure?')) return;
            await apiCall('/api/admin/delete', 'POST', { slug });
            loadLinks();
        }

        function prevPage() { if(currentPage > 1) { currentPage--; loadLinks(); } }
        function nextPage() { currentPage++; loadLinks(); }
    </script>
</body>
</html>`;

export const interstitialPage = (url: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting...</title>
    <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f4f4f5; text-align: center; }
        .card { background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }
        .btn { display: inline-block; background: #000; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 0.25rem; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>You are being redirected</h1>
        <p>You are about to leave this site and visit:</p>
        <p style="font-weight: bold; color: #059669;">${url}</p>
        <p id="timer">Redirecting in 5 seconds...</p>
        <a href="${url}" class="btn">Go Now</a>
    </div>
    <script>
        let count = 5;
        const timer = document.getElementById('timer');
        const interval = setInterval(() => {
            count--;
            timer.textContent = 'Redirecting in ' + count + ' seconds...';
            if (count <= 0) {
                clearInterval(interval);
                window.location.href = "${url}";
            }
        }, 1000);
    </script>
</body>
</html>`;

export const maintenancePage = `<!DOCTYPE html>
<html lang="en">
<head>
    <title>Link Paused</title>
    <style>body{font-family:sans-serif;text-align:center;padding:2rem;}</style>
</head>
<body>
    <h1>Link Paused</h1>
    <p>This short link is currently paused by the administrator.</p>
</body>
</html>`;
