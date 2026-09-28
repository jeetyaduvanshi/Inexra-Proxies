/**
 * ============================================================
 * PROXY COLLECTOR FOR INEXRA — COMPLETE ALL-IN-ONE BACKEND
 * Google Apps Script Web App & Database Manager
 * ============================================================
 */

// ── Sheet Names ───────────────────────────────────────────────
var SHEET_USERS    = 'Users';
var SHEET_PROXIES  = 'Proxies';
var SHEET_ACTIVITY = 'Activity';
var SHEET_SESSIONS = 'Sessions';

var SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
var PASSWORD_SALT       = 'ProxyCollector_2026_InternalSalt_';

// ── Column Index Enums (0-based) ──────────────────────────────
var UC = { ID: 0, USERNAME: 1, PASSWORD_HASH: 2, DISPLAY_NAME: 3, ROLE: 4, ACTIVE: 5, CREATED_AT: 6 };
var PC = { ID: 0, USER_ID: 1, COUNTRY: 2, PROVIDER: 3, PROXY: 4, STATUS: 5, CREATED_AT: 6, USED_AT: 7, LAST_COPIED_AT: 8, COPY_COUNT: 9 };
var SC = { TOKEN: 0, USER_ID: 1, CREATED_AT: 2, EXPIRES_AT: 3, ACTIVE: 4 };

// ── Spreadsheet & Sheet Access ────────────────────────────────
function getSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Spreadsheet not found. Please open Apps Script directly from Extensions > Apps Script in your Google Sheet.');
}

function getSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" not found. Please run setupDatabase() first.');
  }
  return sheet;
}

function getOrCreateSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function findRowIndex(sheet, colIndex0, value) {
  var data = sheet.getDataRange().getValues();
  var target = String(value).trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex0]).trim() === target) {
      return i + 1; // 1-based row index for Sheets API
    }
  }
  return -1;
}

// ── ID & Token Generators ─────────────────────────────────────
function generateUserId() {
  return 'U' + Utilities.formatDate(new Date(), 'UTC', 'yyMMddHHmmss') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

function generateProxyId() {
  return 'P' + Utilities.formatDate(new Date(), 'UTC', 'yyMMddHHmmss') + Math.floor(Math.random() * 9999).toString().padStart(4, '0');
}

function generateActivityId() {
  return 'A' + Utilities.formatDate(new Date(), 'UTC', 'yyMMddHHmmssSSS');
}

function generateSessionToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var token = '';
  for (var i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ── Password Hashing ──────────────────────────────────────────
function hashPassword(plaintext) {
  var salted = PASSWORD_SALT + plaintext;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
}

function verifyPassword(plaintext, storedHash) {
  return hashPassword(plaintext) === storedHash;
}

// ── Time & JSON Responses ─────────────────────────────────────
function nowISO() {
  return new Date().toISOString();
}

function successResponse(data, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data || null, message: message || '' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, data: null, message: message || 'Error', code: code || 400 }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeStr(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim();
}

function sanitizeProxy(proxyStr) {
  if (!proxyStr) return '';
  return String(proxyStr).trim();
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    Logger.log('Failed to parse POST body: ' + err.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  DATABASE SETUP & ADMIN BOOTSTRAP
// ══════════════════════════════════════════════════════════════
function setupDatabase() {
  Logger.log('=== Setting up Proxy Collector Database ===');
  var ss = getSpreadsheet();

  var usersSheet = getOrCreateSheet(SHEET_USERS);
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(['id', 'username', 'password_hash', 'display_name', 'role', 'active', 'created_at']);
    usersSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Users sheet created.');
  }

  var proxiesSheet = getOrCreateSheet(SHEET_PROXIES);
  if (proxiesSheet.getLastRow() === 0) {
    proxiesSheet.appendRow(['id', 'user_id', 'country', 'provider', 'proxy', 'status', 'created_at', 'used_at', 'last_copied_at', 'copy_count']);
    proxiesSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Proxies sheet created.');
  }

  var activitySheet = getOrCreateSheet(SHEET_ACTIVITY);
  if (activitySheet.getLastRow() === 0) {
    activitySheet.appendRow(['id', 'user_id', 'proxy_id', 'action', 'timestamp', 'country', 'provider', 'proxy']);
    activitySheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Activity sheet created.');
  }

  var sessionsSheet = getOrCreateSheet(SHEET_SESSIONS);
  if (sessionsSheet.getLastRow() === 0) {
    sessionsSheet.appendRow(['token', 'user_id', 'created_at', 'expires_at', 'active']);
    sessionsSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Sessions sheet created.');
  }

  [usersSheet, proxiesSheet, activitySheet, sessionsSheet].forEach(function(sh) {
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);
  });

  Logger.log('=== Database setup complete! ===');
}

function createInitialAdmin() {
  var ADMIN_USERNAME     = 'admin';
  var ADMIN_PASSWORD     = 'admin123';
  var ADMIN_DISPLAY_NAME = 'Administrator';

  try {
    var sheet = getOrCreateSheet(SHEET_USERS);
    var data  = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        Logger.log('⚠️  User "' + ADMIN_USERNAME + '" already exists. Skipping.');
        return;
      }
    }

    var id = 'U' + Utilities.formatDate(new Date(), 'UTC', 'yyMMddHHmmss');
    var hash = hashPassword(ADMIN_PASSWORD);
    var now = nowISO();

    sheet.appendRow([id, ADMIN_USERNAME, hash, ADMIN_DISPLAY_NAME, 'admin', 'TRUE', now]);
    Logger.log('✓ Admin account created successfully!');
    Logger.log('  Username: ' + ADMIN_USERNAME);
    Logger.log('  Password: ' + ADMIN_PASSWORD);
  } catch (e) {
    Logger.log('❌ Error creating admin: ' + e.message);
  }
}

function cleanAllSessions() {
  try {
    var sheet = getOrCreateSheet(SHEET_SESSIONS);
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      sheet.getRange(i + 1, 5).setValue('FALSE');
    }
    Logger.log('✓ All sessions invalidated (' + (data.length - 1) + ' sessions)');
  } catch (e) {
    Logger.log('Error: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  AUTH & SESSIONS
// ══════════════════════════════════════════════════════════════
function handleLogin(body) {
  var username = sanitizeStr(body.username);
  var password = body.password ? String(body.password) : '';

  if (!username || !password) {
    return errorResponse('Username and password are required.', 400);
  }

  Utilities.sleep(300);

  var user = UserService.findUserByUsername(username);
  if (!user) {
    return errorResponse('Invalid credentials.', 401);
  }

  if (String(user.active).toUpperCase() !== 'TRUE' && user.active !== true) {
    return errorResponse('Your account has been disabled. Contact admin.', 403);
  }

  if (!verifyPassword(password, user.password_hash)) {
    return errorResponse('Invalid credentials.', 401);
  }

  var token = generateSessionToken();
  var now = new Date();
  var expires = new Date(now.getTime() + SESSION_DURATION_MS);

  var sessSheet = getSheet(SHEET_SESSIONS);
  sessSheet.appendRow([token, user.id, now.toISOString(), expires.toISOString(), 'TRUE']);

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

function handleLogout(token) {
  if (!token) return successResponse(null, 'Logged out.');
  try {
    var sessSheet = getSheet(SHEET_SESSIONS);
    var rowIdx = findRowIndex(sessSheet, SC.TOKEN, token);
    if (rowIdx > 0) {
      sessSheet.getRange(rowIdx, SC.ACTIVE + 1).setValue('FALSE');
    }
  } catch (e) {}
  return successResponse(null, 'Logged out.');
}

function validateSession(token) {
  if (!token || String(token).trim() === '') return null;
  try {
    var sessSheet = getSheet(SHEET_SESSIONS);
    var data = sessSheet.getDataRange().getValues();
    var cleanToken = String(token).trim();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[SC.TOKEN]).trim() !== cleanToken) continue;
      if (String(row[SC.ACTIVE]).toUpperCase() !== 'TRUE' && row[SC.ACTIVE] !== true) return null;

      var expiresAt = new Date(row[SC.EXPIRES_AT]);
      if (new Date() > expiresAt) {
        sessSheet.getRange(i + 1, SC.ACTIVE + 1).setValue('FALSE');
        return null;
      }

      var userId = String(row[SC.USER_ID]);
      return UserService.findUserById(userId);
    }
  } catch (e) {
    Logger.log('validateSession error: ' + e.message);
  }
  return null;
}

function handleMe(token) {
  var user = validateSession(token);
  if (!user) return errorResponse('Unauthorized', 401);
  return successResponse({
    user_id:      user.id,
    username:     user.username,
    display_name: user.display_name,
    role:         user.role,
    created_at:   user.created_at
  });
}

// ══════════════════════════════════════════════════════════════
//  USER SERVICE
// ══════════════════════════════════════════════════════════════
var UserService = (function() {
  function rowToUser(row) {
    return {
      id:            String(row[UC.ID]),
      username:      String(row[UC.USERNAME]),
      password_hash: String(row[UC.PASSWORD_HASH]),
      display_name:  String(row[UC.DISPLAY_NAME]),
      role:          String(row[UC.ROLE]) || 'user',
      active:        String(row[UC.ACTIVE]).toUpperCase(),
      created_at:    String(row[UC.CREATED_AT])
    };
  }

  function getAllUsers() {
    var sheet = getSheet(SHEET_USERS);
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var users = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][UC.ID]).trim()) {
        users.push(rowToUser(data[i]));
      }
    }
    return users;
  }

  function findUserByUsername(username) {
    var users = getAllUsers();
    var lower = String(username).toLowerCase().trim();
    for (var i = 0; i < users.length; i++) {
      if (users[i].username.toLowerCase() === lower) return users[i];
    }
    return null;
  }

  function findUserById(userId) {
    var users = getAllUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === String(userId)) return users[i];
    }
    return null;
  }

  function createUser(username, plainPassword, displayName, role) {
    username    = sanitizeStr(username).toLowerCase();
    displayName = sanitizeStr(displayName) || username;
    role        = (role === 'admin') ? 'admin' : 'user';

    if (!username || username.length < 3) throw new Error('Username must be at least 3 characters.');
    if (!plainPassword || plainPassword.length < 4) throw new Error('Password must be at least 4 characters.');
    if (findUserByUsername(username)) throw new Error('Username "' + username + '" already exists.');

    var id = generateUserId();
    var hash = hashPassword(plainPassword);
    var now  = nowISO();

    var sheet = getSheet(SHEET_USERS);
    sheet.appendRow([id, username, hash, displayName, role, 'TRUE', now]);

    return { id: id, username: username, display_name: displayName, role: role, active: 'TRUE', created_at: now, password: plainPassword };
  }

  function toggleUserActive(userId, newActive) {
    var sheet = getSheet(SHEET_USERS);
    var rowIdx = findRowIndex(sheet, UC.ID, userId);
    if (rowIdx < 0) throw new Error('User not found.');
    sheet.getRange(rowIdx, UC.ACTIVE + 1).setValue(newActive ? 'TRUE' : 'FALSE');
  }

  function changePassword(userId, newPlainPassword) {
    if (!newPlainPassword || newPlainPassword.length < 4) throw new Error('Password must be at least 4 characters.');
    var sheet = getSheet(SHEET_USERS);
    var rowIdx = findRowIndex(sheet, UC.ID, userId);
    if (rowIdx < 0) throw new Error('User not found.');
    sheet.getRange(rowIdx, UC.PASSWORD_HASH + 1).setValue(hashPassword(newPlainPassword));
    return true;
  }

  function handleAdminGetUsers(token) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    // Count proxies per user directly from SHEET_PROXIES
    var proxyCounts = {};
    try {
      var pSheet = getSheet(SHEET_PROXIES);
      var pData = pSheet.getDataRange().getValues();
      for (var i = 1; i < pData.length; i++) {
        var row = pData[i];
        var uid = String(row[PC.USER_ID]).trim();
        var status = String(row[PC.STATUS]).trim().toLowerCase();
        if (status === 'deleted' || !uid) continue;

        if (!proxyCounts[uid]) {
          proxyCounts[uid] = { total: 0, available: 0, used: 0 };
        }
        proxyCounts[uid].total++;
        if (status === 'available') {
          proxyCounts[uid].available++;
        } else if (status === 'used') {
          proxyCounts[uid].used++;
        }
      }
    } catch (e) {
      Logger.log('Could not aggregate proxy counts: ' + e.message);
    }

    var users = getAllUsers().map(function(u) {
      var stats = proxyCounts[u.id] || { total: 0, available: 0, used: 0 };
      return {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        active: u.active,
        created_at: u.created_at,
        total_proxies: stats.total,
        available_proxies: stats.available,
        used_proxies: stats.used
      };
    });
    return successResponse(users);
  }

  function handleAdminCreateUser(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    try {
      var newUser = createUser(body.username, body.password, body.display_name, body.role);
      return successResponse(newUser, 'User created successfully.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminToggleUser(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    var targetId = sanitizeStr(body.userId);
    if (targetId === caller.id) return errorResponse('Cannot toggle your own account.', 400);
    try {
      toggleUserActive(targetId, body.active === true || body.active === 'TRUE');
      return successResponse(null, 'User status updated.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminChangePassword(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    var newPassword = body.password ? String(body.password) : ('Inexra#' + Math.floor(1000 + Math.random() * 9000));
    try {
      changePassword(sanitizeStr(body.userId), newPassword);
      return successResponse({ password: newPassword }, 'Password updated successfully.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  return {
    getAllUsers: getAllUsers,
    findUserByUsername: findUserByUsername,
    findUserById: findUserById,
    createUser: createUser,
    handleAdminGetUsers: handleAdminGetUsers,
    handleAdminCreateUser: handleAdminCreateUser,
    handleAdminToggleUser: handleAdminToggleUser,
    handleAdminChangePassword: handleAdminChangePassword
  };
})();

// ══════════════════════════════════════════════════════════════
//  ACTIVITY SERVICE
// ══════════════════════════════════════════════════════════════
var ActivityService = (function() {
  function logActivity(userId, proxyId, action, country, provider, proxyStr) {
    try {
      var sheet = getSheet(SHEET_ACTIVITY);
      var id    = generateActivityId();
      sheet.appendRow([
        id,
        sanitizeStr(userId),
        sanitizeStr(proxyId),
        sanitizeStr(action),
        nowISO(),
        sanitizeStr(country),
        sanitizeStr(provider),
        sanitizeProxy(proxyStr)
      ]);
    } catch (e) {
      Logger.log('Activity log error: ' + e.message);
    }
  }

  function getActivity(userId, isAdmin, filters) {
    var sheet = getSheet(SHEET_ACTIVITY);
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    filters = filters || {};
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowUserId  = String(row[1]);
      var rowAction  = String(row[3]);
      var rowCountry = String(row[5]);
      var rowProv    = String(row[6]);

      if (!isAdmin && rowUserId !== String(userId)) continue;
      if (filters.country  && rowCountry !== filters.country)  continue;
      if (filters.provider && rowProv    !== filters.provider) continue;
      if (filters.action   && rowAction  !== filters.action)   continue;

      rows.push({
        id:        String(row[0]),
        user_id:   rowUserId,
        proxy_id:  String(row[2]),
        action:    rowAction,
        timestamp: String(row[4]),
        country:   rowCountry,
        provider:  rowProv,
        proxy:     String(row[7])
      });
    }

    rows.sort(function(a, b) { return b.timestamp.localeCompare(a.timestamp); });
    return rows.slice(0, 500);
  }

  function handleGetActivity(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var rows = getActivity(user.id, user.role === 'admin', body.filters || {});
    return successResponse(rows);
  }

  function handleAdminGetActivity(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    var rows = getActivity(null, true, body.filters || {});
    return successResponse(rows);
  }

  return {
    logActivity: logActivity,
    getActivity: getActivity,
    handleGetActivity: handleGetActivity,
    handleAdminGetActivity: handleAdminGetActivity
  };
})();

// ══════════════════════════════════════════════════════════════
//  PROXY SERVICE
// ══════════════════════════════════════════════════════════════
var ProxyService = (function() {
  function rowToProxy(row) {
    return {
      id:             String(row[PC.ID]),
      user_id:        String(row[PC.USER_ID]),
      country:        String(row[PC.COUNTRY]),
      provider:       String(row[PC.PROVIDER]),
      proxy:          String(row[PC.PROXY]),
      status:         String(row[PC.STATUS]),
      created_at:     String(row[PC.CREATED_AT]),
      used_at:        String(row[PC.USED_AT]),
      last_copied_at: String(row[PC.LAST_COPIED_AT]),
      copy_count:     Number(row[PC.COPY_COUNT]) || 0
    };
  }

  function getUserProxies(userId, filters) {
    var sheet = getSheet(SHEET_PROXIES);
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    filters = filters || {};
    var proxies = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[PC.USER_ID]) !== String(userId)) continue;
      if (String(row[PC.STATUS]) === 'deleted') continue;

      if (filters.country  && String(row[PC.COUNTRY]).toUpperCase()  !== String(filters.country).toUpperCase())  continue;
      if (filters.provider && String(row[PC.PROVIDER]) !== filters.provider) continue;
      if (filters.status   && String(row[PC.STATUS])   !== filters.status)   continue;

      proxies.push(rowToProxy(row));
    }

    proxies.sort(function(a, b) { return b.created_at.localeCompare(a.created_at); });
    return proxies;
  }

  function getAllProxies() {
    var sheet = getSheet(SHEET_PROXIES);
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var proxies = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][PC.STATUS]) === 'deleted') continue;
      proxies.push(rowToProxy(data[i]));
    }
    proxies.sort(function(a, b) { return b.created_at.localeCompare(a.created_at); });
    return proxies;
  }

  function addProxies(userId, country, provider, proxyStrings) {
    if (!Array.isArray(proxyStrings) || proxyStrings.length === 0) {
      throw new Error('No proxy strings provided.');
    }

    var sheet = getSheet(SHEET_PROXIES);
    var cleanCountry  = sanitizeStr(country).toUpperCase();
    var cleanProvider = sanitizeStr(provider);

    var existingData = sheet.getDataRange().getValues();
    var existingSet  = {};
    for (var i = 1; i < existingData.length; i++) {
      var r = existingData[i];
      if (String(r[PC.USER_ID]) === String(userId) && String(r[PC.STATUS]) !== 'deleted') {
        var key = String(r[PC.PROXY]).trim().toLowerCase();
        existingSet[key] = true;
      }
    }

    var added = 0;
    var skipped = 0;
    var now = nowISO();
    var newRows = [];

    for (var j = 0; j < proxyStrings.length; j++) {
      var raw = sanitizeProxy(proxyStrings[j]);
      if (!raw) continue;
      var lowerKey = raw.toLowerCase();
      if (existingSet[lowerKey]) {
        skipped++;
        continue;
      }
      existingSet[lowerKey] = true;
      var proxyId = generateProxyId();
      newRows.push([proxyId, userId, cleanCountry, cleanProvider, raw, 'available', now, '', '', 0]);
      added++;
    }

    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
      ActivityService.logActivity(userId, 'BATCH', 'ADD_PROXY', cleanCountry, cleanProvider, added + ' proxies added');
    }

    return { added: added, skipped: skipped };
  }

  function copyProxy(proxyId, userId) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(8000);
      var sheet  = getSheet(SHEET_PROXIES);
      var rowIdx = findRowIndex(sheet, PC.ID, proxyId);
      if (rowIdx < 0) throw new Error('Proxy not found.');

      var rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (String(rowData[PC.USER_ID]) !== String(userId)) {
        throw new Error('Access denied.');
      }
      if (String(rowData[PC.STATUS]) === 'deleted') {
        throw new Error('Proxy has been deleted.');
      }

      var now2 = nowISO();
      var currentCount = Number(rowData[PC.COPY_COUNT]) || 0;
      var newCount = currentCount + 1;
      var usedAt = rowData[PC.USED_AT] ? String(rowData[PC.USED_AT]) : now2;

      // Single range write for all 5 columns (STATUS, CREATED_AT, USED_AT, LAST_COPIED_AT, COPY_COUNT)
      sheet.getRange(rowIdx, PC.STATUS + 1, 1, 5).setValues([
        ['used', String(rowData[PC.CREATED_AT]), usedAt, now2, newCount]
      ]);

      return {
        id:             proxyId,
        status:         'used',
        copy_count:     newCount,
        used_at:        usedAt,
        last_copied_at: now2,
        proxy:          String(rowData[PC.PROXY]),
        provider:       String(rowData[PC.PROVIDER]),
        country:        String(rowData[PC.COUNTRY])
      };
    } finally {
      lock.releaseLock();
    }
  }

  function copyMultiple(proxyIds, userId) {
    if (!proxyIds || !proxyIds.length) return [];
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var sheet = getSheet(SHEET_PROXIES);
      var data  = sheet.getDataRange().getValues();
      if (data.length < 2) return [];

      var targetSet = {};
      for (var i = 0; i < proxyIds.length; i++) {
        targetSet[String(proxyIds[i]).trim()] = true;
      }

      var now2 = nowISO();
      var updated = [];
      var activityBatch = [];

      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var pid = String(row[PC.ID]).trim();
        if (!targetSet[pid]) continue;
        if (String(row[PC.STATUS]) === 'deleted') continue;
        if (String(row[PC.USER_ID]) !== String(userId)) continue;

        var currentCount = Number(row[PC.COPY_COUNT]) || 0;
        var newCount = currentCount + 1;
        var usedAt = row[PC.USED_AT] ? String(row[PC.USED_AT]) : now2;
        var rowNum = r + 1;

        // Single range write for this row
        sheet.getRange(rowNum, PC.STATUS + 1, 1, 5).setValues([
          ['used', String(row[PC.CREATED_AT]), usedAt, now2, newCount]
        ]);

        var pObj = {
          id:             pid,
          status:         'used',
          copy_count:     newCount,
          used_at:        usedAt,
          last_copied_at: now2,
          proxy:          String(row[PC.PROXY]),
          provider:       String(row[PC.PROVIDER]),
          country:        String(row[PC.COUNTRY])
        };
        updated.push(pObj);

        activityBatch.push([
          generateActivityId(),
          userId,
          pid,
          'COPY_PROXY',
          now2,
          pObj.country,
          pObj.provider,
          pObj.proxy
        ]);
      }

      // Batch write all activity logs in 1 single API call
      if (activityBatch.length > 0) {
        try {
          var actSheet = getSheet(SHEET_ACTIVITY);
          actSheet.getRange(actSheet.getLastRow() + 1, 1, activityBatch.length, activityBatch[0].length).setValues(activityBatch);
        } catch (e) {
          Logger.log('Activity batch error: ' + e.message);
        }
      }

      return updated;
    } finally {
      lock.releaseLock();
    }
  }

  function resetProxy(proxyId, userId, isAdmin) {
    var sheet  = getSheet(SHEET_PROXIES);
    var rowIdx = findRowIndex(sheet, PC.ID, proxyId);
    if (rowIdx < 0) throw new Error('Proxy not found.');

    var rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!isAdmin && String(rowData[PC.USER_ID]) !== String(userId)) {
      throw new Error('Access denied.');
    }

    sheet.getRange(rowIdx, PC.STATUS + 1, 1, 5).setValues([
      ['available', String(rowData[PC.CREATED_AT]), '', '', 0]
    ]);

    return { id: proxyId, status: 'available' };
  }

  function resetMultiple(proxyIds, userId, isAdmin) {
    if (!proxyIds || !proxyIds.length) return [];
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var sheet = getSheet(SHEET_PROXIES);
      var data  = sheet.getDataRange().getValues();
      if (data.length < 2) return [];

      var targetSet = {};
      for (var i = 0; i < proxyIds.length; i++) {
        targetSet[String(proxyIds[i]).trim()] = true;
      }

      var now2 = nowISO();
      var updated = [];
      var activityBatch = [];

      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var pid = String(row[PC.ID]).trim();
        if (!targetSet[pid]) continue;
        if (!isAdmin && String(row[PC.USER_ID]) !== String(userId)) continue;

        var rowNum = r + 1;
        sheet.getRange(rowNum, PC.STATUS + 1, 1, 5).setValues([
          ['available', String(row[PC.CREATED_AT]), '', '', 0]
        ]);

        updated.push({ id: pid, status: 'available' });
        activityBatch.push([
          generateActivityId(),
          userId,
          pid,
          'RESET_PROXY',
          now2,
          String(row[PC.COUNTRY]),
          String(row[PC.PROVIDER]),
          String(row[PC.PROXY])
        ]);
      }

      if (activityBatch.length > 0) {
        try {
          var actSheet = getSheet(SHEET_ACTIVITY);
          actSheet.getRange(actSheet.getLastRow() + 1, 1, activityBatch.length, activityBatch[0].length).setValues(activityBatch);
        } catch (e) {}
      }

      return updated;
    } finally {
      lock.releaseLock();
    }
  }

  function deleteProxy(proxyId, userId, isAdmin) {
    var sheet  = getSheet(SHEET_PROXIES);
    var rowIdx = findRowIndex(sheet, PC.ID, proxyId);
    if (rowIdx < 0) throw new Error('Proxy not found.');

    var rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!isAdmin && String(rowData[PC.USER_ID]) !== String(userId)) {
      throw new Error('Access denied.');
    }

    sheet.getRange(rowIdx, PC.STATUS + 1).setValue('deleted');
    return { id: proxyId };
  }

  function deleteMultiple(proxyIds, userId, isAdmin) {
    if (!proxyIds || !proxyIds.length) return 0;
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var sheet = getSheet(SHEET_PROXIES);
      var data  = sheet.getDataRange().getValues();
      if (data.length < 2) return 0;

      var targetSet = {};
      for (var i = 0; i < proxyIds.length; i++) {
        targetSet[String(proxyIds[i]).trim()] = true;
      }

      var now2 = nowISO();
      var count = 0;
      var activityBatch = [];

      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var pid = String(row[PC.ID]).trim();
        if (!targetSet[pid]) continue;
        if (!isAdmin && String(row[PC.USER_ID]) !== String(userId)) continue;

        var rowNum = r + 1;
        sheet.getRange(rowNum, PC.STATUS + 1).setValue('deleted');
        count++;

        activityBatch.push([
          generateActivityId(),
          userId,
          pid,
          'DELETE_PROXY',
          now2,
          String(row[PC.COUNTRY]),
          String(row[PC.PROVIDER]),
          String(row[PC.PROXY])
        ]);
      }

      if (activityBatch.length > 0) {
        try {
          var actSheet = getSheet(SHEET_ACTIVITY);
          actSheet.getRange(actSheet.getLastRow() + 1, 1, activityBatch.length, activityBatch[0].length).setValues(activityBatch);
        } catch (e) {}
      }

      return count;
    } finally {
      lock.releaseLock();
    }
  }

  // Handlers
  function handleGetDashboard(token) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var proxies = (user.role === 'admin') ? getAllProxies() : getUserProxies(user.id);
    var total = proxies.length;
    var avail = proxies.filter(function(p) { return p.status === 'available'; }).length;
    var used  = proxies.filter(function(p) { return p.status === 'used'; }).length;
    return successResponse({ stats: { total: total, available: avail, used: used }, proxies: proxies });
  }

  function handleGetProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var proxies;
    if (user.role === 'admin') {
      proxies = getAllProxies();
      if (body && body.userId) {
        proxies = proxies.filter(function(p) { return p.user_id === String(body.userId); });
      }
    } else {
      proxies = getUserProxies(user.id, body ? body.filters : {});
    }
    return successResponse(proxies);
  }

  function handleAddProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    try {
      var targetUserId = (user.role === 'admin' && body.userId) ? sanitizeStr(body.userId) : user.id;
      var result = addProxies(targetUserId, body.country, body.provider, body.proxies);
      return successResponse(result, result.added + ' proxy/proxies added.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleCopyProxy(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    try {
      var result = copyProxy(sanitizeStr(body.proxyId), user.id);
      ActivityService.logActivity(user.id, result.id, 'COPY_PROXY', result.country, result.provider, result.proxy);
      return successResponse(result, 'Proxy copied and marked as used.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleCopyMultipleProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var proxyIds = body.proxyIds;
    if (!proxyIds || !proxyIds.length) return errorResponse('proxyIds array is required.', 400);
    try {
      var updated = copyMultiple(proxyIds, user.id);
      return successResponse({ count: updated.length, proxies: updated }, updated.length + ' proxy/proxies copied.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleResetProxy(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    try {
      var result = resetProxy(sanitizeStr(body.proxyId), user.id, user.role === 'admin');
      ActivityService.logActivity(user.id, result.id, 'RESET_PROXY', '', '', '');
      return successResponse(result, 'Proxy reset to available.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleResetMultipleProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var proxyIds = body.proxyIds;
    if (!proxyIds || !proxyIds.length) return errorResponse('proxyIds array is required.', 400);
    try {
      var updated = resetMultiple(proxyIds, user.id, user.role === 'admin');
      return successResponse({ count: updated.length, proxies: updated }, updated.length + ' proxy/proxies reset.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleDeleteProxy(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    try {
      var result = deleteProxy(sanitizeStr(body.proxyId), user.id, user.role === 'admin');
      ActivityService.logActivity(user.id, result.id, 'DELETE_PROXY', '', '', '');
      return successResponse(null, 'Proxy deleted.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleDeleteMultipleProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var proxyIds = body.proxyIds;
    if (!proxyIds || !proxyIds.length) return errorResponse('proxyIds array is required.', 400);
    try {
      var count = deleteMultiple(proxyIds, user.id, user.role === 'admin');
      return successResponse({ count: count }, count + ' proxy/proxies deleted.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminGetProxies(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    return successResponse(getAllProxies());
  }

  function handleAdminResetProxy(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    try {
      var result = resetProxy(sanitizeStr(body.proxyId), caller.id, true);
      return successResponse(result, 'Proxy reset.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminDeleteProxy(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);
    try {
      deleteProxy(sanitizeStr(body.proxyId), caller.id, true);
      return successResponse(null, 'Proxy deleted.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  return {
    handleGetDashboard: handleGetDashboard,
    handleGetProxies: handleGetProxies,
    handleAddProxies: handleAddProxies,
    handleCopyProxy: handleCopyProxy,
    handleCopyMultipleProxies: handleCopyMultipleProxies,
    handleResetProxy: handleResetProxy,
    handleResetMultipleProxies: handleResetMultipleProxies,
    handleDeleteProxy: handleDeleteProxy,
    handleDeleteMultipleProxies: handleDeleteMultipleProxies,
    handleAdminGetProxies: handleAdminGetProxies,
    handleAdminResetProxy: handleAdminResetProxy,
    handleAdminDeleteProxy: handleAdminDeleteProxy
  };
})();

// ══════════════════════════════════════════════════════════════
//  HTTP ROUTER: doGet & doPost
// ══════════════════════════════════════════════════════════════
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'health') {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'Proxy Collector API is running.', timestamp: nowISO() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, message: 'Use POST requests for API calls.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body   = parseBody(e);
    var action = sanitizeStr(body.action);
    var token  = body.token ? String(body.token) : '';

    switch (action) {
      // ── Auth ─────────────────────────────────────────────────
      case 'login':
        return handleLogin(body);

      case 'logout':
        return handleLogout(token);

      case 'me':
        return handleMe(token);

      // ── Proxies ───────────────────────────────────────────────
      case 'getDashboard':
        return ProxyService.handleGetDashboard(token);

      case 'getProxies':
        return ProxyService.handleGetProxies(token, body);

      case 'addProxies':
        return ProxyService.handleAddProxies(token, body);

      case 'copyProxy':
        return ProxyService.handleCopyProxy(token, body);

      case 'copyMultipleProxies':
        return ProxyService.handleCopyMultipleProxies(token, body);

      case 'resetProxy':
        return ProxyService.handleResetProxy(token, body);

      case 'resetMultipleProxies':
        return ProxyService.handleResetMultipleProxies(token, body);

      case 'deleteProxy':
        return ProxyService.handleDeleteProxy(token, body);

      case 'deleteMultipleProxies':
        return ProxyService.handleDeleteMultipleProxies(token, body);

      // ── Activity ──────────────────────────────────────────────
      case 'getActivity':
        return ActivityService.handleGetActivity(token, body);

      // ── Admin: Users ──────────────────────────────────────────
      case 'adminGetUsers':
        return UserService.handleAdminGetUsers(token);

      case 'adminCreateUser':
        return UserService.handleAdminCreateUser(token, body);

      case 'adminToggleUser':
        return UserService.handleAdminToggleUser(token, body);

      case 'adminChangePassword':
        return UserService.handleAdminChangePassword(token, body);

      // ── Admin: Proxies ────────────────────────────────────────
      case 'adminGetProxies':
        return ProxyService.handleAdminGetProxies(token, body);

      case 'adminResetProxy':
        return ProxyService.handleAdminResetProxy(token, body);

      case 'adminDeleteProxy':
        return ProxyService.handleAdminDeleteProxy(token, body);

      case 'adminGetActivity':
        return ActivityService.handleAdminGetActivity(token, body);

      // ── Health / Default ──────────────────────────────────────
      case 'health':
        return successResponse({ status: 'ok' }, 'Proxy Collector API is running.');

      default:
        return errorResponse('Unknown action: ' + action, 400);
    }

  } catch (err) {
    Logger.log('Unhandled error in doPost: ' + err.message + '\n' + err.stack);
    return errorResponse('Internal server error: ' + err.message, 500);
  }
}
