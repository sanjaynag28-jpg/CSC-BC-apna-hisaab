// ============================================================================
// CASH MANAGEMENT BC — MULTI-TENANT AUTH & GLOBAL NETWORK INTERCEPTOR
// Handles JWT authentication, remote login, shop identification,
// SuperAdmin friend shop creation and offline identity restoration.
// ============================================================================

(function () {
    // ------------------------------------------------------------------------
    // 0. SYNCHRONOUS CURRENT USER RESTORATION FROM LOCAL STORAGE
    // ------------------------------------------------------------------------
    try {
        const rawUser = localStorage.getItem('user');
        if (rawUser) {
            window.currentUser = JSON.parse(rawUser);
        }
    } catch (e) { }

    // ------------------------------------------------------------------------
    // 1. GLOBAL FETCH INTERCEPTOR & AUTH STATE HELPERS
    // ------------------------------------------------------------------------
    const originalFetch = window.fetch;

    function clearClientAuth(preserveUserForOffline = true) {
        localStorage.removeItem('token');
        if (!preserveUserForOffline) {
            localStorage.removeItem('user');
            localStorage.removeItem('cm_last_active_user');
            window.currentUser = null;
        }
        try {
            const host = window.location.hostname;
            const domains = ['', host, '.' + host];
            const paths = ['/', '/api', ''];
            domains.forEach(d => {
                paths.forEach(p => {
                    const domainStr = d ? `; domain=${d}` : '';
                    document.cookie = `token=; Max-Age=0; path=${p || '/'}${domainStr}; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
                });
            });
        } catch (e) { }
    }

    let isTerminatingSession = false;

    function handleSessionTermination(isTerminated = false) {
        // Retain the last identity for presentation only; mutations still require
        // a valid server session.
        clearClientAuth(true);

        if (typeof finishUniversalLoading === 'function') {
            try { finishUniversalLoading(); } catch (e) { }
        }

        if (isTerminatingSession) return;
        isTerminatingSession = true;

        showLoginModal();

        const errEl = document.getElementById('loginErrorMsg');
        if (errEl) {
            if (isTerminated) {
                errEl.innerHTML = '⚠️ <b>Session Terminated:</b> Aapka account kisi doosre device/browser me login ho gaya hai.<br><br>Ek samay me sirf ek hi browser active reh sakta hai.<br>👉 Agar aap is browser me kaam karna chahte hain, to dobara login karein.';
            } else {
                errEl.innerHTML = '⚠️ <b>Session Expired:</b> Kripya dobara login karein.';
            }
            errEl.style.display = 'block';
            errEl.style.background = 'rgba(239, 68, 68, 0.15)';
            errEl.style.borderColor = '#ef4444';
            errEl.style.color = '#fca5a5';
        }

        setTimeout(() => {
            isTerminatingSession = false;
        }, 3000);
    }

    window.fetch = async function (url, options = {}) {
        options = options || {};
        options.headers = options.headers || {};

        const token = localStorage.getItem('token');
        if (token) {
            if (options.headers instanceof Headers) {
                if (!options.headers.has('Authorization')) {
                    options.headers.set('Authorization', `Bearer ${token}`);
                }
            } else if (Array.isArray(options.headers)) {
                options.headers.push(['Authorization', `Bearer ${token}`]);
            } else {
                options.headers['Authorization'] = options.headers['Authorization'] || `Bearer ${token}`;
            }
        }

        const response = await originalFetch(url, options);

        // Handle 401 Unauthorized for shop calls
        if (response.status === 401 && typeof url === 'string' && !url.includes('/api/auth/login')) {
            console.warn('⚠️ Session expired or unauthorized (401):', url);
            try {
                const clone = response.clone();
                clone.json().then(data => {
                    handleSessionTermination(Boolean(data && data.sessionTerminated));
                }).catch(() => handleSessionTermination(false));
            } catch (e) {
                handleSessionTermination(false);
            }
        }

        return response;
    };

    // ------------------------------------------------------------------------
    // 2. AUTH STATE & UI HELPERS
    // ------------------------------------------------------------------------
    window.currentUser = null;

    window.showLoginModal = function () {
        let overlay = document.getElementById('loginOverlay');
        if (!overlay) {
            injectLoginOverlay();
            overlay = document.getElementById('loginOverlay');
        }
        if (overlay) {
            overlay.style.display = 'flex';
            const userInp = document.getElementById('loginUsername');
            if (userInp) userInp.focus();
        }
    };

    window.hideLoginModal = function () {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
    };

    window.primeShopLocalCaches = async function () {
        try {
            console.log('🔄 Refreshing available shop data for local viewing...');
            if (typeof initCachedShopSettings === 'function') initCachedShopSettings();
            if (typeof loadMasterData === 'function') await loadMasterData();
            if (typeof loadShopSettings === 'function') await loadShopSettings();
            if (typeof loadCSCServices === 'function') await loadCSCServices();
            if (typeof loadCSCPage === 'function') await loadCSCPage();
            if (typeof loadCustomersPage === 'function') await loadCustomersPage();
            if (typeof loadTransactions === 'function') await loadTransactions(1);
            if (typeof loadBills === 'function') await loadBills();
            if (typeof loadDashboard === 'function') await loadDashboard();
            if (typeof updateAllSidebarBadges === 'function') updateAllSidebarBadges().catch(() => { });
            console.log('✅ Shop data refresh finished. New mutations still require a live server session.');
        } catch (e) {
            console.warn('Cache priming warning:', e.message);
        }
    };

    window.handleLoginSubmit = async function (e) {
        if (e) e.preventDefault();
        const usernameEl = document.getElementById('loginUsername');
        const passwordEl = document.getElementById('loginPassword');
        const errEl = document.getElementById('loginErrorMsg');
        const btn = document.getElementById('loginSubmitBtn');

        const username = usernameEl ? usernameEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value : '';

        if (!username || !password) {
            if (errEl) {
                errEl.innerText = 'Kripya Username aur Password dono daalein';
                errEl.style.display = 'block';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Login Ho Raha Hai...';
        }
        if (errEl) errEl.style.display = 'none';

        try {
            const res = await originalFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success && data.token) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('cm_last_active_user', JSON.stringify(data.user));
                window.currentUser = data.user;

                updateUserHeaderUI(data.user);
                hideLoginModal();

                if (typeof showToast === 'function') {
                    showToast(`Swagat hai, ${data.user.ShopName || data.user.OwnerName || data.user.Username}!`, 'success');
                }

                // Refresh available local views; this does not queue or persist mutations.
                primeShopLocalCaches();
            } else {
                if (errEl) {
                    errEl.innerText = data.error || 'Username ya Password galat hai';
                    errEl.style.display = 'block';
                    errEl.style.background = 'rgba(239, 68, 68, 0.15)';
                    errEl.style.borderColor = '#ef4444';
                    errEl.style.color = '#fca5a5';
                }
            }
        } catch (err) {
            if (errEl) {
                errEl.innerHTML = '⚠️ <b>Main Server (Sanjay Ji ka PC) is unavailable.</b><br><br>A new browser needs the server to be online to log in. Only allowlisted transaction, account, party, budget, and category creates can be queued when server idempotency was previously verified; other changes are not saved offline. If a save request lost its connection, check the server record before trying again.';
                errEl.style.display = 'block';
                errEl.style.background = 'rgba(239, 68, 68, 0.15)';
                errEl.style.borderColor = '#ef4444';
                errEl.style.color = '#fca5a5';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Login Karein 🚀';
            }
        }
    };

    window.handleLogout = async function () {
        if (confirm('Kya aap logout karna chahte hain?')) {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
            } catch (e) { }
            clearClientAuth();
            showLoginModal();
            const errEl = document.getElementById('loginErrorMsg');
            if (errEl) {
                errEl.innerHTML = '✅ Safalta se logout ho gaya. Naye session ke liye login karein.';
                errEl.style.display = 'block';
                errEl.style.background = 'rgba(16, 185, 129, 0.15)';
                errEl.style.borderColor = '#10b981';
                errEl.style.color = '#34d399';
            }
        }
    };

    function updateUserHeaderUI(user) {
        if (!user) return;
        const shopEl = document.getElementById('activeShopName');
        const userEl = document.getElementById('activeUserName');
        const pill = document.getElementById('userShopPill');

        if (shopEl) shopEl.innerText = user.ShopName || 'Meri Dukaan';
        if (userEl) userEl.innerText = `${user.OwnerName || user.Username} (${user.Role})`;
        if (pill) {
            pill.style.display = 'block';
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                try { window.lucide.createIcons(); } catch (e) { }
            }
        }

        // SuperAdmin specific UI buttons (Shops management tab in Settings)
        const tenantTabBtn = document.getElementById('btn-tab-tenants');
        const errorsTabBtn = document.getElementById('btn-tab-errors');
        if (tenantTabBtn) {
            tenantTabBtn.style.display = (user.Role === 'SuperAdmin') ? 'flex' : 'none';
        }
        if (errorsTabBtn) {
            errorsTabBtn.style.display = (user.Role === 'SuperAdmin') ? 'flex' : 'none';
        }
    }

    // ------------------------------------------------------------------------
    // 3. INJECT LOGIN OVERLAY HTML
    // ------------------------------------------------------------------------
    function injectLoginOverlay() {
        if (document.getElementById('loginOverlay')) return;

        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const hasToken = !!localStorage.getItem('token');
        const initialDisplay = (!isLocal && !hasToken) ? 'flex' : 'none';

        const overlay = document.createElement('div');
        overlay.id = 'loginOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px);
            display: ${initialDisplay}; align-items: center; justify-content: center; padding: 20px;
        `;

        overlay.innerHTML = `
            <div style="background: #1e293b; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; width: 100%; max-width: 420px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); overflow: hidden;">
                <div style="background: linear-gradient(135deg, #059669, #0284c7); padding: 24px; text-align: center; color: white;">
                    <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: rgba(255,255,255,0.2); border-radius: 50%; margin-bottom: 12px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>
                    </div>
                    <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">Cash Management & BC</h2>
                    <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">Apni Dukaan / CSP Login Karein</p>
                </div>

                <form id="loginForm" onsubmit="handleLoginSubmit(event)" style="padding: 24px;">
                    <div id="loginErrorMsg" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px;"></div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">Username (यूज़रनेम)</label>
                        <input type="text" id="loginUsername" placeholder="e.g. admin ya dukan username" autocomplete="username" required style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 12px 14px; color: white; font-size: 14px; outline: none;">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">Password (पासवर्ड)</label>
                        <input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password" required style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 12px 14px; color: white; font-size: 14px; outline: none;">
                    </div>

                    <button type="submit" id="loginSubmitBtn" style="width: 100%; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                        Login Karein 🚀
                    </button>

                    ${isLocal ? `
                    <div style="margin-top: 14px; text-align: center;">
                        <button type="button" onclick="autoLoginLocalAdmin()" style="background: none; border: none; color: #38bdf8; font-size: 12px; text-decoration: underline; cursor: pointer;">
                            ⚡ Localhost Super Admin Direct Login
                        </button>
                    </div>
                    ` : ''}

                    <div style="margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px; text-align: center; font-size: 11px; color: #64748b;">
                        Surakshit Local Server Hub • 100% Isolated Shop Data
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    window.autoLoginLocalAdmin = async function () {
        const u = document.getElementById('loginUsername');
        const p = document.getElementById('loginPassword');
        if (u) u.value = 'admin';
        if (p) p.value = 'admin';
        await handleLoginSubmit();
    };

    // ------------------------------------------------------------------------
    // 4. CHECK AUTH STATE ON STARTUP (LOCAL & SAME WI-FI / LAN)
    // ------------------------------------------------------------------------
    async function checkAuthSession() {
        try {
            injectLoginOverlay();
            const host = window.location.hostname;
            const isLocal = ['localhost', '127.0.0.1'].includes(host);
            const token = localStorage.getItem('token');

            // If on localhost and no specific token, load as SuperAdmin directly!
            if (isLocal && !token) {
                hideLoginModal();
                updateUserHeaderUI({ ShopName: 'CSC & BC Kendra', OwnerName: 'Admin', Role: 'SuperAdmin' });
                if (typeof loadMasterData === 'function') loadMasterData();
                if (typeof loadDashboard === 'function') loadDashboard();
                return;
            }

            // Other connected PCs on same Wi-Fi without token must log in to select their shop
            if (!token) {
                showLoginModal();
                return;
            }

            try {
                const res = await originalFetch('/api/auth/me', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.user) {
                        window.currentUser = data.user;
                        localStorage.setItem('user', JSON.stringify(data.user));
                        updateUserHeaderUI(data.user);
                        hideLoginModal();
                        if (typeof loadMasterData === 'function') await loadMasterData();
                        if (typeof loadDashboard === 'function') await loadDashboard();
                        return;
                    }
                }

                if (res.status === 401) {
                    handleSessionTermination(false);
                    return;
                }
            } catch (netErr) {
                console.warn('⚠️ Server unreachable:', netErr.message);
                if (isLocal) {
                    hideLoginModal();
                    updateUserHeaderUI({ ShopName: 'CSC & BC Kendra', OwnerName: 'Admin', Role: 'SuperAdmin' });
                } else {
                    showLoginModal();
                }
            }

            if (isLocal) {
                updateUserHeaderUI({ ShopName: 'CSC & BC Kendra', OwnerName: 'Admin', Role: 'SuperAdmin' });
            }
        } catch (e) {
            console.warn('Auth check error:', e.message);
        }
    }

    // 100% Direct LAN / Localhost: Purge legacy Service Workers and Caches
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (let registration of registrations) {
                registration.unregister();
                console.log('🧹 [ServiceWorker] Unregistered legacy PWA Service Worker');
            }
        });
    }
    if ('caches' in window) {
        caches.keys().then(function (names) {
            for (let name of names) {
                caches.delete(name);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', checkAuthSession);

    // ------------------------------------------------------------------------
    // 5. SUPERADMIN SHOPS / MITRA MANAGEMENT
    // ------------------------------------------------------------------------
    window.loadTenantShops = async function () {
        const listEl = document.getElementById('tenantsListTableBody');
        if (!listEl) return;

        listEl.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">Dukaan list load ho rahi hai...</td></tr>';

        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();

            const users = data.data || data.users;
            if (!data.success || !users) {
                listEl.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error: ${data.error || 'Shops load nahi ho payi'}</td></tr>`;
                return;
            }
            if (users.length === 0) {
                listEl.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8;">Abhi koi doosri dukan nahi bani hai. "+ Nayi Dukaan Jodein" button dabayein.</td></tr>';
                return;
            }

            window.allTenantUsers = users;

            listEl.innerHTML = users.map(u => `
                <tr style="border-bottom: 1.5px solid var(--border, #cbd5e1); transition: background 0.15s ease;" onmouseover="this.style.background='var(--bg-card-hover, #f8fafc)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 14px 16px; vertical-align: middle;">
                        <span style="background: rgba(2, 132, 199, 0.12); color: #0284c7; padding: 5px 10px; border-radius: 6px; font-size: 13px; font-weight: 800; display: inline-block;">#${u.UserID}</span>
                    </td>
                    <td style="padding: 14px 16px; vertical-align: middle;">
                        <div style="font-weight: 800; font-size: 14.5px; color: var(--text-primary, #0f172a); line-height: 1.3;">${(u.ShopName || 'N/A').replace(/</g, '&lt;')}</div>
                        <div style="font-size: 12px; color: var(--text-muted, #475569); font-weight: 600; margin-top: 3px;">👤 Owner: ${(u.OwnerName || '-').replace(/</g, '&lt;')}</div>
                    </td>
                    <td style="padding: 14px 16px; vertical-align: middle; font-size: 13.5px; font-weight: 700; color: var(--text-secondary, #1e293b); font-family: monospace;">
                        ${(u.MobileNumber || '-').replace(/</g, '&lt;')}
                    </td>
                    <td style="padding: 14px 16px; vertical-align: middle;">
                        <span style="background: #ecfdf5; border: 1.5px solid #a7f3d0; color: #047857; padding: 4px 10px; border-radius: 6px; font-size: 12.5px; font-weight: 800; font-family: monospace; display: inline-block;">
                            ${(u.Username || '').replace(/</g, '&lt;')}
                        </span>
                    </td>
                    <td style="padding: 14px 16px; vertical-align: middle;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="text" readonly value="${u.ApiToken || ''}" style="width: 135px; background: var(--bg-input, #f1f5f9); border: 1.5px solid var(--border, #cbd5e1); border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 600; color: var(--text-primary, #0f172a); font-family: monospace; outline: none;" id="tok-${u.UserID}">
                            <button type="button" onclick="copyToClipboard('${u.ApiToken}')" style="background: #0284c7; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);">
                                Copy
                            </button>
                        </div>
                    </td>
                    <td style="padding: 14px 16px; vertical-align: middle;">
                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 800; ${u.IsActive ? 'background: #ecfdf5; border: 1.5px solid #10b981; color: #047857;' : 'background: #fef2f2; border: 1.5px solid #ef4444; color: #b91c1c;'}">
                            ${u.IsActive ? '● Active' : '○ Blocked'}
                        </span>
                    </td>
                    <td style="padding: 14px 16px; vertical-align: middle; text-align: right;">
                        <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                            <button type="button" onclick="openEditShopModal(${u.UserID})" style="background: #2563eb; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);" title="Dukaan ki details edit karein">
                                ✏️ Edit
                            </button>
                            <button type="button" onclick="promptResetPassword(${u.UserID}, '${(u.Username || '').replace(/'/g, "\\'")}')" style="background: #d97706; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.25);" title="Naya password set karein">
                                Reset PWD
                            </button>
                            ${u.UserID !== 1 ? `
                                <button type="button" onclick="toggleShopStatus(${u.UserID}, ${u.IsActive ? 0 : 1})" style="background: ${u.IsActive ? '#dc2626' : '#059669'}; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);" title="${u.IsActive ? 'Dukaan ko block karein' : 'Dukaan ko activate karein'}">
                                    ${u.IsActive ? 'Block' : 'Activate'}
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `).join('');

        } catch (err) {
            listEl.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error: ${err.message}</td></tr>`;
        }
    };

    window.copyToClipboard = function (text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast('API Token Copy Ho Gaya! Extension me paste karein.', 'success');
            else alert('API Token Copied!');
        });
    };

    window.toggleShopStatus = async function (userId, newStatus) {
        if (!confirm(`Kya aap is dukan ka status badalna chahte hain?`)) return;
        try {
            const res = await fetch(`/api/admin/users/${userId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: newStatus })
            });
            const data = await res.json();
            if (data.success) {
                if (typeof showToast === 'function') showToast('Status update ho gaya!', 'success');
                loadTenantShops();
            } else {
                alert(data.error || 'Status update fail');
            }
        } catch (e) {
            alert(e.message);
        }
    };

    window.promptResetPassword = async function (userId, username) {
        const newPwd = prompt(`Dukaan '${username}' ke liye naya password darz karein:`);
        if (!newPwd || !newPwd.trim()) return;

        try {
            const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: newPwd.trim() })
            });
            const data = await res.json();
            if (data.success) {
                if (typeof showToast === 'function') showToast(`Password update ho gaya!`, 'success');
                else alert('Password reset ho gaya!');
            } else {
                alert(data.error || 'Password reset fail');
            }
        } catch (e) {
            alert(e.message);
        }
    };

    // ------------------------------------------------------------------------
    // EDIT SHOP MODAL
    // ------------------------------------------------------------------------
    window.openEditShopModal = function (userId) {
        const u = (window.allTenantUsers || []).find(item => item.UserID === userId);
        if (!u) {
            alert('Dukaan ki jaankari nahi mili');
            return;
        }

        let m = document.getElementById('modal-edit-shop');
        if (!m) {
            injectEditShopModal();
            m = document.getElementById('modal-edit-shop');
        }

        document.getElementById('editShopId').value = u.UserID;
        document.getElementById('editShopName').value = u.ShopName || '';
        document.getElementById('editOwnerName').value = u.OwnerName || '';
        document.getElementById('editShopMobile').value = u.MobileNumber || '';
        document.getElementById('editShopUsername').value = u.Username || '';
        document.getElementById('editShopRole').value = u.Role || 'ShopOwner';

        if (m) m.style.display = 'flex';
    };

    window.closeEditShopModal = function () {
        const m = document.getElementById('modal-edit-shop');
        if (m) m.style.display = 'none';
    };

    window.submitEditShopForm = async function (e) {
        if (e) e.preventDefault();
        const id = document.getElementById('editShopId').value;
        const shopName = document.getElementById('editShopName').value.trim();
        const ownerName = document.getElementById('editOwnerName').value.trim();
        const mobileNumber = document.getElementById('editShopMobile').value.trim();
        const role = document.getElementById('editShopRole').value;
        const btn = document.getElementById('submitEditShopBtn');

        if (!shopName || !ownerName) {
            alert('Dukaan ka naam aur malik ka naam zaroori hain.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Updating...';
        }

        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopName, ownerName, mobileNumber, role })
            });
            const data = await res.json();
            if (data.success) {
                if (typeof showToast === 'function') showToast(`🎉 '${shopName}' ki details update ho gayi!`, 'success');
                else alert('Dukaan update ho gayi!');
                closeEditShopModal();
                loadTenantShops();
                if (window.currentUser && Number(id) === Number(window.currentUser.UserID) && typeof loadShopSettings === 'function') {
                    loadShopSettings();
                }
            } else {
                alert(data.error || 'Update failed');
            }
        } catch (err) {
            alert(err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Save Changes 💾';
            }
        }
    };

    function injectEditShopModal() {
        if (document.getElementById('modal-edit-shop')) return;

        const m = document.createElement('div');
        m.id = 'modal-edit-shop';
        m.style.cssText = `
            position: fixed; inset: 0; z-index: 99998;
            background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(6px);
            display: none; align-items: center; justify-content: center; padding: 20px;
        `;

        m.innerHTML = `
            <div style="background: var(--bg-card, #ffffff); color: var(--text-primary, #0f172a); border: 1.5px solid var(--border, #cbd5e1); border-radius: 14px; width: 100%; max-width: 480px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); overflow: hidden;">
                <div style="padding: 18px 24px; border-bottom: 1.5px solid var(--border, #e2e8f0); display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary, #f8fafc);">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-primary, #0f172a);">✏️ Dukaan Details Edit Karein</h3>
                    <button type="button" onclick="closeEditShopModal()" style="background: none; border: none; color: var(--text-muted, #64748b); font-size: 24px; cursor: pointer; line-height: 1;">&times;</button>
                </div>
                <form onsubmit="submitEditShopForm(event)" style="padding: 20px 24px;">
                    <input type="hidden" id="editShopId">

                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Dukaan / Center Ka Naam *</label>
                        <input type="text" id="editShopName" required style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                    </div>
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Dukandar (Owner) Ka Naam *</label>
                        <input type="text" id="editOwnerName" required style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                    </div>
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Mobile Number</label>
                        <input type="text" id="editShopMobile" style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                        <div>
                            <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Username (Readonly)</label>
                            <input type="text" id="editShopUsername" readonly style="width: 100%; box-sizing: border-box; background: var(--bg-secondary, #f1f5f9); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 700; color: var(--text-muted, #64748b); outline: none; cursor: not-allowed;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Role</label>
                            <select id="editShopRole" style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                                <option value="ShopOwner">Shop Owner</option>
                                <option value="Operator">Operator / Staff</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; border-top: 1.5px solid var(--border, #e2e8f0); padding-top: 16px;">
                        <button type="button" onclick="closeEditShopModal()" style="background: var(--bg-secondary, #e2e8f0); color: var(--text-primary, #334155); border: 1px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 16px; font-weight: 700; cursor: pointer;">Cancel</button>
                        <button type="submit" id="submitEditShopBtn" style="background: #2563eb; color: white; border: none; border-radius: 8px; padding: 10px 20px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(37,99,235,0.3);">Save Changes 💾</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(m);
    }

    // ------------------------------------------------------------------------
    // CREATE SHOP MODAL
    // ------------------------------------------------------------------------
    window.openCreateShopModal = function () {
        let m = document.getElementById('modal-create-shop');
        if (!m) {
            injectCreateShopModal();
            m = document.getElementById('modal-create-shop');
        }
        if (m) m.style.display = 'flex';
    };

    window.closeCreateShopModal = function () {
        const m = document.getElementById('modal-create-shop');
        if (m) m.style.display = 'none';
    };

    window.submitCreateShopForm = async function (e) {
        if (e) e.preventDefault();
        const shopName = document.getElementById('newShopName').value.trim();
        const ownerName = document.getElementById('newOwnerName').value.trim();
        const mobile = document.getElementById('newShopMobile').value.trim();
        const username = document.getElementById('newShopUsername').value.trim();
        const password = document.getElementById('newShopPassword').value;
        const role = document.getElementById('newShopRole').value;
        const btn = document.getElementById('submitNewShopBtn');

        if (!shopName || !username || !password) {
            alert('Shop Name, Username, aur Password zaroori hain!');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Creating Shop...';
        }

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopName, ownerName, mobileNumber: mobile, username, password, role
                })
            });
            const data = await res.json();

            if (data.success) {
                if (typeof showToast === 'function') showToast(`🎉 '${shopName}' dukan kamyabi se jud gayi!`, 'success');
                else alert(`Dukaan '${shopName}' ban gayi!`);
                closeCreateShopModal();
                loadTenantShops();
            } else {
                alert(data.error || 'Dukaan create nahi ho payi');
            }
        } catch (err) {
            alert(err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = '+ Dukaan Banayein';
            }
        }
    };

    function injectCreateShopModal() {
        if (document.getElementById('modal-create-shop')) return;

        const m = document.createElement('div');
        m.id = 'modal-create-shop';
        m.style.cssText = `
            position: fixed; inset: 0; z-index: 99998;
            background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(6px);
            display: none; align-items: center; justify-content: center; padding: 20px;
        `;

        m.innerHTML = `
            <div style="background: var(--bg-card, #ffffff); color: var(--text-primary, #0f172a); border: 1.5px solid var(--border, #cbd5e1); border-radius: 14px; width: 100%; max-width: 480px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); overflow: hidden;">
                <div style="padding: 18px 24px; border-bottom: 1.5px solid var(--border, #e2e8f0); display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary, #f8fafc);">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-primary, #0f172a);">🏪 Nayi Dukaan / Dost Jodein</h3>
                    <button type="button" onclick="closeCreateShopModal()" style="background: none; border: none; color: var(--text-muted, #64748b); font-size: 24px; cursor: pointer; line-height: 1;">&times;</button>
                </div>
                <form onsubmit="submitCreateShopForm(event)" style="padding: 20px 24px;">
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Dukaan / Center Ka Naam *</label>
                        <input type="text" id="newShopName" placeholder="e.g. Radhey Online Center" required style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                    </div>
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Dukandar (Owner) Ka Naam</label>
                        <input type="text" id="newOwnerName" placeholder="e.g. Ramesh Kumar" style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                    </div>
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Mobile Number</label>
                        <input type="text" id="newShopMobile" placeholder="e.g. 9876543210" style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                        <div>
                            <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Username *</label>
                            <input type="text" id="newShopUsername" placeholder="e.g. radhey" required style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Password *</label>
                            <input type="password" id="newShopPassword" placeholder="••••••••" required style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                        </div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary, #334155); margin-bottom: 5px;">Role</label>
                        <select id="newShopRole" style="width: 100%; box-sizing: border-box; background: var(--bg-input, #ffffff); border: 1.5px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); outline: none;">
                            <option value="ShopOwner">Shop Owner (Apni dukan ka poora control)</option>
                            <option value="Operator">Operator / Staff (Daily transactions)</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1.5px solid var(--border, #e2e8f0); padding-top: 16px;">
                        <button type="button" onclick="closeCreateShopModal()" style="background: var(--bg-secondary, #e2e8f0); color: var(--text-primary, #334155); border: 1px solid var(--border, #cbd5e1); border-radius: 8px; padding: 10px 16px; font-weight: 700; cursor: pointer;">Cancel</button>
                        <button type="submit" id="submitNewShopBtn" style="background: #10b981; color: white; border: none; border-radius: 8px; padding: 10px 20px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(16,185,129,0.3);">+ Dukaan Banayein</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(m);
    }

    // ------------------------------------------------------------------------
    // 6. AUTOMATIC LIVE PROJECT UPDATE PROPAGATION
    // Whenever Sanjay Nag updates the codebase on the server, Mitra's browser
    // automatically detects the new build, purges stale caches, and reloads
    // cleanly to run the latest version.
    // ------------------------------------------------------------------------
    let isUpdatingApp = false;

    async function checkForProjectUpdates() {
        if (!navigator.onLine || isUpdatingApp) return;
        try {
            const res = await originalFetch(`/api/app-version?_t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !data.success || !data.version) return;

            const serverVersion = String(data.version);
            const localVersion = localStorage.getItem('cm_active_app_version');

            if (!localVersion) {
                // First initialization: save current version silently
                localStorage.setItem('cm_active_app_version', serverVersion);
                return;
            }

            if (serverVersion !== localVersion) {
                isUpdatingApp = true;
                console.log(`🚀 [AutoUpdate] Naya update mila! Server: ${serverVersion}, Local: ${localVersion}`);
                localStorage.setItem('cm_active_app_version', serverVersion);

                // 1. Clear old caches if any
                if ('caches' in window) {
                    try {
                        const keys = await caches.keys();
                        await Promise.all(keys.map(k => caches.delete(k)));
                    } catch (e) { }
                }

                // 2. Show smooth floating update toast and reload cleanly
                showUpdateBannerAndReload();
            }
        } catch (e) { }
    }

    function showUpdateBannerAndReload() {
        try {
            const existing = document.getElementById('cm-update-banner');
            if (existing) existing.remove();

            const banner = document.createElement('div');
            banner.id = 'cm-update-banner';
            banner.style.cssText = `
                position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
                background: linear-gradient(135deg, #059669, #0284c7); color: white;
                padding: 10px 20px; border-radius: 30px; font-size: 13px; font-weight: 800;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 9999999;
                display: flex; align-items: center; gap: 12px; font-family: system-ui;
                border: 1.5px solid rgba(255,255,255,0.4); animation: slideDown 0.3s ease;
            `;
            banner.innerHTML = `
                <span>🚀 Naya version upalabdh hai!</span>
                <button onclick="window.location.reload(true)" style="background: white; color: #0284c7; border: none; padding: 4px 12px; border-radius: 20px; font-weight: 800; cursor: pointer; font-size: 12px;">
                    ⚡ Abhi Reload Karein
                </button>
                <button onclick="this.parentElement.remove()" style="background: transparent; border: none; color: white; cursor: pointer; font-size: 14px; margin-left: 4px;">✕</button>
            `;
            document.body.appendChild(banner);
        } catch (e) { }
    }

    window.addEventListener('load', () => setTimeout(checkForProjectUpdates, 5000));
    window.addEventListener('online', () => setTimeout(checkForProjectUpdates, 2000));
    setInterval(checkForProjectUpdates, 10 * 60 * 1000);

    // ------------------------------------------------------------------------
    // 7. SUPERADMIN CLIENT ERROR LOGS VIEWER
    // ------------------------------------------------------------------------
    window.loadClientErrorLogs = async function () {
        const tbody = document.getElementById('clientErrorsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">Error logs load ho rahe hain...</td></tr>';

        try {
            const res = await fetch('/api/admin/client-errors');
            const data = await res.json();
            if (!data.success || !Array.isArray(data.errors)) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">Error: ${data.error || 'Logs load nahi ho paye'}</td></tr>`;
                return;
            }

            const badge = document.getElementById('tabBadgeErrorLogs');
            if (badge) badge.innerText = `${data.total || 0} Logs`;

            if (data.errors.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #10b981; font-weight: 700;">✅ Sab kuch theek hai! Koi client error nahi mila.</td></tr>';
                return;
            }

            tbody.innerHTML = data.errors.map(e => `
                <tr style="border-bottom: 1px solid var(--border, #cbd5e1);">
                    <td style="padding: 12px 16px; font-weight: 800; color: #64748b; font-size: 12px; vertical-align: top;">#${e.ErrorID}</td>
                    <td style="padding: 12px 16px; vertical-align: top;">
                        <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">${(e.ShopName || 'N/A').replace(/</g, '&lt;')}</div>
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">👤 ${(e.OwnerName || e.Username || '-').replace(/</g, '&lt;')}</div>
                    </td>
                    <td style="padding: 12px 16px; vertical-align: top;">
                        <span style="background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; font-family: monospace; display: inline-block;">
                            ${(e.ErrorType || 'error').replace(/</g, '&lt;')}
                        </span>
                    </td>
                    <td style="padding: 12px 16px; vertical-align: top;">
                        <div style="font-size: 13px; font-weight: 700; color: #ef4444; word-break: break-word;">${(e.ErrorMessage || '').replace(/</g, '&lt;')}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-family: monospace;">${(e.Url || '').replace(/</g, '&lt;')}</div>
                        ${e.ErrorStack ? `
                            <details style="margin-top: 6px;">
                                <summary style="font-size: 11px; color: #0284c7; cursor: pointer; font-weight: 600;">🔍 View Stack Trace</summary>
                                <pre style="background: var(--bg-secondary, #0f172a); color: var(--text-secondary, #94a3b8); padding: 10px; border-radius: 6px; font-size: 11px; overflow-x: auto; margin-top: 6px; white-space: pre-wrap; font-family: monospace; border: 1px solid var(--border);">${(e.ErrorStack).replace(/</g, '&lt;')}</pre>
                            </details>
                        ` : ''}
                    </td>
                    <td style="padding: 12px 16px; font-size: 11.5px; color: var(--text-muted); text-align: right; white-space: nowrap; vertical-align: top;">
                        ${new Date(e.CreatedAt).toLocaleString('hi-IN')}
                    </td>
                </tr>
            `).join('');
            if (window.lucide) lucide.createIcons();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">Error: ${err.message}</td></tr>`;
        }
    };

    window.clearAllClientErrors = async function () {
        if (!confirm('Kya aap sabhi client error logs saaf karna chahte hain?')) return;
        try {
            const res = await fetch('/api/admin/client-errors', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                if (typeof showToast === 'function') showToast('Sabhi client error logs saaf kar diye gaye!', 'success');
                loadClientErrorLogs();
            } else {
                alert(data.error || 'Clear failed');
            }
        } catch (e) {
            alert(e.message);
        }
    };
})();

