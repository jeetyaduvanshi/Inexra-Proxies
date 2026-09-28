/**
 * UserService.gs — User Management
 *
 * Users sheet columns (0-based):
 *   0: id
 *   1: username
 *   2: password_hash
 *   3: display_name
 *   4: role          (user | admin)
 *   5: active        (TRUE | FALSE)
 *   6: created_at
 */

var UC = {
  ID:            0,
  USERNAME:      1,
  PASSWORD_HASH: 2,
  DISPLAY_NAME:  3,
  ROLE:          4,
  ACTIVE:        5,
  CREATED_AT:    6
};

var UserService = (function() {

  function rowToUser(row) {
    return {
      id:            String(row[UC.ID]),
      username:      String(row[UC.USERNAME]),
      password_hash: String(row[UC.PASSWORD_HASH]),
      display_name:  String(row[UC.DISPLAY_NAME]),
      role:          String(row[UC.ROLE]) || 'user',
      active:        String(row[UC.ACTIVE]),
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
    if (!plainPassword || plainPassword.length < 8) throw new Error('Password must be at least 8 characters.');

    // Duplicate check
    if (findUserByUsername(username)) throw new Error('Username "' + username + '" already exists.');

    var id = generateUserId();
    var hash = hashPassword(plainPassword);
    var now  = nowISO();

    var sheet = getSheet(SHEET_USERS);
    sheet.appendRow([id, username, hash, displayName, role, 'TRUE', now]);

    return { id, username, display_name: displayName, role, active: 'TRUE', created_at: now };
  }

  function toggleUserActive(userId, newActive) {
    var sheet = getSheet(SHEET_USERS);
    var rowIdx = findRowIndex(sheet, UC.ID, userId);
    if (rowIdx < 0) throw new Error('User not found.');
    sheet.getRange(rowIdx, UC.ACTIVE + 1).setValue(newActive ? 'TRUE' : 'FALSE');
  }

  function changePassword(userId, newPlainPassword) {
    if (!newPlainPassword || newPlainPassword.length < 8) throw new Error('Password must be at least 8 characters.');
    var sheet = getSheet(SHEET_USERS);
    var rowIdx = findRowIndex(sheet, UC.ID, userId);
    if (rowIdx < 0) throw new Error('User not found.');
    sheet.getRange(rowIdx, UC.PASSWORD_HASH + 1).setValue(hashPassword(newPlainPassword));
  }

  // ── Public API Handlers ───────────────────────────────────────

  function handleAdminGetUsers(token) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    var users = getAllUsers().map(function(u) {
      return {
        id:           u.id,
        username:     u.username,
        display_name: u.display_name,
        role:         u.role,
        active:       u.active,
        created_at:   u.created_at
      };
    });

    return successResponse(users);
  }

  function handleAdminCreateUser(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    try {
      var user = createUser(
        body.username,
        body.password,
        body.displayName || body.display_name || '',
        body.role || 'user'
      );
      return successResponse(user, 'User created successfully.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminToggleUser(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    var targetId = sanitizeStr(body.userId);
    if (targetId === caller.id) return errorResponse('You cannot disable your own account.', 400);

    try {
      toggleUserActive(targetId, body.active === true || body.active === 'true');
      return successResponse(null, 'User updated.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  function handleAdminChangePassword(token, body) {
    var caller = validateSession(token);
    if (!caller) return errorResponse('Unauthorized', 401);
    if (caller.role !== 'admin') return errorResponse('Admin access required.', 403);

    try {
      changePassword(sanitizeStr(body.userId), body.newPassword || '');
      return successResponse(null, 'Password updated.');
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  return {
    getAllUsers,
    findUserByUsername,
    findUserById,
    createUser,
    handleAdminGetUsers,
    handleAdminCreateUser,
    handleAdminToggleUser,
    handleAdminChangePassword
  };
})();
