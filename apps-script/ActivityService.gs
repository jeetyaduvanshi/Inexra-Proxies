/**
 * ActivityService.gs — Activity/Audit Log
 *
 * Activity sheet columns (0-based):
 *   0: id
 *   1: user_id
 *   2: proxy_id
 *   3: action       (ADD_PROXY | COPY_PROXY | RESET_PROXY | DELETE_PROXY)
 *   4: timestamp
 *   5: country
 *   6: provider
 *   7: proxy        (the proxy string — for quick reference)
 */

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

  /**
   * Returns activity rows. If userId is provided and caller is not admin,
   * only that user's activity is returned.
   */
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

      // User isolation
      if (!isAdmin && rowUserId !== String(userId)) continue;

      // Filters
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

    // Sort newest first
    rows.sort(function(a, b) { return b.timestamp.localeCompare(a.timestamp); });

    // Limit to 500 most recent
    return rows.slice(0, 500);
  }

  // ── API Handlers ──────────────────────────────────────────────

  function handleGetActivity(token, body) {
    var user = validateSession(token);
    if (!user) return errorResponse('Unauthorized', 401);

    var filters = body.filters || {};
    var isAdmin = user.role === 'admin';
    var rows    = getActivity(user.id, isAdmin, filters);

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
    logActivity,
    getActivity,
    handleGetActivity,
    handleAdminGetActivity
  };
})();
