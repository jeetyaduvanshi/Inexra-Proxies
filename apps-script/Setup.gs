/**
 * Setup.gs — Database initialization and admin bootstrapping
 * Self-contained: does not depend on other files to run setup.
 */

// ── Sheet Names ───────────────────────────────────────────────
var SHEET_USERS    = 'Users';
var SHEET_PROXIES  = 'Proxies';
var SHEET_ACTIVITY = 'Activity';
var SHEET_SESSIONS = 'Sessions';

// ── Spreadsheet Helper ────────────────────────────────────────
function getSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Spreadsheet not found. Please open Apps Script directly from Extensions > Apps Script in your Google Sheet.');
}

function getOrCreateSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// ══════════════════════════════════════════════════════════════
//  1. setupDatabase()
//  Creates all 4 required sheets with correct headers & colors.
// ══════════════════════════════════════════════════════════════
function setupDatabase() {
  Logger.log('=== Setting up Proxy Collector Database ===');

  var ss = getSpreadsheet();

  // ── Users Sheet ───────────────────────────────────────────────
  var usersSheet = getOrCreateSheet(SHEET_USERS);
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(['id', 'username', 'password_hash', 'display_name', 'role', 'active', 'created_at']);
    usersSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Users sheet created.');
  } else {
    Logger.log('ℹ Users sheet already exists.');
  }

  // ── Proxies Sheet ─────────────────────────────────────────────
  var proxiesSheet = getOrCreateSheet(SHEET_PROXIES);
  if (proxiesSheet.getLastRow() === 0) {
    proxiesSheet.appendRow(['id', 'user_id', 'country', 'provider', 'proxy', 'status', 'created_at', 'used_at', 'last_copied_at', 'copy_count']);
    proxiesSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Proxies sheet created.');
  } else {
    Logger.log('ℹ Proxies sheet already exists.');
  }

  // ── Activity Sheet ────────────────────────────────────────────
  var activitySheet = getOrCreateSheet(SHEET_ACTIVITY);
  if (activitySheet.getLastRow() === 0) {
    activitySheet.appendRow(['id', 'user_id', 'proxy_id', 'action', 'timestamp', 'country', 'provider', 'proxy']);
    activitySheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Activity sheet created.');
  } else {
    Logger.log('ℹ Activity sheet already exists.');
  }

  // ── Sessions Sheet ────────────────────────────────────────────
  var sessionsSheet = getOrCreateSheet(SHEET_SESSIONS);
  if (sessionsSheet.getLastRow() === 0) {
    sessionsSheet.appendRow(['token', 'user_id', 'created_at', 'expires_at', 'active']);
    sessionsSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#22c55e');
    Logger.log('✓ Sessions sheet created.');
  } else {
    Logger.log('ℹ Sessions sheet already exists.');
  }

  // ── Freeze header rows ────────────────────────────────────────
  [usersSheet, proxiesSheet, activitySheet, sessionsSheet].forEach(function(sh) {
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);
  });

  Logger.log('=== Database setup complete! ===');
  Logger.log('Next: Run createInitialAdmin() to create your admin account.');
}

// ══════════════════════════════════════════════════════════════
//  2. createInitialAdmin()
//  Creates the initial admin account (admin / admin123).
// ══════════════════════════════════════════════════════════════
var PASSWORD_SALT = 'ProxyCollector_2026_InternalSalt_';

function hashPassword(plaintext) {
  var salted = PASSWORD_SALT + plaintext;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
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
    var now = new Date().toISOString();

    sheet.appendRow([id, ADMIN_USERNAME, hash, ADMIN_DISPLAY_NAME, 'admin', 'TRUE', now]);
    Logger.log('✓ Admin account created successfully!');
    Logger.log('  Username: ' + ADMIN_USERNAME);
    Logger.log('  Password: ' + ADMIN_PASSWORD);
    Logger.log('  Role: admin');
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
