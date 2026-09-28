/**
 * ProxyService.gs — Proxy CRUD & Business Logic
 *
 * Proxies sheet columns (0-based):
 *   0:  id
 *   1:  user_id
 *   2:  country
 *   3:  provider
 *   4:  proxy          (host:port:user:pass)
 *   5:  status         (available | used | deleted)
 *   6:  created_at
 *   7:  used_at
 *   8:  last_copied_at
 *   9:  copy_count
 */

var PC = {
  ID:             0,
  USER_ID:        1,
  COUNTRY:        2,
  PROVIDER:       3,
  PROXY:          4,
  STATUS:         5,
  CREATED_AT:     6,
  USED_AT:        7,
  LAST_COPIED_AT: 8,
  COPY_COUNT:     9
};

var ProxyService = (function() {

  // ── Row mapper ────────────────────────────────────────────────
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
      copy_count:     parseInt(String(row[PC.COPY_COUNT]), 10) || 0
    };
  }

  // ── Get all proxies for a specific user ───────────────────────
  function getUserProxies(userId) {
    var sheet = getSheet(SHEET_PROXIES);
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var proxies = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[PC.USER_ID]) === String(userId) && String(row[PC.STATUS]) !== 'deleted') {
        proxies.push(rowToProxy(row));
      }
    }
    return proxies;
  }

  // ── Get all proxies (admin) ───────────────────────────────────
  function getAllProxies() {
    var sheet = getSheet(SHEET_PROXIES);
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var proxies = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[PC.ID]).trim()) {
        proxies.push(rowToProxy(row));
      }
    }
    return proxies;
  }

  // ── Verify proxy belongs to user ─────────────────────────────
  function verifyOwnership(proxyId, userId) {
    var sheet  = getSheet(SHEET_PROXIES);
    var rowIdx = findRowIndex(sheet, PC.ID, proxyId);
    if (rowIdx < 0) return { ok: false, msg: 'Proxy not found.', rowIdx: -1 };

    var row    = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
    var owner  = String(row[PC.USER_ID]);
    if (owner !== String(userId)) return { ok: false, msg: 'Access denied.', rowIdx: -1 };
    if (String(row[PC.STATUS]) === 'deleted') return { ok: false, msg: 'Proxy has been deleted.', rowIdx: -1 };

    return { ok: true, rowIdx, row };
  }

  // ── Add proxies (bulk) ────────────────────────────────────────
  function addProxies(userId, country, provider, proxyLines) {
    var sheet    = getSheet(SHEET_PROXIES);
    var now      = nowISO();
    var added    = 0;
    var skipped  = 0;

    // Load existing proxies for duplicate check (only this user's)
    var existing = new Set();
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][PC.USER_ID]) === String(userId) && String(data[i][PC.STATUS]) !== 'deleted') {
        existing.add(String(data[i][PC.PROXY]).trim().toLowerCase());
      }
    }

    var rowsToAdd = [];
    for (var j = 0; j < proxyLines.length; j++) {
      var line = sanitizeProxy(proxyLines[j]);
      if (!line) continue;

      if (existing.has(line.toLowerCase())) {
        skipped++;
        continue;
      }

      existing.add(line.toLowerCase()); // prevent duplicates within the same batch
      var id = generateProxyId();
      rowsToAdd.push([id, userId, country, provider, line, 'available', now, '', '', 0]);
      added++;
    }

    if (rowsToAdd.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length)
           .setValues(rowsToAdd);
    }

    return { added, skipped };
  }

  // ── Copy proxy (mark as used) ─────────────────────────────────
  function copyProxy(proxyId, userId) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000); // wait up to 10s for lock
    } catch (e) {
      throw new Error('Server is busy. Please try again in a moment.');
    }

    try {
      var sheet  = getSheet(SHEET_PROXIES);
      var rowIdx = findRowIndex(sheet, PC.ID, proxyId);

      if (rowIdx < 0) throw new Error('Proxy not found.');

      var numCols = sheet.getLastColumn();
      var rowData = sheet.getRange(rowIdx, 1, 1, numCols).getValues()[0];

      // Ownership check — NEVER trust the client's user_id
      if (String(rowData[PC.USER_ID]) !== String(userId)) {
        throw new Error('Access denied.');
      }

      if (String(rowData[PC.STATUS]) === 'deleted') {
        throw new Error('Proxy has been deleted.');
      }

      if (String(rowData[PC.STATUS]) === 'used') {
        // Already used — still allow copy but track it
        var existingCount = parseInt(String(rowData[PC.COPY_COUNT]), 10) || 0;
        var newCount = existingCount + 1;
        var now = nowISO();
        sheet.getRange(rowIdx, PC.LAST_COPIED_AT + 1).setValue(now);
        sheet.getRange(rowIdx, PC.COPY_COUNT + 1).setValue(newCount);

        return {
          id:             proxyId,
          status:         'used',
          copy_count:     newCount,
          last_copied_at: now,
          used_at:        String(rowData[PC.USED_AT]),
          proxy:          String(rowData[PC.PROXY]),
          provider:       String(rowData[PC.PROVIDER])
        };
      }

      // Mark as used
      var now2     = nowISO();
      var newCount2 = (parseInt(String(rowData[PC.COPY_COUNT]), 10) || 0) + 1;

      sheet.getRange(rowIdx, PC.STATUS         + 1).setValue('used');
      sheet.getRange(rowIdx, PC.USED_AT        + 1).setValue(now2);
      sheet.getRange(rowIdx, PC.LAST_COPIED_AT + 1).setValue(now2);
      sheet.getRange(rowIdx, PC.COPY_COUNT     + 1).setValue(newCount2);

      return {
        id:             proxyId,
        status:         'used',
        copy_count:     newCount2,
        used_at:        now2,
        last_copied_at: now2,
        proxy:          String(rowData[PC.PROXY]),
        provider:       String(rowData[PC.PROVIDER]),
        country:        String(rowData[PC.COUNTRY])
      };
    } finally {
      lock.releaseLock();
    }
  }

  // ── Reset proxy ───────────────────────────────────────────────
  function resetProxy(proxyId, userId, isAdmin) {
    var sheet  = getSheet(SHEET_PROXIES);
    var rowIdx = findRowIndex(sheet, PC.ID, proxyId);
    if (rowIdx < 0) throw new Error('Proxy not found.');

    var rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Ownership: regular users can only reset their own proxies
    if (!isAdmin && String(rowData[PC.USER_ID]) !== String(userId)) {
      throw new Error('Access denied.');
    }

    if (String(rowData[PC.STATUS]) === 'deleted') throw new Error('Proxy has been deleted.');

    sheet.getRange(rowIdx, PC.STATUS  + 1).setValue('available');
    sheet.getRange(rowIdx, PC.USED_AT + 1).setValue('');
    sheet.getRange(rowIdx, PC.LAST_COPIED_AT + 1).setValue('');
    // copy_count intentionally NOT reset

    return {
      id:       proxyId,
      status:   'available',
      country:  String(rowData[PC.COUNTRY]),
      provider: String(rowData[PC.PROVIDER]),
      proxy:    String(rowData[PC.PROXY])
    };
  }

  // ── Delete proxy (soft delete) ────────────────────────────────
  function deleteProxy(proxyId, userId, isAdmin) {
    var sheet  = getSheet(SHEET_PROXIES);
    var rowIdx = findRowIndex(sheet, PC.ID, proxyId);
    if (rowIdx < 0) throw new Error('Proxy not found.');

    var rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (!isAdmin && String(rowData[PC.USER_ID]) !== String(userId)) {
      throw new Error('Access denied.');
    }

    sheet.getRange(rowIdx, PC.STATUS + 1).setValue('deleted');

    return {
      id:       proxyId,
      country:  String(rowData[PC.COUNTRY]),
      provider: String(rowData[PC.PROVIDER]),
      proxy:    String(rowData[PC.PROXY])
    };
  }

  // ── Dashboard data ────────────────────────────────────────────
  function getDashboardData(userId) {
    var proxies   = getUserProxies(userId);
    var available = proxies.filter(function(p) { return p.status === 'available'; });
    var used      = proxies.filter(function(p) { return p.status === 'used'; });
    var countries = new Set(proxies.map(function(p) { return p.country; }));

    return {
      stats: {
        total:     proxies.length,
        available: available.length,
        used:      used.length,
        countries: countries.size
      },
      proxies: proxies
    };
  }

  // ══════════════════════════════════════════════════════════════
  // API Handlers
  // ══════════════════════════════════════════════════════════════

  function handleGetDashboard(token) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);
    var data = getDashboardData(user.id);
    return successResponse(data);
  }

  function handleGetProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);

    var proxies = getUserProxies(user.id);
    var filters = body.filters || {};

    if (filters.country)  proxies = proxies.filter(function(p) { return p.country  === filters.country; });
    if (filters.provider) proxies = proxies.filter(function(p) { return p.provider === filters.provider; });
    if (filters.status)   proxies = proxies.filter(function(p) { return p.status   === filters.status; });

    return successResponse(proxies);
  }

  function handleAddProxies(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);

    var country  = sanitizeStr(body.country).toUpperCase();
    var provider = sanitizeStr(body.provider);
    var lines    = body.proxies;

    if (!country)                         return errorResponse('Country is required.', 400);
    if (!provider)                        return errorResponse('Provider is required.', 400);
    if (!Array.isArray(lines) || lines.length === 0) return errorResponse('At least one proxy is required.', 400);
    if (lines.length > 500)               return errorResponse('Maximum 500 proxies per request.', 400);

    var result = addProxies(user.id, country, provider, lines);

    // Log each added batch as a single ADD_PROXY entry (to avoid flooding the log)
    if (result.added > 0) {
      ActivityService.logActivity(
        user.id, 'BATCH', 'ADD_PROXY', country, provider,
        result.added + ' proxies added'
      );
    }

    return successResponse(result, result.added + ' proxy/proxies added.');
  }

  function handleCopyProxy(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);

    var proxyId = sanitizeStr(body.proxyId);
    if (!proxyId) return errorResponse('proxyId is required.', 400);

    try {
      var result = copyProxy(proxyId, user.id);
      ActivityService.logActivity(user.id, proxyId, 'COPY_PROXY', result.country, result.provider, result.proxy);
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

    var updated = [];
    var errors = [];
    for (var i = 0; i < proxyIds.length; i++) {
      try {
        var pid = sanitizeStr(proxyIds[i]);
        var res = copyProxy(pid, user.id);
        ActivityService.logActivity(user.id, pid, 'COPY_PROXY', res.country, res.provider, res.proxy);
        updated.push(res);
      } catch (err) {
        errors.push(err.message);
      }
    }
    return successResponse({ count: updated.length, proxies: updated }, updated.length + ' proxy/proxies copied and marked as used.');
  }

  function handleResetProxy(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);

    var proxyId = sanitizeStr(body.proxyId);
    if (!proxyId) return errorResponse('proxyId is required.', 400);

    try {
      var result = resetProxy(proxyId, user.id, user.role === 'admin');
      ActivityService.logActivity(user.id, proxyId, 'RESET_PROXY', result.country, result.provider, result.proxy);
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

    var updated = [];
    for (var i = 0; i < proxyIds.length; i++) {
      try {
        var pid = sanitizeStr(proxyIds[i]);
        var res = resetProxy(pid, user.id, user.role === 'admin');
        ActivityService.logActivity(user.id, pid, 'RESET_PROXY', res.country, res.provider, res.proxy);
        updated.push(res);
      } catch (err) {}
    }
    return successResponse({ count: updated.length, proxies: updated }, updated.length + ' proxy/proxies reset.');
  }

  function handleDeleteProxy(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);

    var proxyId = sanitizeStr(body.proxyId);
    if (!proxyId) return errorResponse('proxyId is required.', 400);

    try {
      var result = deleteProxy(proxyId, user.id, user.role === 'admin');
      ActivityService.logActivity(user.id, proxyId, 'DELETE_PROXY', result.country, result.provider, result.proxy);
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

    var count = 0;
    for (var i = 0; i < proxyIds.length; i++) {
      try {
        var pid = sanitizeStr(proxyIds[i]);
        var res = deleteProxy(pid, user.id, user.role === 'admin');
        ActivityService.logActivity(user.id, pid, 'DELETE_PROXY', res.country, res.provider, res.proxy);
        count++;
      } catch (err) {}
    }
    return successResponse({ count: count }, count + ' proxy/proxies deleted.');
  }

  // ── Admin handlers ────────────────────────────────────────────

  function handleAdminGetProxies(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    var proxies = getAllProxies();
    return successResponse(proxies);
  }

  function handleAdminResetProxy(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    var proxyId = sanitizeStr(body.proxyId);
    try {
      var result = resetProxy(proxyId, caller.id, true);
      ActivityService.logActivity(caller.id, proxyId, 'RESET_PROXY', result.country, result.provider, result.proxy);
      return successResponse(result, 'Proxy reset.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminDeleteProxy(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    var proxyId = sanitizeStr(body.proxyId);
    try {
      var result = deleteProxy(proxyId, caller.id, true);
      ActivityService.logActivity(caller.id, proxyId, 'DELETE_PROXY', result.country, result.provider, result.proxy);
      return successResponse(null, 'Proxy deleted.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  // ── Future: Provider Importers (stub) ─────────────────────────
  var ProviderImporter = {
    importFromLoki: function(userId, country, apiKey) {
      throw new Error('LokiProxy API import not yet implemented.');
    },
    importFromDataImpulse: function(userId, country, apiKey) {
      throw new Error('DataImpulse API import not yet implemented.');
    }
  };

  return {
    handleGetDashboard,
    handleGetProxies,
    handleAddProxies,
    handleCopyProxy,
    handleCopyMultipleProxies,
    handleResetProxy,
    handleResetMultipleProxies,
    handleDeleteProxy,
    handleDeleteMultipleProxies,
    handleAdminGetProxies,
    handleAdminResetProxy,
    handleAdminDeleteProxy,
    ProviderImporter
  };
})();
