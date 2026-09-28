/**
 * api.js — Browser Storage Backend for Proxy Collector for Inexra
 * 
 * PURE INSTANT LOCAL STORAGE:
 * All proxies, status changes, copy counts, and user management are stored
 * directly in the browser's localStorage.
 * 
 * - 0ms Latency: Instant loads, instant copies, instant resets.
 * - Survives browser reloads, restarts, and sessions.
 * - No external Google Sheets or database cold-start delays.
 * - Backup & Restore support: export/import your proxies as JSON anytime.
 */

const API_CONFIG = {
  // 'local' = Ultra-fast 0ms browser storage (No external database, instant reload)
  // 'gas' = Optional Google Apps Script backend
  MODE: 'local',
  GAS_URL: ''
};

function isLocalMode() {
  return API_CONFIG.MODE === 'local' || !API_CONFIG.GAS_URL;
}

// ── Pure Local Storage Engine ──────────────────────────────────
const LocalBackend = (() => {
  const STORAGE_PREFIX = 'inexra_';

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + key) || localStorage.getItem('demo_' + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, val) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage save notice:', e);
    }
  }

  const DEFAULT_USERS = [
    { id: 'U001', username: 'admin', password: 'admin123', display_name: 'Administrator', role: 'admin', active: 'TRUE', created_at: '2026-09-01T00:00:00.000Z' },
    { id: 'U002', username: 'user01', password: 'user123', display_name: 'User 01', role: 'user', active: 'TRUE', created_at: '2026-09-05T00:00:00.000Z' },
  ];

  const INITIAL_PROXIES = [
    { id: 'P0001', user_id: 'U001', country: 'US', provider: 'LokiProxy', proxy: 'edfa5db385f296e0e500:cd994207a26d66ef@gw.dataimpulse.com:823', status: 'available', created_at: '2026-09-28T10:00:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0002', user_id: 'U001', country: 'US', provider: 'LokiProxy', proxy: 'edfa5db385f296e0e500:cd994207a26d66ef@gw.dataimpulse.com:824', status: 'available', created_at: '2026-09-28T10:01:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0003', user_id: 'U001', country: 'US', provider: 'LokiProxy', proxy: 'edfa5db385f296e0e500:cd994207a26d66ef@gw.dataimpulse.com:825', status: 'available', created_at: '2026-09-28T10:02:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0004', user_id: 'U001', country: 'UK', provider: 'DataImpulse', proxy: 'uk1.dataimp.io:9090:user01:pass01', status: 'available', created_at: '2026-09-28T10:03:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
    { id: 'P0005', user_id: 'U001', country: 'DE', provider: 'LokiProxy', proxy: 'de1.lokiproxy.net:8080:deuser1:depass1', status: 'available', created_at: '2026-09-28T10:04:00.000Z', used_at: '', last_copied_at: '', copy_count: 0 },
  ];

  let users = load('users', DEFAULT_USERS);
  let proxies = load('proxies', INITIAL_PROXIES);
  let activity = load('activity', []);
  let sessions = load('sessions', {});

  // Ensure admin user always exists with admin123
  if (!users.some(u => u.username === 'admin')) {
    users.unshift(DEFAULT_USERS[0]);
    save('users', users);
  }

  function saveAll() {
    save('users', users);
    save('proxies', proxies);
    save('activity', activity);
    save('sessions', sessions);
  }

  function ok(data, msg) { return { success: true, data, message: msg || '' }; }
  function err(msg) { return { success: false, data: null, message: msg }; }

  function genId(prefix) { return prefix + Date.now() + Math.floor(Math.random() * 9999); }
  function now() { return new Date().toISOString(); }

  function getSession(token) {
    const s = sessions[token];
    if (!s) return null;
    if (new Date() > new Date(s.expires)) {
      delete sessions[token];
      saveAll();
      return null;
    }
    return s;
  }

  function getUserProxies(userId) {
    return proxies.filter(p => p.user_id === userId && p.status !== 'deleted');
  }

  const handle = {
    login: ({ username, password }) => {
      const user = users.find(u => u.username === username && u.password === password && (u.active === 'TRUE' || u.active === true));
      if (!user) return err('Invalid credentials.');
      const token = genId('tok');
      sessions[token] = { userId: user.id, expires: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }; // 30-day session
      saveAll();
      return ok({
        token,
        user: {
          user_id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          created_at: user.created_at
        }
      }, 'Login successful');
    },

    logout: ({ token }) => {
      if (token) {
        delete sessions[token];
        saveAll();
      }
      return ok(null, 'Logged out.');
    },

    me: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const user = users.find(u => u.id === s.userId);
      if (!user) return err('Unauthorized');
      return ok({
        user_id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        created_at: user.created_at
      });
    },

    getDashboard: ({ token }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      const mine = (caller && caller.role === 'admin') ? proxies.filter(p => p.status !== 'deleted') : getUserProxies(s.userId);
      const countries = new Set(mine.map(p => p.country));
      return ok({
        stats: {
          total: mine.length,
          available: mine.filter(p => p.status === 'available').length,
          used: mine.filter(p => p.status === 'used').length,
          countries: countries.size
        },
        proxies: mine
      });
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
        if (existing.has(clean.toLowerCase())) {
          skipped++;
          return;
        }
        existing.add(clean.toLowerCase());
        proxies.push({
          id: genId('P'),
          user_id: targetUserId,
          country: country.toUpperCase().trim(),
          provider: provider.trim(),
          proxy: clean,
          status: 'available',
          created_at: n,
          used_at: '',
          last_copied_at: '',
          copy_count: 0
        });
        added++;
      });

      activity.unshift({
        id: genId('A'),
        user_id: s.userId,
        proxy_id: 'BATCH',
        action: 'ADD_PROXY',
        timestamp: n,
        country,
        provider,
        proxy: added + ' proxies added'
      });
      saveAll();
      return ok({ added, skipped }, `${added} proxies added to box.`);
    },

    copyProxy: ({ token, proxyId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const p = proxies.find(x => x.id === proxyId);
      if (!p) return err('Proxy not found.');
      const n = now();
      p.status = 'used';
      p.used_at = n;
      p.last_copied_at = n;
      p.copy_count = (p.copy_count || 0) + 1;
      activity.unshift({
        id: genId('A'),
        user_id: s.userId,
        proxy_id: proxyId,
        action: 'COPY_PROXY',
        timestamp: n,
        country: p.country,
        provider: p.provider,
        proxy: p.proxy
      });
      saveAll();
      return ok({ ...p }, 'Copied.');
    },

    resetProxy: ({ token, proxyId }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const p = proxies.find(x => x.id === proxyId);
      if (!p) return err('Proxy not found.');
      const n = now();
      p.status = 'available';
      p.used_at = '';
      p.last_copied_at = '';
      p.copy_count = 0;
      activity.unshift({
        id: genId('A'),
        user_id: s.userId,
        proxy_id: proxyId,
        action: 'RESET_PROXY',
        timestamp: n,
        country: p.country,
        provider: p.provider,
        proxy: p.proxy
      });
      saveAll();
      return ok({ ...p }, 'Reset.');
    },

    copyMultipleProxies: ({ token, proxyIds }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      if (!proxyIds || !proxyIds.length) return err('No proxies specified.');
      const n = now();
      const updated = [];
      proxyIds.forEach(pid => {
        const p = proxies.find(x => x.id === pid);
        if (p) {
          p.status = 'used';
          p.used_at = n;
          p.last_copied_at = n;
          p.copy_count = (p.copy_count || 0) + 1;
          updated.push(p);
          activity.unshift({
            id: genId('A'),
            user_id: s.userId,
            proxy_id: p.id,
            action: 'COPY_PROXY',
            timestamp: n,
            country: p.country,
            provider: p.provider,
            proxy: p.proxy
          });
        }
      });
      saveAll();
      return ok({ count: updated.length, proxies: updated }, `${updated.length} proxies copied.`);
    },

    resetMultipleProxies: ({ token, proxyIds }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      if (!proxyIds || !proxyIds.length) return err('No proxies specified.');
      const n = now();
      const updated = [];
      proxyIds.forEach(pid => {
        const p = proxies.find(x => x.id === pid);
        if (p) {
          p.status = 'available';
          p.used_at = '';
          p.last_copied_at = '';
          p.copy_count = 0;
          updated.push(p);
          activity.unshift({
            id: genId('A'),
            user_id: s.userId,
            proxy_id: p.id,
            action: 'RESET_PROXY',
            timestamp: n,
            country: p.country,
            provider: p.provider,
            proxy: p.proxy
          });
        }
      });
      saveAll();
      return ok({ count: updated.length, proxies: updated }, `${updated.length} proxies reset.`);
    },

    deleteMultipleProxies: ({ token, proxyIds }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      if (!proxyIds || !proxyIds.length) return err('No proxies specified.');
      const n = now();
      let count = 0;
      proxyIds.forEach(pid => {
        const p = proxies.find(x => x.id === pid);
        if (p) {
          p.status = 'deleted';
          count++;
          activity.unshift({
            id: genId('A'),
            user_id: s.userId,
            proxy_id: p.id,
            action: 'DELETE_PROXY',
            timestamp: n,
            country: p.country,
            provider: p.provider,
            proxy: p.proxy
          });
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
      const n = now();
      p.status = 'deleted';
      activity.unshift({
        id: genId('A'),
        user_id: s.userId,
        proxy_id: proxyId,
        action: 'DELETE_PROXY',
        timestamp: n,
        country: p.country,
        provider: p.provider,
        proxy: p.proxy
      });
      saveAll();
      return ok(null, 'Deleted.');
    },

    getActivity: ({ token, filters }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      let rows = (caller && caller.role === 'admin') ? [...activity] : activity.filter(a => a.user_id === s.userId);
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
      return ok(proxies.filter(p => p.status !== 'deleted'));
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
      if (!cleanU) return err('Username is required.');
      if (users.some(u => u.username.toLowerCase() === cleanU)) {
        return err('Username already exists.');
      }

      const generatedPassword = password ? String(password).trim() : ('Inexra#' + Math.floor(1000 + Math.random() * 9000));
      const newUser = {
        id: genId('U'),
        username: cleanU,
        password: generatedPassword,
        display_name: (display_name || cleanU).trim(),
        role: role === 'admin' ? 'admin' : 'user',
        active: 'TRUE',
        created_at: now()
      };

      users.push(newUser);
      saveAll();
      return ok({ user: newUser, password: generatedPassword }, `User "${cleanU}" created successfully.`);
    },

    adminToggleUser: ({ token, userId, active }) => {
      const s = getSession(token);
      if (!s) return err('Unauthorized');
      const caller = users.find(u => u.id === s.userId);
      if (!caller || caller.role !== 'admin') return err('Admin access required.');

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

    exportBackup: () => {
      const data = {
        version: '1.0',
        exported_at: now(),
        proxies: proxies.filter(p => p.status !== 'deleted'),
        users: users.map(u => ({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, active: u.active, created_at: u.created_at }))
      };
      return ok(data, 'Export ready');
    },

    importBackup: ({ data }) => {
      if (!data || !Array.isArray(data.proxies)) return err('Invalid backup JSON format.');
      let count = 0;
      data.proxies.forEach(p => {
        if (!proxies.some(x => x.id === p.id || x.proxy.trim().toLowerCase() === p.proxy.trim().toLowerCase())) {
          proxies.push(p);
          count++;
        }
      });
      saveAll();
      return ok({ count }, `${count} proxies imported successfully.`);
    }
  };

  // Immediate 0ms synchronous execution
  function call(action, payload) {
    const fn = handle[action];
    if (!fn) return { success: false, message: 'Unknown action: ' + action };
    return fn(payload);
  }

  return { call };
})();

// ── API Client Interface ───────────────────────────────────────
const API = (() => {
  async function request(method, action, payload = {}) {
    const token = getTokenSafe();
    const body = { action, token, ...payload };

    // Pure instant Local Storage (0ms)
    if (isLocalMode()) {
      return LocalBackend.call(action, body);
    }

    // Optional Remote Google Apps Script fallback if explicitly configured
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
    try {
      return sessionStorage.getItem('pc_session_token') || localStorage.getItem('pc_session_token') || '';
    } catch {
      return '';
    }
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

  const exportBackup = () => request('POST', 'exportBackup', {});
  const importBackup = (d) => request('POST', 'importBackup', { data: d });

  return {
    request, login, logout, getMe, getDashboard,
    getProxies, addProxies, copyProxy, copyMultipleProxies, resetProxy, resetMultipleProxies, deleteProxy, deleteMultipleProxies, getActivity,
    adminGetUsers, adminCreateUser, adminToggleUser, adminGetProxies,
    adminGetActivity, adminResetProxy, adminDeleteProxy, adminChangePassword,
    exportBackup, importBackup
  };
})();
