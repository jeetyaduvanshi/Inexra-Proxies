# Proxy Collector — Setup & Deployment Guide

> **Internal proxy management system. For authorized team use only.**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Create the Google Sheet](#2-create-the-google-sheet)
3. [Open Apps Script](#3-open-apps-script)
4. [Add the Apps Script Code](#4-add-the-apps-script-code)
5. [Configure the Spreadsheet ID](#5-configure-the-spreadsheet-id)
6. [Deploy as a Web App](#6-deploy-as-a-web-app)
7. [Grant Permissions](#7-grant-permissions)
8. [Create the First Admin Account](#8-create-the-first-admin-account)
9. [Configure the Frontend](#9-configure-the-frontend)
10. [Run the Application](#10-run-the-application)
11. [Create Additional Users](#11-create-additional-users)
12. [How to Use the App](#12-how-to-use-the-app)
13. [Security Notes](#13-security-notes)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Architecture Overview

```
FRONTEND (HTML/CSS/JS)
  login.html | dashboard.html | styles.css | auth.js | api.js | app.js
       |
       |  HTTPS POST (JSON body)
       v
GOOGLE APPS SCRIPT WEB APP
  Code.gs (router) | Auth.gs | UserService.gs | ProxyService.gs
  ActivityService.gs | Utils.gs | Setup.gs
       |
       |  Sheets API (internal only)
       v
GOOGLE SHEETS (private)
  Sheet: Users | Sheet: Proxies | Sheet: Activity | Sheet: Sessions
```

---

## 2. Create the Google Sheet

1. Go to sheets.google.com and create a **new blank spreadsheet**.
2. Name it: **Proxy Collector DB** (any name is fine).
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```

> Do NOT share this spreadsheet publicly. Only your Apps Script will access it.

---

## 3. Open Apps Script

In your Google Sheet, click: **Extensions > Apps Script**

Rename the project to: `Proxy Collector Backend`

---

## 4. Add the Apps Script Code

Click the **+** button next to "Files" to create new .gs files.

Create these files (exact names):

| File | Description |
|------|-------------|
| Code.gs | Main router — replace the default file |
| Auth.gs | Session management |
| UserService.gs | User CRUD |
| ProxyService.gs | Proxy CRUD + LockService |
| ActivityService.gs | Audit log |
| Utils.gs | Shared helpers |
| Setup.gs | DB init and admin bootstrap |

For each file: click it, select all (Ctrl+A), paste the code from the `apps-script/` folder.

---

## 5. Configure the Spreadsheet ID

In `Utils.gs`, find and update:

```javascript
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
```

Replace with your actual Spreadsheet ID.

---

## 6. Deploy as a Web App

1. Click **Deploy > New deployment**
2. Click the gear icon > **Web app**
3. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. Copy the **Web App URL** (ends in `/exec`)

> "Anyone" does not mean public data access. All endpoints require a valid session token. Without one, they return 401 Unauthorized.

---

## 7. Grant Permissions

When prompted, click **Allow** for all permissions.

If you see "This app isn't verified": click **Advanced** > **Go to Proxy Collector Backend (unsafe)** > **Allow**.

This is normal for internal Google account apps that haven't been through OAuth verification.

---

## 8. Create the First Admin Account

### Step 1: Setup the database

In Apps Script, open `Setup.gs`.
Select the function **setupDatabase** from the dropdown.
Click **Run**.

Expected output in Execution log:
```
=== Setting up Proxy Collector Database ===
Users sheet created.
Proxies sheet created.
Activity sheet created.
Sessions sheet created.
=== Database setup complete! ===
```

### Step 2: Create admin

Edit `Setup.gs` — find these lines and change them:
```javascript
var ADMIN_USERNAME     = 'admin';
var ADMIN_PASSWORD     = 'ChangeMe123!';
var ADMIN_DISPLAY_NAME = 'Administrator';
```

Run the **createInitialAdmin** function.

### Step 3: Clear password from code

After the admin is created, delete the password value from the code:
```javascript
var ADMIN_PASSWORD = ''; // cleared after setup
```

---

## 9. Configure the Frontend

Open `frontend/api.js` and set your Web App URL:

```javascript
const API_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/YOUR_ID/exec'
};
```

---

## 10. Run the Application

### Option A: Open directly
Double-click `frontend/login.html`.

> Note: Some browsers block cross-origin requests from file:// URLs. Use Option B if login fails.

### Option B: Local HTTP server (recommended)

With Python:
```bash
cd "Proxy  Collector for Inexra/frontend"
python -m http.server 8080
```
Open: http://localhost:8080/login.html

With Node.js:
```bash
npx serve frontend/
```

### Option C: Static hosting
Host the `frontend/` folder on GitHub Pages, Netlify, or any static host.

---

## 11. Create Additional Users

### Via Admin Panel (recommended):
1. Log in as admin
2. Click **Admin Panel** in the sidebar
3. Click **Create User**
4. Fill in details and click **Create User**

### Via Apps Script:
```javascript
function createUser_manual() {
  UserService.createUser('user02', 'SecurePass456!', 'User 02', 'user');
}
```

---

## 12. How to Use the App

### Login
Open login.html. Enter username and password.

### Dashboard
- Stats cards: Total / Available / Used / Countries
- Filter bar: search, filter by country/provider/status
- Country cards: proxies grouped by country, click to expand

### Add Proxies
Click **Add Proxies**. Select country and provider. Paste proxies one per line:
```
host1.example.com:8000:user1:pass1
host2.example.com:8001:user2:pass2
```
Duplicates are automatically skipped.

### Copy a Proxy
Click the **Copy** button on any Available proxy:
- String copied to clipboard
- Proxy marked as Used with timestamp
- Activity logged
- UI updates immediately

### Reset a Proxy
Click **Reset** on any Used proxy to return it to Available.

### Delete a Proxy
Click the trash icon. Proxy is soft-deleted (hidden from UI, retained in sheet).

### History
View all ADD_PROXY, COPY_PROXY, RESET_PROXY, DELETE_PROXY events. Filter by country, provider, or action.

### Admin Panel
Admin-only section. View all users, create users, enable/disable accounts, view/reset/delete any proxy.

---

## 13. Security Notes

| Feature | Implementation |
|---------|----------------|
| Password storage | SHA-256 + salt (never plaintext) |
| Session tokens | 64-char random, stored in Sessions sheet |
| Session lifetime | 8 hours |
| User isolation | user_id always from session, never from request body |
| Proxy ownership | Backend verifies before every operation |
| Concurrent writes | LockService on copy operations |
| Input sanitization | All inputs sanitized server-side |
| Soft deletes | status = deleted, not physical removal |
| Admin checks | Role verified on every admin endpoint |
| HTTPS | Automatic via GAS Web App |

**Recommendations:**
- Change `PASSWORD_SALT` in `Utils.gs` to a unique value before first use
- Use strong passwords (12+ chars)
- Keep the Spreadsheet ID private
- Periodically review the Sessions sheet for anomalies

---

## 14. Troubleshooting

### "Failed to fetch" / Connection error on login
- Verify `GAS_URL` in `api.js` is set and ends in `/exec`
- Make sure you deployed as a Web App (not as API Executable)

### "Internal server error" from API
- Verify `SPREADSHEET_ID` in `Utils.gs`
- Run `setupDatabase()` from `Setup.gs`
- Run `verifySetup()` to check all sheets

### "Unauthorized" with correct credentials
- Session may have expired. Clear browser localStorage/sessionStorage and log in again.

### CORS errors (file:// protocol)
- Use a local HTTP server: `python -m http.server 8080`
- Open via `http://localhost:8080/login.html`

### Apps Script timeout
- Unlikely at this scale (5-10 users, <500 proxies)
- If it happens, archive old Activity rows

### User can't log in
- Check the Users sheet: verify `active` = TRUE
- Use Admin Panel to reset their password

### Proxy copy not saved to sheet
- Check Apps Script Execution Log for LockService errors
- Refresh page to see actual state

---

## File Structure

```
Proxy Collector for Inexra/
├── frontend/
│   ├── index.html       (redirect)
│   ├── login.html       (login page)
│   ├── dashboard.html   (main SPA)
│   ├── styles.css       (all styles)
│   ├── auth.js          (client auth)
│   ├── api.js           (API client — set GAS_URL here)
│   └── app.js           (all app logic)
│
├── apps-script/
│   ├── Code.gs          (router)
│   ├── Auth.gs          (sessions)
│   ├── UserService.gs   (users)
│   ├── ProxyService.gs  (proxies)
│   ├── ActivityService.gs (audit log)
│   ├── Utils.gs         (helpers — set SPREADSHEET_ID here)
│   └── Setup.gs         (DB init + bootstrap)
│
└── README.md
```

---

## Quick Start Checklist

- [ ] Created Google Sheet, copied Spreadsheet ID
- [ ] Opened Apps Script (Extensions > Apps Script)
- [ ] Created all 7 .gs files with correct names
- [ ] Pasted code into each file
- [ ] Set SPREADSHEET_ID in Utils.gs
- [ ] Deployed as Web App (Execute as Me, Anyone)
- [ ] Authorized permissions
- [ ] Ran setupDatabase() - success
- [ ] Edited admin credentials in Setup.gs
- [ ] Ran createInitialAdmin() - success
- [ ] Cleared password from Setup.gs
- [ ] Set GAS_URL in frontend/api.js
- [ ] Opened login.html and logged in
- [ ] Created a regular user via Admin Panel
- [ ] Added test proxies
- [ ] Copied a proxy - verified Used status
- [ ] Confirmed activity appeared in History

---

*Proxy Collector - Internal Use Only*
