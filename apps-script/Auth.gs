/**
 * Auth.gs — Session & Authentication Management
 *
 * Sessions are stored in the "Sessions" sheet:
 *   token | user_id | created_at | expires_at | active
 *
 * Token lifetime: 8 hours (can be adjusted via SESSION_DURATION_MS).
 * Every API call that requires auth goes through validateSession().
 */

var SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// ── Sessions Sheet Columns (0-based) ─────────────────────────
var SC = {
  TOKEN:      0,
  USER_ID:    1,
  CREATED_AT: 2,
  EXPIRES_AT: 3,
  ACTIVE:     4
};

// ── Login ─────────────────────────────────────────────────────
function handleLogin(body) {
  var username = sanitizeStr(body.username);
  var password  = body.password ? String(body.password) : '';

  if (!username || !password) {
    return errorResponse('Username and password are required.', 400);
  }

  // Enforce a brute-force delay (cheap protection in Apps Script context)
  Utilities.sleep(400);

  var user = UserService.findUserByUsername(username);
  if (!user) {
    return errorResponse('Invalid credentials.', 401);
  }

  if (user.active !== 'TRUE' && user.active !== true) {
    return errorResponse('Your account has been disabled. Contact admin.', 403);
  }

  if (!verifyPassword(password, user.password_hash)) {
    return errorResponse('Invalid credentials.', 401);
  }

  // Create session
  var token   = generateSessionToken();
  var now     = new Date();
  var expires = new Date(now.getTime() + SESSION_DURATION_MS);

  var sessSheet = getSheet(SHEET_SESSIONS);
  sessSheet.appendRow([token, user.id, now.toISOString(), expires.toISOString(), 'TRUE']);

  // Return token and safe user object
  return successResponse({
    token: token,
    user: {
      user_id:      user.id,
      username:     user.username,
      display_name: user.display_name,
      role:         user.role || 'user',
      created_at:   user.created_at
    }
  }, 'Login successful');
}

// ── Logout ────────────────────────────────────────────────────
function handleLogout(token) {
  if (!token) return successResponse(null, 'Logged out.');

  try {
    var sessSheet  = getSheet(SHEET_SESSIONS);
    var tokenColIdx = SC.TOKEN;
    var activeColIdx = SC.ACTIVE;
    var rowIdx = findRowIndex(sessSheet, tokenColIdx, token);

    if (rowIdx > 0) {
      sessSheet.getRange(rowIdx, activeColIdx + 1).setValue('FALSE');
    }
  } catch (e) {
    Logger.log('Logout error: ' + e.message);
  }

  return successResponse(null, 'Logged out.');
}

// ── Validate Session ──────────────────────────────────────────
/**
 * Validates a session token and returns the associated user object.
 * Returns null if token is invalid or expired.
 *
 * IMPORTANT: The user_id is ALWAYS derived from the session,
 * never from the request body. This prevents horizontal privilege escalation.
 */
function validateSession(token) {
  if (!token || String(token).trim() === '') return null;

  try {
    var sessSheet = getSheet(SHEET_SESSIONS);
    var data = sessSheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[SC.TOKEN]) !== String(token)) continue;
      if (String(row[SC.ACTIVE]) !== 'TRUE')        continue;

      var expires = new Date(String(row[SC.EXPIRES_AT]));
      if (new Date() > expires) {
        // Invalidate expired session
        sessSheet.getRange(i + 1, SC.ACTIVE + 1).setValue('FALSE');
        return null;
      }

      var userId = String(row[SC.USER_ID]);
      var user   = UserService.findUserById(userId);
      if (!user) return null;
      if (user.active !== 'TRUE') return null;

      return user;
    }
  } catch (e) {
    Logger.log('Session validation error: ' + e.message);
  }

  return null;
}

// ── Me endpoint ───────────────────────────────────────────────
function handleMe(token) {
  var user = validateSession(token);
  if (!user) return errorResponse('Unauthorized', 401);

  return successResponse({
    user_id:      user.id,
    username:     user.username,
    display_name: user.display_name,
    role:         user.role || 'user',
    created_at:   user.created_at
  });
}

// ── Cleanup expired sessions (run occasionally) ───────────────
function cleanupExpiredSessions() {
  try {
    var sessSheet = getSheet(SHEET_SESSIONS);
    var data = sessSheet.getDataRange().getValues();
    var now = new Date();

    for (var i = data.length - 1; i >= 1; i--) {
      var expires = new Date(String(data[i][SC.EXPIRES_AT]));
      if (now > expires && String(data[i][SC.ACTIVE]) === 'TRUE') {
        sessSheet.getRange(i + 1, SC.ACTIVE + 1).setValue('FALSE');
      }
    }
  } catch (e) {
    Logger.log('Cleanup error: ' + e.message);
  }
}
