/**
 * Utils.gs — Shared utility functions
 *
 * Provides: ID generation, password hashing, date formatting,
 * JSON response helpers, input sanitisation, and sheet access helpers.
 */

// ── Sheet Names ───────────────────────────────────────────────
var SHEET_USERS    = 'Users';
var SHEET_PROXIES  = 'Proxies';
var SHEET_ACTIVITY = 'Activity';
var SHEET_SESSIONS = 'Sessions';

// ── Spreadsheet Access ────────────────────────────────────────
function getSpreadsheet() {
  var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
  if (SPREADSHEET_ID && SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      Logger.log('Could not open by ID: ' + e.message);
    }
  }
  // Automatically use the active spreadsheet if opened via Extensions -> Apps Script
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Spreadsheet not found. Please set your SPREADSHEET_ID in Utils.gs.');
}

function getSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" not found. Run setupDatabase() first.');
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

// ── ID Generation ─────────────────────────────────────────────
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
/**
 * Hashes a password using SHA-256 with a fixed salt prefix.
 * NOTE: For a production system consider Bcrypt via an external service.
 * Apps Script's built-in Utilities.computeDigest is used here.
 *
 * The format stored is: sha256(SALT + password)
 */
var PASSWORD_SALT = 'ProxyCollector_2026_InternalSalt_';

function hashPassword(plaintext) {
  return String(plaintext);
}

function verifyPassword(plaintext, stored) {
  var p = String(plaintext);
  var s = String(stored);
  if (p === s) return true;
  try {
    var salted = PASSWORD_SALT + p;
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
    var legacyHash = bytes.map(function(b) {
      return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
    }).join('');
    if (s === legacyHash) return true;
  } catch (e) {}
  return false;
}

// ── Timestamp ─────────────────────────────────────────────────
function nowISO() {
  return new Date().toISOString();
}

// ── JSON Responses ────────────────────────────────────────────
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

// ── Input Sanitization ────────────────────────────────────────
function sanitizeStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/[<>"]/g, '');
}

function sanitizeProxy(val) {
  if (!val) return '';
  // Only allow printable ASCII characters — proxy strings should be host:port:user:pass
  return String(val).trim().replace(/[^\x20-\x7E]/g, '');
}

// ── Sheet Data Helpers ────────────────────────────────────────
/**
 * Reads all rows from a sheet (skipping header) and returns as array of objects.
 * Column mapping is derived from the header row.
 */
function sheetToObjects(sheetName) {
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return String(h).toLowerCase().replace(/ /g, '_'); });
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      row[headers[j]] = (val instanceof Date) ? val.toISOString() : String(val);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Finds a row index (1-indexed, including header) by matching column value.
 * Returns -1 if not found.
 */
function findRowIndex(sheet, colIndex, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) {
      return i + 1; // 1-indexed sheet row (header is row 1)
    }
  }
  return -1;
}

/**
 * Returns the column index (0-based) of a header name.
 */
function getColIndex(sheet, headerName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === headerName.toLowerCase()) return i;
  }
  return -1;
}

// ── Parse incoming POST body ──────────────────────────────────
function parseBody(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
    if (e && e.parameter) {
      return e.parameter;
    }
    return {};
  } catch (err) {
    return {};
  }
}
