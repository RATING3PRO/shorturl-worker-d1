
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
        input[type="password"], input[type="text"], input[type="url"], input[type="datetime-local"] { padding: 0.5rem; border: 1px solid #d4d4d8; border-radius: 0.25rem; }
        #login-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .login-box { background: white; padding: 2rem; border-radius: 0.5rem; width: 300px; }
        .controls { display: flex; gap: 0.5rem; align-items: center; }
        .btn-primary { background: #000; color: white; border: none; }
        .btn-primary:hover { background: #27272a; }
        .qr-code { text-align: center; margin: 1rem 0; }
        .qr-code img { max-width: 150px; }
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
                <div id="2fa-group" style="margin-bottom: 1rem; display: none;">
                    <label>2FA Code</label>
                    <input type="text" id="2fa_code" style="width: 100%; box-sizing: border-box;" placeholder="123456" pattern="[0-9]*">
                </div>
                <button type="submit" class="btn-primary" style="width: 100%;">Login</button>
                <div id="login-error" style="color: red; margin-top: 0.5rem; display: none;"></div>
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
            <h3 style="margin-top: 0;">2FA Settings</h3>
            <div id="2fa-status-section">
                <!-- Content populated by JS -->
            </div>
            
            <hr style="margin: 1rem 0; border: 0; border-top: 1px solid #e4e4e7;">

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
                    <button onclick="saveConfig()" class="btn-primary">Save TG Settings</button>
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
                    <input type="text" name="slug" placeholder="custom-slug" style="width: 100%; padding: 0.5rem; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">Expires At</label>
                    <input type="datetime-local" name="expires" style="width: 100%; padding: 0.5rem; box-sizing: border-box;">
                </div>
                <button type="submit" class="btn-primary" style="padding: 0.5rem 1rem; height: 38px;">Create</button>
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
        function escapeHtml(unsafe) {
            if (unsafe === null || unsafe === undefined) return '';
            return String(unsafe)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        let currentPage = 1;
        let token = localStorage.getItem('admin_token');

        if (token) {
            document.getElementById('login-overlay').style.display = 'none';
            loadLinks();
            loadConfig();
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('password').value;
            const code = document.getElementById('2fa_code').value;
            const errorDiv = document.getElementById('login-error');
            errorDiv.style.display = 'none';

            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, code })
                });
                
                const data = await res.json();
                
                if (res.ok && data.token) {
                    token = data.token;
                    localStorage.setItem('admin_token', token);
                    document.getElementById('login-overlay').style.display = 'none';
                    loadLinks();
                    loadConfig();
                } else if (res.status === 401 && data.error === '2fa_required') {
                    document.getElementById('2fa-group').style.display = 'block';
                    errorDiv.textContent = 'Please enter 2FA code';
                    errorDiv.style.display = 'block';
                } else {
                    throw new Error(data.error || 'Login failed');
                }
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.style.display = 'block';
            }
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
            const headers = {};
            if (token) headers['Authorization'] = 'Bearer ' + token;
            // Fallback for legacy (though new system uses JWT)
            // headers['x-admin-auth'] = token; 
            
            if (body) headers['Content-Type'] = 'application/json';
            
            const res = await fetch(endpoint, {
                method,
                headers,
                body: body ? JSON.stringify(body) : null
            });
            
            if (res.status === 401) {
                try {
                    const err = await res.json();
                    console.error('API Unauthorized:', err);
                    alert('Session Error: ' + (err.details || err.error));
                } catch(e) {}
                
                logout();
                throw new Error('Unauthorized');
            }
            return res.json();
        }

        async function loadConfig() {
            try {
                const conf = await apiCall('/api/admin/config');
                
                // TG Config
                if (conf.has_tg) {
                    document.getElementById('tg-configured').style.display = 'block';
                    document.getElementById('tg_create').checked = !!conf.tg_notify_create;
                    document.getElementById('tg_login').checked = !!conf.tg_notify_login;
                    document.getElementById('tg_update').checked = !!conf.tg_notify_update;
                } else {
                    document.getElementById('tg-not-configured').style.display = 'block';
                }

                // 2FA Config
                render2FASection(conf.admin_2fa_enabled);

            } catch (e) {
                console.error('Failed to load config', e);
            }
        }

        function render2FASection(enabled) {
            const container = document.getElementById('2fa-status-section');
            if (enabled) {
                container.innerHTML = \`
                    <div style="color: #059669; font-weight: bold; margin-bottom: 0.5rem;">✅ Two-Factor Authentication is ENABLED</div>
                    <button onclick="disable2FA()" class="btn-delete">Disable 2FA</button>
                \`;
            } else {
                container.innerHTML = \`
                    <div style="color: #6b7280; margin-bottom: 0.5rem;">Two-Factor Authentication is DISABLED</div>
                    <button onclick="setup2FA()" class="btn-primary">Enable 2FA</button>
                    <div id="2fa-setup-area" style="display:none; margin-top: 1rem; border-top: 1px dashed #ccc; padding-top: 1rem;"></div>
                \`;
            }
        }

        async function setup2FA() {
            try {
                const res = await apiCall('/api/admin/2fa/setup', 'POST');
                const area = document.getElementById('2fa-setup-area');
                area.style.display = 'block';
                area.innerHTML = \`
                    <p>1. Scan this QR code with Google Authenticator:</p>
                    <div class="qr-code">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=\${encodeURIComponent(res.otpauth)}" />
                    </div>
                    <div style="margin: 1rem 0; padding: 0.5rem; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <span style="font-size: 0.8rem; color: #6b7280; display: block;">Manual Entry Key:</span>
                            <code id="secret-code" style="font-size: 1rem; font-weight: bold;">\${res.secret}</code>
                        </div>
                        <button onclick="copySecret()" style="background: white; border: 1px solid #d1d5db; padding: 0.25rem 0.5rem; font-size: 0.8rem;">Copy</button>
                    </div>
                    <p>2. Enter the code to verify:</p>
                    <input type="text" id="verify_code" placeholder="123456" style="width: 150px;">
                    <button onclick="enable2FA('\${res.secret}')" class="btn-primary">Verify & Enable</button>
                \`;
            } catch (e) {
                alert('Error: ' + e.message);
            }
        }

        function copySecret() {
            const secret = document.getElementById('secret-code').innerText;
            navigator.clipboard.writeText(secret).then(() => {
                alert('Secret copied to clipboard!');
            });
        }

        async function enable2FA(secret) {
            const code = document.getElementById('verify_code').value;
            if (!code) return alert('Please enter code');
            
            try {
                const res = await apiCall('/api/admin/2fa/enable', 'POST', { secret, code });
                if (res.success) {
                    alert('2FA Enabled Successfully!');
                    loadConfig();
                } else {
                    alert('Error: ' + res.error);
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        }

        async function disable2FA() {
            const password = prompt("Enter admin password to disable 2FA:");
            if (!password) return;

            try {
                const res = await apiCall('/api/admin/2fa/disable', 'POST', { password });
                if (res.success) {
                    alert('2FA Disabled.');
                    loadConfig();
                } else {
                    alert('Error: ' + res.error);
                }
            } catch (e) {
                alert('Error: ' + e.message);
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
                const data = await apiCall(\`/api/admin/links?page=\${currentPage}&search=\${encodeURIComponent(search)}\`);
                const tbody = document.getElementById('links-body');
                tbody.innerHTML = '';
                
                data.links.forEach(link => {
                    const row = document.createElement('tr');
                    const safeSlug = escapeHtml(link.slug);
                    const safeUrl = escapeHtml(link.url);
                    const safeStatus = escapeHtml(link.status);
                    
                    row.innerHTML = \`
                        <td><a href="/\${safeSlug}" target="_blank">\${safeSlug}</a></td>
                        <td title="\${safeUrl}" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${safeUrl}</td>
                        <td>\${link.visit_count}</td>
                        <td>\${formatDate(link.expires_at)}</td>
                        <td><span class="status-\${safeStatus}">\${safeStatus}</span></td>
                        <td>\${link.interstitial ? 'Yes' : 'No'}</td>
                        <td>
                            <button onclick="toggleStatus('\${safeSlug}', '\${safeStatus}')">
                                \${link.status === 'active' ? 'Pause' : link.status === 'paused' ? 'Disable' : 'Activate'}
                            </button>
                            <button onclick="toggleInterstitial('\${safeSlug}', \${link.interstitial})">
                                \${link.interstitial ? 'No Jump' : 'Jump'}
                            </button>
                            <button class="btn-delete" onclick="deleteLink('\${safeSlug}')">Delete</button>
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

export const interstitialPage = (url: string) => {
    const safeUrl = url.replace(/"/g, '&quot;');
    return `<!DOCTYPE html>
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
        <p style="font-weight: bold; color: #059669; word-break: break-all;">${safeUrl}</p>
        <p id="timer">Redirecting in 5 seconds...</p>
        <a href="${safeUrl}" class="btn">Go Now</a>
    </div>
    <script>
        let count = 5;
        const timer = document.getElementById('timer');
        const interval = setInterval(() => {
            count--;
            timer.textContent = 'Redirecting in ' + count + ' seconds...';
            if (count <= 0) {
                clearInterval(interval);
                window.location.href = "${safeUrl}";
            }
        }, 1000);
    </script>
</body>
</html>`;
};

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
