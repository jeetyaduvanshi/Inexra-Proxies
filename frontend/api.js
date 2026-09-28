/**
 * api.js — API client for Google Apps Script backend
 *
 * DEMO MODE: When GAS_URL is not configured, the app runs with
 * a built-in mock backend so you can preview the full UI locally.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  CONFIGURATION — set your deployed GAS URL here         │
 * │  to connect to real Google Sheets backend               │
 * └─────────────────────────────────────────────────────────┘
 */

const API_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzoevmbmhgbLTThkNm6aDczEA4XQYGLp8KAnLKj9_HMelURSZ8MX2vTlRPHqW2aftd5VQ/exec'
};

// ── Demo Mode Detection ───────────────────────────────────────
function isDemoMode() {
  return !API_CONFIG.GAS_URL || API_CONFIG.GAS_URL.includes('YOUR_APPS_SCRIPT');
}

// ── Demo / Mock Backend ───────────────────────────────────────
const DemoBackend = (() => {
  // Persisted state in localStorage so changes survive page reload
  function load(key, fallback) {
    try { const v = localStorage.getItem('demo_' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem('demo_' + key, JSON.stringify(val)); } catch { }
  }

  const DEMO_USERS = [
    { id: 'U001', username: 'admin', password: 'admin123', display_name: 'Administrator', role: 'admin', active: 'TRUE', created_at: '2026-09-01T00:00:00.000Z' },
    { id: 'U002', username: 'user01', password: 'user123', display_name: 'User 01', role: 'user', active: 'TRUE', created_at: '2026-09-05T00:00:00.000Z' },
  ];

  const INITIAL_PROXIES = [
    { id: 'P0001', user_id: 'U001', country: 'UK', provider: 'LokiProxy', proxy: 'gb1.lokiproxy.net:8080:user01:pass01', status: 'available', created_at: '2026-09-10T10:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0002', user_id: 'U001', country: 'UK', provider: 'LokiProxy', proxy: 'gb2.lokiproxy.net:8080:user02:pass02', status: 'available', created_at: '2026-09-10T10:01:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0003', user_id: 'U001', country: 'UK', provider: 'DataImpulse', proxy: 'uk3.dataimp.io:9090:impuser3:imppass3', status: 'used', created_at: '2026-09-10T10:02:00.000Z', used_at: '2026-09-15T08:30:00.000Z', last_copied_at: '2026-09-15T08:30:00.000Z', copy_count: 1 },
    { id: 'P0004', user_id: 'U001', country: 'US', provider: 'LokiProxy', proxy: 'us1.lokiproxy.net:8080:user04:pass04', status: 'available', created_at: '2026-09-11T09:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0005', user_id: 'U001', country: 'US', provider: 'LokiProxy', proxy: 'us2.lokiproxy.net:8080:user05:pass05', status: 'available', created_at: '2026-09-11T09:01:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0006', user_id: 'U001', country: 'US', provider: 'DataImpulse', proxy: 'us3.dataimp.io:9090:impuser6:imppass6', status: 'used', created_at: '2026-09-11T09:02:00.000Z', used_at: '2026-09-20T14:00:00.000Z', last_copied_at: '2026-09-20T14:00:00.000Z', copy_count: 2 },
    { id: 'P0007', user_id: 'U001', country: 'DE', provider: 'LokiProxy', proxy: 'de1.lokiproxy.net:8080:user07:pass07', status: 'available', created_at: '2026-09-12T11:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0008', user_id: 'U001', country: 'DE', provider: 'Other', proxy: 'de2.proxyhub.de:3128:deuser8:depass8', status: 'available', created_at: '2026-09-12T11:01:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0009', user_id: 'U001', country: 'FR', provider: 'DataImpulse', proxy: 'fr1.dataimp.io:9090:fruser9:frpass9', status: 'available', created_at: '2026-09-13T08:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0010', user_id: 'U001', country: 'FR', provider: 'LokiProxy', proxy: 'fr2.lokiproxy.net:8080:user10:pass10', status: 'used', created_at: '2026-09-13T08:01:00.000Z', used_at: '2026-09-25T16:45:00.000Z', last_copied_at: '2026-09-25T16:45:00.000Z', copy_count: 1 },
    { id: 'P0011', user_id: 'U002', country: 'UK', provider: 'LokiProxy', proxy: 'gb5.lokiproxy.net:8080:u2p1:u2pw1', status: 'available', created_at: '2026-09-14T10:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0012', user_id: 'U002', country: 'SG', provider: 'DataImpulse', proxy: 'sg1.dataimp.io:9090:sguser:sgpass', status: 'available', created_at: '2026-09-14T11:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
  ];

  const INITIAL_ACTIVITY = [
    { id: 'A001', user_id: 'U001', proxy_id: 'P0003', action: 'ADD_PROXY', timestamp: '2026-09-10T10:02:00.000Z', country: 'UK', provider: 'DataImpulse', proxy: 'uk3.dataimp.io:9090:impuser3:imppass3' },
    { id: 'A002', user_id: 'U001', proxy_id: 'P0003', action: 'COPY_PROXY', timestamp: '2026-09-15T08:30:00.000Z', country: 'UK', provider: 'DataImpulse', proxy: 'uk3.dataimp.io:9090:impuser3:imppass3' },
    { id: 'A003', user_id: 'U001', proxy_id: 'P0006', action: 'COPY_PROXY', timestamp: '2026-09-20T14:00:00.000Z', country: 'US', provider: 'DataImpulse', proxy: 'us3.dataimp.io:9090:impuser6:imppass6' },
    { id: 'A004', user_id: 'U001', proxy_id: 'P0010', action: 'COPY_PROXY', timestamp: '2026-09-25T16:45:00.000Z', country: 'FR', provider: 'LokiProxy', proxy: 'fr2.lokiproxy.net:8080:user10:pass10' },
  ];

  let users = load('users', DEMO_USERS);
  let proxies = load('proxies', INITIAL_PROXIES);
  let activity = load('activity', INITIAL_ACTIVITY);
  let sessions = load('sessions', {});

  function saveAll() { save('users', users); save('proxies', proxies); save('activity', activity); save('sessions', sessions); }

  function ok(data, msg) { return { success: true, data, message: msg || '' }; }
  function err(msg) { return { success: false, data: null, message: msg }; }

  function genId(prefix) { return prefix + Date.now() + Math.floor(Math.random() * 9999); }
  function now() { return new Date().toISOString(); }

  function getSession(token) {
    const s = sessions[token];
    if (!s) return null;
    if (new Date() > new Date(s.expires)) { delete sessions[token]; saveAll(); return null; }
    return s;
  }

  function getUserProxies(userId) {
    return proxies.filter(p => p.user_id === userId && p.status !== 'deleted');
  }

  const handle = {
    login: ({ username, password }) => {
      const user = users.find(u => u.username === username && u.password === password && u.active === 'TRUE');
      if (!user) return err('Invalid credentials.');
      const token = genId('tok');
      sessions[token] = { userId: user.id, expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString() };
      saveAll();
      return ok({ token, user: { user_id: user.id, username: user.username, display_name: user.display_name, role: user.role, created_at: user.created_at } }, 'Login successful');
    },

    logout: ({ token }) => { if (token) { delete sessions[token]; saveAll(); } return ok(null, 'Logged out.'); },

    me: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const user = users.find(u => u.id === s.userId);
      if (!user) return err('Unauthorized');
      return ok({ user_id: user.id, username: user.username, display_name: user.display_name, role: user.role, created_at: user.created_at });
    },

    getDashboard: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      const mine = (caller && caller.role === 'admin') ? proxies.filter(p => p.status !== 'deleted') : getUserProxies(s.userId);
      const countries = new Set(mine.map(p => p.country));
      return ok({ stats: { total: mine.length, available: mine.filter(p => p.status === 'available').length, used: mine.filter(p => p.status === 'used').length, countries: countries.size }, proxies: mine });
    },

    getProxies: ({ token, filters, userId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      let mine = (caller && caller.role === 'admin') ? proxies.filter(p => p.status !== 'deleted') : getUserProxies(s.userId);
      if (caller && caller.role === 'admin' && userId) {
        mine = mine.filter(p => p.user_id === userId);
      }
      if (filters) {
        if (filters.country) mine = mine.filter(p => p.country === filters.country);
        if (filters.provider) mine = mine.filter(p => p.provider === filters.provider);
        if (filters.status) mine = mine.filter(p => p.status === filters.status);
      }
      return ok(mine);
    },

    addProxies: ({ token, country, provider, proxies: lines, userId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      const targetUserId = (caller && caller.role === 'admin' && userId) ? userId : s.userId;
      const existing = new Set(getUserProxies(targetUserId).map(p => p.proxy.trim().toLowerCase()));
      let added = 0, skipped = 0;
      const n = now();
      (lines || []).forEach(line => {
        const clean = (line || '').trim();
        if (!clean) return;
        if (existing.has(clean.toLowerCase())) { skipped++; return; }
        existing.add(clean.toLowerCase());
        proxies.push({ id: genId('P'), user_id: targetUserId, country, provider, proxy: clean, status: 'available', created_at: n, used_at: '', last_copied_at: '', copy_count: 0 });
        added++;
      });
      activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: 'BATCH', action: 'ADD_PROXY', timestamp: n, country, provider, proxy: added + ' proxies added' });
      saveAll();
      return ok({ added, skipped }, added + ' proxies added.');
    },

    copyProxy: ({ token, proxyId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const p = proxies.find(x => x.id === proxyId);
      if (!p) return err('Proxy not found.');
      if (p.user_id !== s.userId) return err('Access denied.');
      const n = now();
      p.status = 'used'; p.used_at = n; p.last_copied_at = n; p.copy_count = (p.copy_count || 0) + 1;
      activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: proxyId, action: 'COPY_PROXY', timestamp: n, country: p.country, provider: p.provider, proxy: p.proxy });
      saveAll();
      return ok({ ...p }, 'Copied.');
    },

    resetProxy: ({ token, proxyId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const p = proxies.find(x => x.id === proxyId);
      if (!p) return err('Proxy not found.');
      const user = DEMO_USERS.find(u => u.id === s.userId);
      if (p.user_id !== s.userId && user.role !== 'admin') return err('Access denied.');
      const n = now();
      p.status = 'available'; p.used_at = ''; p.last_copied_at = '';
      activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: proxyId, action: 'RESET_PROXY', timestamp: n, country: p.country, provider: p.provider, proxy: p.proxy });
      saveAll();
      return ok({ ...p }, 'Reset.');
    },

    copyMultipleProxies: ({ token, proxyIds }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      if (!proxyIds || !proxyIds.length) return err('No proxies specified.');
      const user = DEMO_USERS.find(u => u.id === s.userId);
      const n = now();
      const updated = [];
      proxyIds.forEach(pid => {
        const p = proxies.find(x => x.id === pid);
        if (p && (p.user_id === s.userId || (user && user.role === 'admin'))) {
          p.status = 'used';
          p.used_at = n;
          p.last_copied_at = n;
          p.copy_count = (p.copy_count || 0) + 1;
          updated.push(p);
          activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: p.id, action: 'COPY_PROXY', timestamp: n, country: p.country, provider: p.provider, proxy: p.proxy });
        }
      });
      saveAll();
      return ok({ count: updated.length, proxies: updated }, `${updated.length} proxies copied.`);
    },

    resetMultipleProxies: ({ token, proxyIds }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      if (!proxyIds || !proxyIds.length) return err('No proxies specified.');
      const user = DEMO_USERS.find(u => u.id === s.userId);
      const n = now();
      const updated = [];
      proxyIds.forEach(pid => {
        const p = proxies.find(x => x.id === pid);
        if (p && (p.user_id === s.userId || (user && user.role === 'admin'))) {
          p.status = 'available';
          p.used_at = '';
          p.last_copied_at = '';
          updated.push(p);
          activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: p.id, action: 'RESET_PROXY', timestamp: n, country: p.country, provider: p.provider, proxy: p.proxy });
        }
      });
      saveAll();
      return ok({ count: updated.length, proxies: updated }, `${updated.length} proxies reset.`);
    },

    deleteMultipleProxies: ({ token, proxyIds }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      if (!proxyIds || !proxyIds.length) return err('No proxies specified.');
      const user = DEMO_USERS.find(u => u.id === s.userId);
      const n = now();
      let count = 0;
      proxyIds.forEach(pid => {
        const p = proxies.find(x => x.id === pid);
        if (p && (p.user_id === s.userId || (user && user.role === 'admin'))) {
          p.status = 'deleted';
          count++;
          activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: p.id, action: 'DELETE_PROXY', timestamp: n, country: p.country, provider: p.provider, proxy: p.proxy });
        }
      });
      saveAll();
      return ok({ count }, `${count} proxies deleted.`);
    },

    deleteProxy: ({ token, proxyId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const p = proxies.find(x => x.id === proxyId);
      if (!p) return err('Proxy not found.');
      const user = DEMO_USERS.find(u => u.id === s.userId);
      if (p.user_id !== s.userId && user.role !== 'admin') return err('Access denied.');
      const n = now();
      p.status = 'deleted';
      activity.unshift({ id: genId('A'), user_id: s.userId, proxy_id: proxyId, action: 'DELETE_PROXY', timestamp: n, country: p.country, provider: p.provider, proxy: p.proxy });
      saveAll();
      return ok(null, 'Deleted.');
    },

    getActivity: ({ token, filters }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const user = DEMO_USERS.find(u => u.id === s.userId);
      let rows = user.role === 'admin' ? [...activity] : activity.filter(a => a.user_id === s.userId);
      if (filters) {
        if (filters.country) rows = rows.filter(a => a.country === filters.country);
        if (filters.provider) rows = rows.filter(a => a.provider === filters.provider);
        if (filters.action) rows = rows.filter(a => a.action === filters.action);
      }
      return ok(rows);
    },

    adminGetUsers: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');

      const counts = {};
      proxies.filter(p => p.status !== 'deleted').forEach(p => {
        if (!counts[p.user_id]) counts[p.user_id] = { total: 0, available: 0, used: 0 };
        counts[p.user_id].total++;
        if (p.status === 'available') counts[p.user_id].available++;
        else if (p.status === 'used') counts[p.user_id].used++;
      });

      return ok(users.map(u => {
        const c = counts[u.id] || { total: 0, available: 0, used: 0 };
        return {
          id: u.id,
          username: u.username,
          display_name: u.display_name,
          role: u.role,
          active: u.active,
          created_at: u.created_at,
          total_proxies: c.total,
          available_proxies: c.available,
          used_proxies: c.used
        };
      }));
    },

    adminGetProxies: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');
      return ok(proxies);
    },

    adminGetActivity: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');
      return ok(activity);
    },

    adminResetProxy: ({ token, proxyId }) => handle.resetProxy({ token, proxyId }),
    adminDeleteProxy: ({ token, proxyId }) => handle.deleteProxy({ token, proxyId }),

    adminCreateUser: ({ token, username, password, display_name, role }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');

      const cleanU = (username || '').trim().toLowerCase();
      if (!cleanU || cleanU.length < 3) return err('Username must be at least 3 characters.');
      if (!password || password.length < 4) return err('Password must be at least 4 characters.');
      if (users.find(u => u.username.toLowerCase() === cleanU)) return err(`Username "${cleanU}" already exists.`);

      const newUser = {
        id: genId('U'),
        username: cleanU,
        password: String(password),
        display_name: (display_name || '').trim() || cleanU,
        role: role === 'admin' ? 'admin' : 'user',
        active: 'TRUE',
        created_at: now()
      };
      users.push(newUser);
      saveAll();
      return ok({ ...newUser }, 'User created successfully.');
    },

    adminToggleUser: ({ token, userId, active }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');
      if (userId === caller.id) return err('Cannot toggle your own account.');

      const target = users.find(u => u.id === userId);
      if (!target) return err('User not found.');
      target.active = (active === true || active === 'TRUE') ? 'TRUE' : 'FALSE';
      saveAll();
      return ok(null, 'User status updated.');
    },

    adminChangePassword: ({ token, userId, password }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');

      const target = users.find(u => u.id === userId);
      if (!target) return err('User not found.');
      const newPass = password ? String(password) : ('Inexra#' + Math.floor(1000 + Math.random() * 9000));
      if (newPass.length < 4) return err('Password must be at least 4 characters.');
      target.password = newPass;
      saveAll();
      return ok({ password: newPass }, 'Password updated successfully.');
    },
  };

  async function call(action, payload) {
    await new Promise(r => setTimeout(r, 120)); // simulate network latency
    const fn = handle[action];
    if (!fn) return { success: false, message: 'Unknown action: ' + action };
    return fn(payload);
  }

  return { call };
})();

// ── Real API Client ───────────────────────────────────────────
const API = (() => {
  async function request(method, action, payload = {}) {
    const token = getTokenSafe();
    const body = { action, token, ...payload };

    // Use demo backend if GAS_URL is not configured
    if (isDemoMode()) {
      return DemoBackend.call(action, body);
    }

    const res = await fetch(API_CONFIG.GAS_URL, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  function getTokenSafe() {
    try { return sessionStorage.getItem('pc_session_token') || localStorage.getItem('pc_session_token') || ''; }
    catch { return ''; }
  }

  const login = (u, p) => request('POST', 'login', { username: u, password: p });
  const logout = () => request('POST', 'logout', {});
  const getMe = () => request('POST', 'me', {});
  const getDashboard = () => request('POST', 'getDashboard', {});
  const getProxies = (f = {}, userId = '') => request('POST', 'getProxies', { filters: f, userId });
  const addProxies = (d) => request('POST', 'addProxies', d);
  const copyProxy = (id) => request('POST', 'copyProxy', { proxyId: id });
  const copyMultipleProxies = (ids) => request('POST', 'copyMultipleProxies', { proxyIds: ids });
  const resetProxy = (id) => request('POST', 'resetProxy', { proxyId: id });
  const resetMultipleProxies = (ids) => request('POST', 'resetMultipleProxies', { proxyIds: ids });
  const deleteProxy = (id) => request('POST', 'deleteProxy', { proxyId: id });
  const deleteMultipleProxies = (ids) => request('POST', 'deleteMultipleProxies', { proxyIds: ids });
  const getActivity = (f = {}) => request('POST', 'getActivity', { filters: f });

  const adminGetUsers = () => request('POST', 'adminGetUsers', {});
  const adminCreateUser = (d) => request('POST', 'adminCreateUser', d);
  const adminToggleUser = (d) => request('POST', 'adminToggleUser', d);
  const adminGetProxies = () => request('POST', 'adminGetProxies', {});
  const adminGetActivity = () => request('POST', 'adminGetActivity', {});
  const adminResetProxy = (id) => request('POST', 'adminResetProxy', { proxyId: id });
  const adminDeleteProxy = (id) => request('POST', 'adminDeleteProxy', { proxyId: id });
  const adminChangePassword = (d) => request('POST', 'adminChangePassword', d);

  return {
    request, login, logout, getMe, getDashboard,
    getProxies, addProxies, copyProxy, copyMultipleProxies, resetProxy, resetMultipleProxies, deleteProxy, deleteMultipleProxies, getActivity,
    adminGetUsers, adminCreateUser, adminToggleUser, adminGetProxies,
    adminGetActivity, adminResetProxy, adminDeleteProxy, adminChangePassword
  };
})();
