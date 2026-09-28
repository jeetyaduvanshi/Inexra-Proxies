/**
 * auth.js — Client-side authentication utilities
 * Handles session token storage and basic auth state.
 * Token is stored in sessionStorage so it clears when tab closes.
 * A copy in localStorage lets us persist across page navigations
 * within the same browser session if the user prefers.
 */

const Auth = (() => {
  const TOKEN_KEY   = 'pc_session_token';
  const USER_KEY    = 'pc_user_data';

  // ── Session helpers ──────────────────────────────────────────
  function saveSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    // Also persist in localStorage for across-tab persistence
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  function isAuthenticated() {
    return !!getToken();
  }

  // ── Login ────────────────────────────────────────────────────
  async function login(username, password) {
    const response = await API.request('POST', 'login', { username, password });
    if (response.success && response.data && response.data.token) {
      saveSession(response.data.token, response.data.user);
    }
    return response;
  }

  // ── Logout ───────────────────────────────────────────────────
  async function logout() {
    try {
      await API.request('POST', 'logout', {});
    } catch (_) { /* ignore network errors on logout */ }
    clearSession();
    window.location.href = 'login.html';
  }

  // ── Guard ────────────────────────────────────────────────────
  function requireAuth() {
    if (!isAuthenticated()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  return { login, logout, requireAuth, isAuthenticated, getToken, getUser, clearSession };
})();
