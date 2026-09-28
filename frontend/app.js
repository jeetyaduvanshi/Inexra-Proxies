/**
 * app.js — Main application logic for Proxy Collector for Inexra
 * Clean, single-page, country & provider box-based workspace
 */

// ── Country Lookup ─────────────────────────────────────────────
const COUNTRIES = {
  'UK': { flag: '🇬🇧', name: 'United Kingdom' },
  'US': { flag: '🇺🇸', name: 'United States' },
  'DE': { flag: '🇩🇪', name: 'Germany' },
  'FR': { flag: '🇫🇷', name: 'France' },
  'NL': { flag: '🇳🇱', name: 'Netherlands' },
  'CA': { flag: '🇨🇦', name: 'Canada' },
  'AU': { flag: '🇦🇺', name: 'Australia' },
  'IN': { flag: '🇮🇳', name: 'India' },
  'SG': { flag: '🇸🇬', name: 'Singapore' },
  'JP': { flag: '🇯🇵', name: 'Japan' },
  'BR': { flag: '🇧🇷', name: 'Brazil' },
  'IT': { flag: '🇮🇹', name: 'Italy' },
  'ES': { flag: '🇪🇸', name: 'Spain' },
  'PL': { flag: '🇵🇱', name: 'Poland' },
  'SE': { flag: '🇸🇪', name: 'Sweden' },
  'CH': { flag: '🇨🇭', name: 'Switzerland' },
  'AT': { flag: '🇦🇹', name: 'Austria' },
  'BE': { flag: '🇧🇪', name: 'Belgium' },
  'MX': { flag: '🇲🇽', name: 'Mexico' },
  'AE': { flag: '🇦🇪', name: 'UAE' },
  'KR': { flag: '🇰🇷', name: 'South Korea' },
  'HK': { flag: '🇭🇰', name: 'Hong Kong' },
  'VN': { flag: '🇻🇳', name: 'Vietnam' },
  'TH': { flag: '🇹🇭', name: 'Thailand' },
  'TR': { flag: '🇹🇷', name: 'Turkey' },
};

function getCountry(code) {
  if (!code) return { flag: '🌐', name: 'Global / Other' };
  const upper = String(code).toUpperCase().trim();
  if (COUNTRIES[upper]) return COUNTRIES[upper];
  return { flag: '🌐', name: upper };
}

// ── Application State ──────────────────────────────────────────
const AppState = {
  currentUser: null,
  proxies: [],
  filters: {
    search: '',
    country: '',
    provider: '',
    status: '',
  },
  selectedIds: new Set(),
  openPasteBoxes: new Set(), // box keys with inline paste drawer open
  recentlyCopiedIds: new Set(),
  adminUsers: [],
  createdUserCreds: null,
};

// ── Initialization ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  setupUserBadge();
  setupEventListeners();
  await loadData();
});

function setupUserBadge() {
  const user = Auth.getUser();
  if (user) {
    AppState.currentUser = user;
    const nameEl = document.getElementById('user-name');
    if (nameEl) {
      nameEl.textContent = user.username + (user.role === 'admin' ? ' (Admin)' : '');
    }
    const adminBtn = document.getElementById('admin-users-btn');
    if (adminBtn && user.role === 'admin') {
      adminBtn.classList.remove('hidden');
    }
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.filters.search = e.target.value.trim().toLowerCase();
      const clearBtn = document.getElementById('clear-search-btn');
      if (clearBtn) clearBtn.classList.toggle('hidden', !AppState.filters.search);
      renderBoxes();
    });
  }

  // Country select custom code toggle
  const countrySelect = document.getElementById('add-country');
  const customCountryGroup = document.getElementById('custom-country-group');
  if (countrySelect && customCountryGroup) {
    countrySelect.addEventListener('change', (e) => {
      customCountryGroup.classList.toggle('hidden', e.target.value !== 'OTHER');
    });
  }

  // Provider select custom toggle
  const providerSelect = document.getElementById('add-provider');
  const customProviderGroup = document.getElementById('custom-provider-group');
  if (providerSelect && customProviderGroup) {
    providerSelect.addEventListener('change', (e) => {
      customProviderGroup.classList.toggle('hidden', e.target.value !== 'CUSTOM');
    });
  }

  // Native drag-to-copy handler: when user selects proxy lines with mouse and presses Ctrl+C
  document.addEventListener('copy', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    // Check if selection intersects any proxy-text-pane
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const pane = (container.nodeType === 1 ? container : container.parentElement)?.closest('.proxy-text-pane');
    if (!pane) return;

    const rawText = sel.toString().trim();
    if (!rawText) return;

    // Match lines to proxies in AppState
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const matchedIds = [];
    lines.forEach(line => {
      const match = AppState.proxies.find(p => p.status !== 'deleted' && (p.proxy.trim() === line || line.includes(p.proxy.trim())));
      if (match && !matchedIds.includes(match.id)) {
        matchedIds.push(match.id);
      }
    });

    if (matchedIds.length > 0) {
      const nowISO = new Date().toISOString();
      matchedIds.forEach(id => {
        const item = AppState.proxies.find(p => p.id === id);
        if (item) {
          item.status = 'used';
          if (!item.used_at) item.used_at = nowISO;
          item.last_copied_at = nowISO;
          item.copy_count = (item.copy_count || 0) + 1;
          AppState.recentlyCopiedIds.add(id);
        }
      });
      updateHeaderStats();
      renderBoxes();
      showToast(`✓ Copied ${matchedIds.length} selected proxy/proxies!`, 'success');

      setTimeout(() => {
        matchedIds.forEach(id => AppState.recentlyCopiedIds.delete(id));
        renderBoxes();
      }, 2000);

      API.copyMultipleProxies(matchedIds).catch(console.warn);
    }
  });
}

// ── Data Fetching ──────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  try {
    const res = await API.getProxies();
    if (res.success && Array.isArray(res.data)) {
      AppState.proxies = res.data;
      updateHeaderStats();
      populateFilterDropdowns();
      renderBoxes();
    } else {
      showToast(res.message || 'Failed to load proxies.', 'error');
    }
  } catch (err) {
    console.error('Error loading proxies:', err);
    showToast('Failed to connect to proxy backend.', 'error');
  } finally {
    showLoading(false);
  }
}

async function refreshData() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('spin-anim');
  await loadData();
  setTimeout(() => {
    if (icon) icon.classList.remove('spin-anim');
  }, 400);
  showToast('Proxies updated.', 'success');
}

// ── Header Stats ───────────────────────────────────────────────
function updateHeaderStats() {
  const activeProxies = AppState.proxies.filter(p => p.status !== 'deleted');
  const total = activeProxies.length;
  const available = activeProxies.filter(p => p.status === 'available').length;
  const used = activeProxies.filter(p => p.status === 'used').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-available').textContent = available;
  document.getElementById('stat-used').textContent = used;
}

// ── Filter Dropdowns ───────────────────────────────────────────
function populateFilterDropdowns() {
  const countrySelect = document.getElementById('filter-country');
  const providerSelect = document.getElementById('filter-provider');

  const countries = new Set();
  const providers = new Set();

  AppState.proxies.forEach(p => {
    if (p.status !== 'deleted') {
      if (p.country) countries.add(p.country.toUpperCase());
      if (p.provider) providers.add(p.provider);
    }
  });

  const curCountry = countrySelect.value;
  countrySelect.innerHTML = '<option value="">All Countries</option>';
  Array.from(countries).sort().forEach(c => {
    const info = getCountry(c);
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `${info.flag} ${info.name} (${c})`;
    if (c === curCountry) opt.selected = true;
    countrySelect.appendChild(opt);
  });

  const curProvider = providerSelect.value;
  providerSelect.innerHTML = '<option value="">All Providers</option>';
  Array.from(providers).sort().forEach(pr => {
    const opt = document.createElement('option');
    opt.value = pr;
    opt.textContent = pr;
    if (pr === curProvider) opt.selected = true;
    providerSelect.appendChild(opt);
  });
}

function applyFilters() {
  AppState.filters.country = document.getElementById('filter-country').value;
  AppState.filters.provider = document.getElementById('filter-provider').value;
  AppState.filters.status = document.getElementById('filter-status').value;

  const hasFilter = AppState.filters.search || AppState.filters.country || AppState.filters.provider || AppState.filters.status;
  document.getElementById('reset-filters-btn').classList.toggle('hidden', !hasFilter);

  renderBoxes();
}

function resetFilters() {
  AppState.filters = { search: '', country: '', provider: '', status: '' };
  document.getElementById('search-input').value = '';
  document.getElementById('filter-country').value = '';
  document.getElementById('filter-provider').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('clear-search-btn').classList.add('hidden');
  document.getElementById('reset-filters-btn').classList.add('hidden');
  renderBoxes();
}

function clearSearch() {
  AppState.filters.search = '';
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search-btn').classList.add('hidden');
  renderBoxes();
}

// ── Render Boxes Grid ──────────────────────────────────────────
function renderBoxes() {
  const container = document.getElementById('boxes-container');
  const emptyState = document.getElementById('empty-state');
  const noMatchState = document.getElementById('no-match-state');

  const activeProxies = AppState.proxies.filter(p => p.status !== 'deleted');

  if (activeProxies.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    noMatchState.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Group by Country + Provider
  const groups = {};
  activeProxies.forEach(p => {
    const country = (p.country || 'OTHER').toUpperCase().trim();
    const provider = (p.provider || 'Other').trim();
    const key = `${country}___${provider}`;

    if (!groups[key]) {
      groups[key] = {
        key,
        country,
        provider,
        proxies: [],
      };
    }
    groups[key].proxies.push(p);
  });

  // Filter groups
  const filteredGroups = [];
  const search = AppState.filters.search;
  const fCountry = AppState.filters.country;
  const fProvider = AppState.filters.provider;
  const fStatus = AppState.filters.status;

  Object.values(groups).forEach(g => {
    if (fCountry && g.country !== fCountry) return;
    if (fProvider && g.provider !== fProvider) return;

    // Filter proxies inside this group
    let matchingProxies = g.proxies;
    if (fStatus) {
      matchingProxies = matchingProxies.filter(p => p.status === fStatus);
    }
    if (search) {
      matchingProxies = matchingProxies.filter(p => {
        return (
          (p.proxy && p.proxy.toLowerCase().includes(search)) ||
          (p.provider && p.provider.toLowerCase().includes(search)) ||
          (p.country && p.country.toLowerCase().includes(search))
        );
      });
    }

    if (matchingProxies.length > 0 || (!search && !fStatus)) {
      filteredGroups.push({
        ...g,
        displayProxies: matchingProxies,
      });
    }
  });

  if (filteredGroups.length === 0) {
    container.innerHTML = '';
    noMatchState.classList.remove('hidden');
    return;
  }
  noMatchState.classList.add('hidden');

  // Sort groups alphabetically by country name, then provider
  filteredGroups.sort((a, b) => {
    const cA = getCountry(a.country).name;
    const cB = getCountry(b.country).name;
    if (cA !== cB) return cA.localeCompare(cB);
    return a.provider.localeCompare(b.provider);
  });

  // Build HTML
  container.innerHTML = filteredGroups.map(g => renderBoxHtml(g)).join('');
}

function renderBoxHtml(group) {
  const { key, country, provider, proxies, displayProxies } = group;
  const cInfo = getCountry(country);

  const totalInBox = proxies.length;
  const availInBox = proxies.filter(p => p.status === 'available').length;
  const usedInBox = proxies.filter(p => p.status === 'used').length;

  const isPasteOpen = AppState.openPasteBoxes.has(key);

  // Check how many selected in this box
  const selectedInThisBox = displayProxies.filter(p => AppState.selectedIds.has(p.id));
  const hasSelection = selectedInThisBox.length > 0;

  // "Select All" is checked when all currently displayed proxies in this box are selected
  const allSelected = displayProxies.length > 0 && displayProxies.every(p => AppState.selectedIds.has(p.id));

  return `
    <div class="proxy-box" id="box-${escapeAttr(key)}">
      <!-- Box Header -->
      <div class="box-header">
        <div class="box-title-group">
          <span class="box-flag">${cInfo.flag}</span>
          <div>
            <div class="box-country">${escapeHtml(cInfo.name)} <span class="box-country-code">(${escapeHtml(country)})</span></div>
            <div class="box-provider-tag">${escapeHtml(provider)}</div>
          </div>
        </div>

        <div class="box-counts">
          <span class="badge-avail" title="${availInBox} Available Proxies">🟢 ${availInBox} Avail</span>
          <span class="badge-used" title="${usedInBox} Used Proxies">🔴 ${usedInBox} Used</span>
        </div>
      </div>

      <!-- Box Action Bar (Bulk Copy, Paste, and Empty Box) -->
      <div class="box-toolbar">
        <div class="box-toolbar-left">
          <button class="btn btn-xs btn-paste-toggle ${isPasteOpen ? 'active' : ''}" onclick="toggleInlinePaste('${escapeAttr(key)}')">
            <span>${isPasteOpen ? '✕ Close Paste' : '➕ Paste Proxies'}</span>
          </button>
          <button class="btn btn-xs btn-empty-box" onclick="emptyEntireBox('${escapeAttr(key)}')" ${totalInBox === 0 ? 'disabled' : ''} title="Clear/Empty all proxies in this box">
            <span>🗑 Empty Box</span>
          </button>
        </div>

        <div class="bulk-copy-group">
          <button class="btn btn-xs btn-copy-bulk" onclick="copyNextInBox('${escapeAttr(country)}', '${escapeAttr(provider)}', 1)" ${availInBox === 0 ? 'disabled' : ''} title="Copy 1 available proxy and mark as used">
            📋 Copy 1
          </button>
          <button class="btn btn-xs btn-copy-bulk" onclick="copyNextInBox('${escapeAttr(country)}', '${escapeAttr(provider)}', 5)" ${availInBox === 0 ? 'disabled' : ''} title="Copy 5 available proxies and mark as used">
            📋 Copy 5
          </button>
          <button class="btn btn-xs btn-copy-bulk" onclick="copyNextInBox('${escapeAttr(country)}', '${escapeAttr(provider)}', 10)" ${availInBox === 0 ? 'disabled' : ''} title="Copy 10 available proxies and mark as used">
            📋 Copy 10
          </button>
          <button class="btn btn-xs btn-copy-bulk btn-copy-all" onclick="copyNextInBox('${escapeAttr(country)}', '${escapeAttr(provider)}', ${availInBox})" ${availInBox === 0 ? 'disabled' : ''} title="Copy all available proxies in this box">
            📋 Copy All (${availInBox})
          </button>
        </div>
      </div>

      <!-- Range Copy Bar (Specify Serial Number Range) -->
      <div class="box-range-bar">
        <span class="range-label">Range Copy:</span>
        <div class="range-inputs-group">
          <span class="range-prefix">#</span>
          <input
            type="number"
            id="range-from-${escapeAttr(key)}"
            class="range-input"
            min="1"
            max="${displayProxies.length || 1}"
            value="1"
            placeholder="1"
          />
          <span class="range-sep">to</span>
          <span class="range-prefix">#</span>
          <input
            type="number"
            id="range-to-${escapeAttr(key)}"
            class="range-input"
            min="1"
            max="${displayProxies.length || 1}"
            value="${Math.min(5, displayProxies.length || 1)}"
            placeholder="${Math.min(5, displayProxies.length || 1)}"
          />
          <button
            class="btn btn-xs btn-range-copy"
            onclick="copyRangeInBox('${escapeAttr(key)}')"
            ${displayProxies.length === 0 ? 'disabled' : ''}
            title="Copy proxies in this serial range and mark as used"
          >
            📋 Copy Range
          </button>
          <button
            class="btn btn-xs btn-range-select"
            onclick="selectRangeInBox('${escapeAttr(key)}')"
            ${displayProxies.length === 0 ? 'disabled' : ''}
            title="Select proxies in this serial range"
          >
            ☑ Select Range
          </button>
        </div>
      </div>

      <!-- Inline Quick Paste Drawer -->
      <div class="inline-paste-drawer ${isPasteOpen ? '' : 'hidden'}" id="paste-drawer-${escapeAttr(key)}">
        <div class="inline-paste-title">
          Paste 5, 10 or more proxies for <strong>${escapeHtml(cInfo.name)} (${escapeHtml(provider)})</strong>:
        </div>
        <textarea
          id="paste-input-${escapeAttr(key)}"
          class="inline-paste-textarea mono"
          placeholder="192.168.1.1:8080:user:pass&#10;192.168.1.2:8080:user:pass"
          rows="4"
          spellcheck="false"
        ></textarea>
        <div class="inline-paste-actions">
          <button class="btn btn-primary btn-xs" onclick="submitInlinePaste('${escapeAttr(country)}', '${escapeAttr(provider)}', '${escapeAttr(key)}')">
            + Add to Box
          </button>
          <button class="btn btn-secondary btn-xs" onclick="toggleInlinePaste('${escapeAttr(key)}')">
            Cancel
          </button>
        </div>
      </div>

      <!-- Multi-select Action Bar (shows when items are checked) -->
      ${hasSelection ? `
        <div class="selection-bar">
          <span class="selection-count">Selected: <strong>${selectedInThisBox.length}</strong></span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-xs btn-primary" onclick="copySelectedInBox('${escapeAttr(key)}')">
              📋 Copy (${selectedInThisBox.length})
            </button>
            <button class="btn btn-xs btn-secondary" onclick="resetSelectedInBox('${escapeAttr(key)}')">
              ↺ Reset (${selectedInThisBox.length})
            </button>
            <button class="btn btn-xs btn-danger-outline" onclick="deleteSelectedInBox('${escapeAttr(key)}')">
              🗑 Delete (${selectedInThisBox.length})
            </button>
            <button class="btn btn-xs btn-ghost" onclick="clearSelectionInBox('${escapeAttr(key)}')">
              ✕
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Select All Header Row (ALWAYS ENABLED when proxies exist) -->
      <div class="box-select-row">
        <label class="select-all-label">
          <input
            type="checkbox"
            class="proxy-checkbox"
            ${allSelected ? 'checked' : ''}
            ${displayProxies.length === 0 ? 'disabled' : ''}
            onchange="toggleSelectAllInBox('${escapeAttr(key)}', this.checked)"
          />
          <span>Select All (${displayProxies.length})</span>
        </label>
        <div class="box-select-actions">
          <button
            class="btn-box-reset-all"
            onclick="resetAllInBox('${escapeAttr(key)}')"
            ${displayProxies.length === 0 ? 'disabled' : ''}
            title="Reset all proxies in this box to Available & 0 copies"
          >
            ↺ Reset All (${displayProxies.length})
          </button>
          <span class="text-xs text-muted">${displayProxies.length} proxies</span>
        </div>
      </div>

      <!-- Unified Box Layout: Single Proxy Box + Outside Options -->
      ${displayProxies.length === 0 ? `
        <div class="box-empty-hint">No proxies matching current filter.</div>
      ` : `
        <div class="box-unified-table">
          <!-- The ONE Unified Proxy Box (No lines in between, clean drag selection) -->
          <div class="proxy-text-pane" id="pane-text-${escapeAttr(key)}" onscroll="syncPaneScroll('${escapeAttr(key)}', 'text')">
            ${displayProxies.map((p, idx) => `
              <div
                class="p-line ${p.status === 'available' ? 'line-avail' : 'line-used'} ${AppState.recentlyCopiedIds.has(p.id) ? 'row-anim-copied' : ''}"
                id="pline-${escapeAttr(p.id)}"
                data-id="${escapeAttr(p.id)}"
                onmouseenter="highlightRow('${escapeAttr(p.id)}', true)"
                onmouseleave="highlightRow('${escapeAttr(p.id)}', false)"
              >
                <span class="p-serial">#${idx + 1}</span>
                <span class="p-status-dot ${p.status === 'available' ? 'dot-avail' : 'dot-used'}" title="${p.status === 'available' ? 'Available' : 'Used'}"></span>
                <span class="p-str mono" title="Click to copy" onclick="copySingleProxy('${escapeAttr(p.id)}')">${escapeHtml(p.proxy)}</span>
              </div>
            `).join('')}
          </div>

          <!-- Options Pane Outside the Box -->
          <div class="proxy-options-pane" id="pane-opts-${escapeAttr(key)}" onscroll="syncPaneScroll('${escapeAttr(key)}', 'opts')">
            ${displayProxies.map((p, idx) => {
              const isSelected = AppState.selectedIds.has(p.id);
              const copyCount = p.copy_count || 0;
              return `
                <div
                  class="p-opts-row"
                  id="popts-${escapeAttr(p.id)}"
                  onmouseenter="highlightRow('${escapeAttr(p.id)}', true)"
                  onmouseleave="highlightRow('${escapeAttr(p.id)}', false)"
                >
                  <input
                    type="checkbox"
                    class="proxy-checkbox"
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleProxySelection('${escapeAttr(p.id)}', this.checked)"
                    title="Select #${idx + 1}"
                  />
                  <span class="meta-copied-count ${copyCount > 0 ? 'highlight' : ''}" title="Total times copied">
                    ${copyCount > 0 ? `Copied ${copyCount}×` : 'Copied 0×'}
                  </span>
                  <div class="proxy-row-btns">
                    <button class="btn-row-action btn-row-copy" onclick="copySingleProxy('${escapeAttr(p.id)}')" title="Copy #${idx + 1} and mark as Used">
                      📋 Copy
                    </button>
                    <button class="btn-row-action btn-row-reset" onclick="resetSingleProxy('${escapeAttr(p.id)}')" title="Reset to Available and 0 copies">
                      ↺
                    </button>
                    <button class="btn-row-action btn-row-del" onclick="deleteSingleProxy('${escapeAttr(p.id)}')" title="Delete this proxy">
                      🗑
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `}
    </div>
  `;
}

// ── Hover Sync & Scroll Sync for Unified Table ─────────────────
function highlightRow(id, isHover) {
  const lineEl = document.getElementById(`pline-${id}`);
  const optsEl = document.getElementById(`popts-${id}`);
  if (lineEl) lineEl.classList.toggle('row-hovered', isHover);
  if (optsEl) optsEl.classList.toggle('row-hovered', isHover);
}

const syncScrollLocks = new Set();
function syncPaneScroll(key, source) {
  if (syncScrollLocks.has(key)) return;
  syncScrollLocks.add(key);

  const textPane = document.getElementById(`pane-text-${key}`);
  const optsPane = document.getElementById(`pane-opts-${key}`);

  if (textPane && optsPane) {
    if (source === 'text') {
      optsPane.scrollTop = textPane.scrollTop;
    } else {
      textPane.scrollTop = optsPane.scrollTop;
    }
  }

  requestAnimationFrame(() => {
    syncScrollLocks.delete(key);
  });
}

// ── Time Formatting ────────────────────────────────────────────
function formatTimeShort(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;

    // Format like: "13:45, 27 Sep"
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ', ' +
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return isoStr;
  }
}

// ── Copy Functionality ─────────────────────────────────────────

/**
 * Copy multiple available proxies from a specific Country + Provider box
 */
async function copyNextInBox(country, provider, count) {
  if (!count || count <= 0) return;

  const activeProxies = AppState.proxies.filter(p =>
    p.status === 'available' &&
    p.country.toUpperCase() === country.toUpperCase() &&
    p.provider === provider
  );

  if (activeProxies.length === 0) {
    showToast('No available proxies left in this box.', 'error');
    return;
  }

  const toCopy = activeProxies.slice(0, count);
  const ids = toCopy.map(p => p.id);
  const strings = toCopy.map(p => p.proxy.trim());

  await executeCopyAndMarkUsed(ids, strings, `${toCopy.length} proxy/proxies`);
}

/**
 * Copy manually selected proxies in a specific box
 */
async function copySelectedInBox(boxKey) {
  const selected = AppState.proxies.filter(p => AppState.selectedIds.has(p.id) && p.status !== 'deleted');
  if (selected.length === 0) {
    showToast('No proxies selected.', 'error');
    return;
  }

  const ids = selected.map(p => p.id);
  const strings = selected.map(p => p.proxy.trim());

  await executeCopyAndMarkUsed(ids, strings, `${selected.length} selected proxy/proxies`);

  // Clear selection
  ids.forEach(id => AppState.selectedIds.delete(id));
  renderBoxes();
}

/**
 * Copy a single proxy by ID
 */
async function copySingleProxy(proxyId) {
  const p = AppState.proxies.find(x => x.id === proxyId);
  if (!p) return;

  await executeCopyAndMarkUsed([p.id], [p.proxy.trim()], '1 proxy');
}

/**
 * Core copy executor: writes newline-separated strings to clipboard & updates backend
 */
async function executeCopyAndMarkUsed(ids, strings, label) {
  const clipText = strings.join('\n');

  try {
    // 1. Instant Clipboard Write (<5ms)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(clipText);
    } else {
      const ta = document.createElement('textarea');
      ta.value = clipText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    // 2. INSTANT Optimistic UI Update (Immediate visual response, 0ms delay!)
    const nowISO = new Date().toISOString();
    ids.forEach(id => {
      const item = AppState.proxies.find(p => p.id === id);
      if (item) {
        item.status = 'used';
        if (!item.used_at) item.used_at = nowISO;
        item.last_copied_at = nowISO;
        item.copy_count = (item.copy_count || 0) + 1;
        AppState.recentlyCopiedIds.add(id);
      }
    });

    updateHeaderStats();
    renderBoxes();

    // Instant toast feedback
    showToast(`✓ Copied ${label} to clipboard!`, 'success');

    // Remove pulse animation after 2s
    setTimeout(() => {
      ids.forEach(id => AppState.recentlyCopiedIds.delete(id));
      renderBoxes();
    }, 2000);

    // 3. Fire backend API in background (Non-blocking: user does not wait!)
    const apiCall = (ids.length === 1)
      ? API.copyProxy(ids[0])
      : API.copyMultipleProxies(ids);

    apiCall.catch(err => {
      console.warn('Background copy sync notice:', err);
    });

  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    showToast('Failed to copy to clipboard. Please grant clipboard permissions.', 'error');
  }
}

// ── Helper: Get Display Proxies for a Box ──────────────────────
function getBoxDisplayProxies(boxKey) {
  const [country, provider] = boxKey.split('___');
  let proxies = AppState.proxies.filter(p =>
    p.status !== 'deleted' &&
    p.country.toUpperCase() === country &&
    p.provider === provider
  );

  if (AppState.filters.status) {
    proxies = proxies.filter(p => p.status === AppState.filters.status);
  }
  const search = AppState.filters.search;
  if (search) {
    proxies = proxies.filter(p =>
      (p.proxy && p.proxy.toLowerCase().includes(search)) ||
      (p.provider && p.provider.toLowerCase().includes(search)) ||
      (p.country && p.country.toLowerCase().includes(search))
    );
  }
  return proxies;
}

// ── Range Copy & Range Select ──────────────────────────────────
/**
 * Copy a serial-number range of proxies (e.g. #1 to #5) from a box
 */
async function copyRangeInBox(boxKey) {
  const list = getBoxDisplayProxies(boxKey);
  if (list.length === 0) {
    showToast('No proxies to copy in this box.', 'error');
    return;
  }

  const fromInput = document.getElementById(`range-from-${boxKey}`);
  const toInput = document.getElementById(`range-to-${boxKey}`);

  let fromVal = parseInt(fromInput ? fromInput.value : '1', 10);
  let toVal = parseInt(toInput ? toInput.value : '1', 10);

  if (isNaN(fromVal) || fromVal < 1) fromVal = 1;
  if (isNaN(toVal) || toVal < 1) toVal = 1;
  if (fromVal > list.length) fromVal = list.length;
  if (toVal > list.length) toVal = list.length;

  if (fromVal > toVal) {
    const tmp = fromVal;
    fromVal = toVal;
    toVal = tmp;
  }

  const slice = list.slice(fromVal - 1, toVal);
  if (slice.length === 0) {
    showToast('Invalid range selected.', 'error');
    return;
  }

  const ids = slice.map(p => p.id);
  const strings = slice.map(p => p.proxy.trim());

  await executeCopyAndMarkUsed(ids, strings, `range #${fromVal}–#${toVal} (${slice.length} proxies)`);
}

/**
 * Select a serial-number range of proxies in a box
 */
function selectRangeInBox(boxKey) {
  const list = getBoxDisplayProxies(boxKey);
  if (list.length === 0) return;

  const fromInput = document.getElementById(`range-from-${boxKey}`);
  const toInput = document.getElementById(`range-to-${boxKey}`);

  let fromVal = parseInt(fromInput ? fromInput.value : '1', 10);
  let toVal = parseInt(toInput ? toInput.value : '1', 10);

  if (isNaN(fromVal) || fromVal < 1) fromVal = 1;
  if (isNaN(toVal) || toVal < 1) toVal = 1;
  if (fromVal > list.length) fromVal = list.length;
  if (toVal > list.length) toVal = list.length;

  if (fromVal > toVal) {
    const tmp = fromVal;
    fromVal = toVal;
    toVal = tmp;
  }

  const slice = list.slice(fromVal - 1, toVal);
  slice.forEach(p => AppState.selectedIds.add(p.id));

  renderBoxes();
  showToast(`Selected range #${fromVal} to #${toVal} (${slice.length} proxies).`, 'info');
}

// ── Reset Handlers (Always Reset Copy Count to 0) ──────────────
async function resetSingleProxy(proxyId) {
  // Optimistically update UI immediately: status=available, copy_count=0
  const item = AppState.proxies.find(p => p.id === proxyId);
  if (item) {
    item.status = 'available';
    item.used_at = '';
    item.last_copied_at = '';
    item.copy_count = 0;
  }
  updateHeaderStats();
  renderBoxes();
  showToast('✓ Proxy reset to Available (0 copies).', 'success');

  // Background sync
  try {
    const res = await API.resetProxy(proxyId);
    if (!res.success) {
      console.warn('Reset background sync warning:', res.message);
    }
  } catch (err) {
    console.warn('Reset background sync error:', err);
  }
}

async function resetSelectedInBox(boxKey) {
  const selected = AppState.proxies.filter(p => AppState.selectedIds.has(p.id) && p.status !== 'deleted');
  if (selected.length === 0) return;

  const ids = selected.map(p => p.id);

  // Optimistically update UI immediately: status=available, copy_count=0
  ids.forEach(id => {
    const item = AppState.proxies.find(p => p.id === id);
    if (item) {
      item.status = 'available';
      item.used_at = '';
      item.last_copied_at = '';
      item.copy_count = 0;
    }
    AppState.selectedIds.delete(id);
  });
  updateHeaderStats();
  renderBoxes();
  showToast(`✓ ${ids.length} proxies reset to Available (0 copies).`, 'success');

  // Background sync
  try {
    await API.resetMultipleProxies(ids);
  } catch (err) {
    console.warn('Reset multiple background sync error:', err);
  }
}

async function resetAllInBox(boxKey) {
  const [country, provider] = boxKey.split('___');
  const inBox = AppState.proxies.filter(p =>
    p.status !== 'deleted' &&
    p.country.toUpperCase() === country &&
    p.provider === provider
  );

  if (inBox.length === 0) return;
  const ids = inBox.map(p => p.id);

  // Optimistically update UI immediately: status=available, copy_count=0
  ids.forEach(id => {
    const item = AppState.proxies.find(p => p.id === id);
    if (item) {
      item.status = 'available';
      item.used_at = '';
      item.last_copied_at = '';
      item.copy_count = 0;
    }
    AppState.selectedIds.delete(id);
  });

  updateHeaderStats();
  renderBoxes();
  showToast(`✓ All ${ids.length} proxies reset to Available (0 copies).`, 'success');

  // Background sync
  try {
    await API.resetMultipleProxies(ids);
  } catch (err) {
    console.warn('Reset all background sync error:', err);
  }
}

// ── Delete & Empty Handlers ────────────────────────────────────
async function deleteSingleProxy(proxyId) {
  if (!confirm('Are you sure you want to delete this proxy?')) return;

  // Optimistically update UI immediately
  AppState.proxies = AppState.proxies.filter(p => p.id !== proxyId);
  AppState.selectedIds.delete(proxyId);
  updateHeaderStats();
  renderBoxes();
  showToast('Proxy deleted.', 'success');

  // Background sync
  try {
    const res = await API.deleteProxy(proxyId);
    if (!res.success) {
      console.warn('Delete background sync warning:', res.message);
    }
  } catch (err) {
    console.warn('Delete background sync error:', err);
  }
}

async function deleteSelectedInBox(boxKey) {
  const selected = AppState.proxies.filter(p => AppState.selectedIds.has(p.id) && p.status !== 'deleted');
  if (selected.length === 0) return;

  if (!confirm(`Are you sure you want to delete ${selected.length} selected proxies?`)) return;

  const ids = selected.map(p => p.id);

  // Optimistically update UI immediately
  AppState.proxies = AppState.proxies.filter(p => !AppState.selectedIds.has(p.id));
  ids.forEach(id => AppState.selectedIds.delete(id));

  updateHeaderStats();
  renderBoxes();
  showToast(`✓ ${ids.length} proxies deleted.`, 'success');

  // Background sync
  try {
    await API.deleteMultipleProxies(ids);
  } catch (err) {
    console.warn('Delete multiple background sync error:', err);
  }
}

async function emptyEntireBox(boxKey) {
  const [country, provider] = boxKey.split('___');
  const inBox = AppState.proxies.filter(p =>
    p.status !== 'deleted' &&
    p.country.toUpperCase() === country &&
    p.provider === provider
  );

  if (inBox.length === 0) {
    showToast('Box is already empty.', 'info');
    return;
  }

  const cInfo = getCountry(country);
  if (!confirm(`Are you sure you want to EMPTY this box?\n\nThis will permanently delete all ${inBox.length} proxies for ${cInfo.name} (${provider}).`)) {
    return;
  }

  const ids = inBox.map(p => p.id);

  // Optimistic UI update
  AppState.proxies = AppState.proxies.filter(p =>
    !(p.country.toUpperCase() === country && p.provider === provider)
  );
  ids.forEach(id => AppState.selectedIds.delete(id));

  updateHeaderStats();
  renderBoxes();
  showToast(`✓ Emptied box (${ids.length} proxies deleted).`, 'success');

  // Background sync
  try {
    await API.deleteMultipleProxies(ids);
  } catch (err) {
    console.warn('Empty box background sync error:', err);
  }
}

// ── Selection Handlers ─────────────────────────────────────────
function toggleProxySelection(proxyId, isChecked) {
  if (isChecked) {
    AppState.selectedIds.add(proxyId);
  } else {
    AppState.selectedIds.delete(proxyId);
  }
  renderBoxes();
}

function toggleSelectAllInBox(boxKey, isChecked) {
  const displayProxies = getBoxDisplayProxies(boxKey);
  displayProxies.forEach(p => {
    if (isChecked) AppState.selectedIds.add(p.id);
    else AppState.selectedIds.delete(p.id);
  });
  renderBoxes();
}

function clearSelectionInBox(boxKey) {
  const displayProxies = getBoxDisplayProxies(boxKey);
  displayProxies.forEach(p => AppState.selectedIds.delete(p.id));
  renderBoxes();
}

// ── Inline Paste Section Handlers ──────────────────────────────
function toggleInlinePaste(boxKey) {
  if (AppState.openPasteBoxes.has(boxKey)) {
    AppState.openPasteBoxes.delete(boxKey);
  } else {
    AppState.openPasteBoxes.add(boxKey);
  }
  renderBoxes();

  // Focus textarea if opened
  if (AppState.openPasteBoxes.has(boxKey)) {
    setTimeout(() => {
      const ta = document.getElementById(`paste-input-${boxKey}`);
      if (ta) ta.focus();
    }, 50);
  }
}

async function submitInlinePaste(country, provider, boxKey) {
  const ta = document.getElementById(`paste-input-${boxKey}`);
  if (!ta) return;

  const raw = ta.value.trim();
  if (!raw) {
    showToast('Please paste at least one proxy line.', 'error');
    return;
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    showToast('No valid lines found.', 'error');
    return;
  }

  try {
    const res = await API.addProxies({ country, provider, proxies: lines });
    if (res.success) {
      ta.value = '';
      AppState.openPasteBoxes.delete(boxKey);
      showToast(`✓ Added ${res.data.added} proxies to ${getCountry(country).name} (${provider})!`, 'success');
      await loadData();
    } else {
      showToast(res.message || 'Failed to add proxies.', 'error');
    }
  } catch (err) {
    console.error('Error adding proxies:', err);
    showToast('Failed to add proxies.', 'error');
  }
}

// ── Add Box Modal Handlers ─────────────────────────────────────
function openAddBoxModal() {
  const modal = document.getElementById('modal-add-box');
  if (modal) {
    modal.classList.remove('hidden');
    document.getElementById('add-proxies-text').value = '';
    updateLineCount();

    // Show user assign dropdown if logged in user is admin
    const assignGroup = document.getElementById('add-user-assign-group');
    if (assignGroup && AppState.currentUser?.role === 'admin') {
      assignGroup.classList.remove('hidden');
      if (AppState.adminUsers && AppState.adminUsers.length > 0) {
        populateUserAssignDropdown(AppState.adminUsers);
      } else {
        // Pre-fetch in background
        API.adminGetUsers().then(res => {
          if (res.success && Array.isArray(res.data)) {
            AppState.adminUsers = res.data;
            populateUserAssignDropdown(res.data);
          }
        });
      }
    } else if (assignGroup) {
      assignGroup.classList.add('hidden');
    }

    document.getElementById('add-country').focus();
  }
}

function updateLineCount() {
  const text = document.getElementById('add-proxies-text').value;
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const counter = document.getElementById('line-counter');
  if (counter) counter.textContent = `${lines.length} line(s) entered`;
}

async function submitAddBox(e) {
  e.preventDefault();

  let country = document.getElementById('add-country').value;
  if (country === 'OTHER') {
    country = document.getElementById('custom-country').value.trim().toUpperCase();
    if (!country) {
      showToast('Please enter a country code.', 'error');
      return;
    }
  }

  let provider = document.getElementById('add-provider').value;
  if (provider === 'CUSTOM') {
    provider = document.getElementById('custom-provider').value.trim();
    if (!provider) {
      showToast('Please enter a provider name.', 'error');
      return;
    }
  }

  const text = document.getElementById('add-proxies-text').value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    showToast('Please paste at least one proxy line.', 'error');
    return;
  }

  const assignGroup = document.getElementById('add-user-assign-group');
  const assignSelect = document.getElementById('add-user-assign');
  const targetUserId = (assignGroup && !assignGroup.classList.contains('hidden') && assignSelect) ? assignSelect.value : '';

  const btn = document.getElementById('submit-add-box-btn');
  const btnText = document.getElementById('submit-add-box-text');
  btn.disabled = true;
  btnText.textContent = 'Adding…';

  const payload = { country, provider, proxies: lines };
  if (targetUserId) payload.userId = targetUserId;

  try {
    const res = await API.addProxies(payload);
    if (res.success) {
      closeModal('modal-add-box');
      showToast(`✓ Added ${res.data.added} proxies! (${res.data.skipped} duplicates skipped)`, 'success');
      await loadData();
      if (AppState.currentUser?.role === 'admin') {
        loadAdminUsers();
      }
    } else {
      showToast(res.message || 'Failed to add proxies.', 'error');
    }
  } catch (err) {
    showToast('Failed to add proxies.', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Add Proxies to Box';
  }
}

// ── Admin: Control Panel & User Management ─────────────────────
async function openAdminModal() {
  const modal = document.getElementById('modal-admin');
  if (!modal) return;
  modal.classList.remove('hidden');
  dismissCredsBanner();
  await loadAdminUsers();
}

async function loadAdminUsers() {
  const refreshIcon = document.getElementById('admin-refresh-icon');
  if (refreshIcon) refreshIcon.style.animation = 'spin 0.8s linear infinite';

  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-secondary);"><div class="spinner" style="margin:0 auto 8px;"></div>Loading user accounts and proxy allocations…</td></tr>';

  try {
    const res = await API.adminGetUsers();
    if (res.success && Array.isArray(res.data)) {
      AppState.adminUsers = res.data;
      updateAdminStats(res.data);
      populateUserAssignDropdown(res.data);
      renderAdminUsersTable();
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--red); padding:18px;">${escapeHtml(res.message || 'Error loading users.')}</td></tr>`;
    }
  } catch (err) {
    console.error('Error fetching admin users:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--red); padding:18px;">Failed to load user accounts.</td></tr>';
  } finally {
    if (refreshIcon) refreshIcon.style.animation = '';
  }
}

function updateAdminStats(users) {
  const userCount = users.length;
  let totalProxies = 0;
  let availProxies = 0;
  let usedProxies = 0;

  users.forEach(u => {
    totalProxies += (u.total_proxies || 0);
    availProxies += (u.available_proxies || 0);
    usedProxies += (u.used_proxies || 0);
  });

  const uEl = document.getElementById('admin-stat-users');
  const tEl = document.getElementById('admin-stat-total-proxies');
  const aEl = document.getElementById('admin-stat-avail-proxies');
  const usEl = document.getElementById('admin-stat-used-proxies');

  if (uEl) uEl.textContent = userCount;
  if (tEl) tEl.textContent = totalProxies;
  if (aEl) aEl.textContent = availProxies;
  if (usEl) usEl.textContent = usedProxies;
}

function populateUserAssignDropdown(users) {
  const select = document.getElementById('add-user-assign');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">Myself (Admin)</option>';
  users.forEach(u => {
    if (u.id !== AppState.currentUser?.user_id) {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.username} (${u.display_name || u.role}) — ${u.total_proxies || 0} proxies`;
      select.appendChild(opt);
    }
  });
  if (currentVal) select.value = currentVal;
}

function filterAdminUserList() {
  const query = (document.getElementById('admin-search-users')?.value || '').trim().toLowerCase();
  renderAdminUsersTable(query);
}

function renderAdminUsersTable(searchFilter = '') {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  let list = AppState.adminUsers || [];
  if (searchFilter) {
    list = list.filter(u =>
      u.username.toLowerCase().includes(searchFilter) ||
      (u.display_name && u.display_name.toLowerCase().includes(searchFilter)) ||
      u.role.toLowerCase().includes(searchFilter)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No users match your search.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(u => {
    const isActive = u.active === 'TRUE' || u.active === true;
    const initial = (u.username || 'U').charAt(0).toUpperCase();
    const isSelf = AppState.currentUser && (u.id === AppState.currentUser.user_id || u.username === AppState.currentUser.username);

    const total = u.total_proxies || 0;
    const avail = u.available_proxies || 0;
    const used = u.used_proxies || 0;

    return `
      <tr>
        <td>
          <div class="user-identity">
            <div class="user-avatar-circle">${escapeHtml(initial)}</div>
            <div class="user-names-group">
              <span class="user-uname">${escapeHtml(u.username)} ${isSelf ? '<span class="text-xs text-muted">(You)</span>' : ''}</span>
              <span class="user-dname">${escapeHtml(u.display_name || 'No display name')}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-neutral'}">${escapeHtml(u.role)}</span>
        </td>
        <td>
          <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}">
            ${isActive ? '🟢 Active' : '🔴 Disabled'}
          </span>
        </td>
        <td>
          <div class="proxy-stats-group" title="Total: ${total} | Available: ${avail} | Used: ${used}">
            <span class="proxy-pill pill-total" title="Total Proxies">Total: ${total}</span>
            <span class="proxy-pill pill-avail" title="Available Proxies">🟢 ${avail}</span>
            <span class="proxy-pill pill-used" title="Used Proxies">🔴 ${used}</span>
          </div>
        </td>
        <td style="text-align:right;">
          <div class="table-action-btns">
            <button class="btn-tbl-action btn-pass" onclick="openChangePasswordModal('${escapeAttr(u.id)}', '${escapeAttr(u.username)}')" title="Change or Reset Password">
              🔑 Set Pass
            </button>
            <button class="btn-tbl-action btn-add-for-user" onclick="adminAssignProxiesToUser('${escapeAttr(u.id)}', '${escapeAttr(u.username)}')" title="Add proxies directly for this user">
              ➕ Add Proxies
            </button>
            ${!isSelf ? `
              <button class="btn-tbl-action ${isActive ? 'btn-toggle-deact' : 'btn-toggle-act'}" onclick="toggleAdminUserStatus('${escapeAttr(u.id)}', ${isActive})" title="${isActive ? 'Disable user access' : 'Activate user'}">
                ${isActive ? '⛔ Disable' : '✓ Enable'}
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Auto-Generate Password Helper ──────────────────────────────
function autoGeneratePassword(targetInputId) {
  const prefixes = ['Inexra', 'Proxy', 'Node', 'Secure', 'Host'];
  const symbols = ['#', '!', '$', '@', '&'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const generated = `${prefix}${symbol}${num}`;

  const el = document.getElementById(targetInputId);
  if (el) {
    el.value = generated;
    el.type = 'text';
    el.focus();
    el.select();
    showToast(`🎲 Generated password: ${generated}`, 'info');
  }
}

function togglePassVisibility(inputId, btnEl) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === 'password') {
    el.type = 'text';
    if (btnEl) btnEl.textContent = '🙈';
  } else {
    el.type = 'password';
    if (btnEl) btnEl.textContent = '👁';
  }
}

// ── Submit Create New User ──────────────────────────────────────
async function submitAdminCreateUser(e) {
  e.preventDefault();

  const username = document.getElementById('new-username').value.trim();
  const displayName = document.getElementById('new-display-name').value.trim();
  const role = document.getElementById('new-role').value;
  const password = document.getElementById('new-password').value;

  if (!username || username.length < 3) {
    showToast('Username must be at least 3 characters.', 'error');
    return;
  }
  if (!password || password.length < 4) {
    showToast('Password must be at least 4 characters.', 'error');
    return;
  }

  const btn = document.getElementById('btn-create-user-submit');
  const btnText = document.getElementById('btn-create-user-text');
  btn.disabled = true;
  btnText.textContent = 'Creating…';

  try {
    const res = await API.adminCreateUser({
      username,
      display_name: displayName,
      role,
      password
    });

    if (res.success) {
      // Save credentials for instant copying
      AppState.createdUserCreds = {
        username,
        password,
        role,
        displayName: displayName || username
      };

      // Show banner
      document.getElementById('created-cred-username').textContent = username;
      document.getElementById('created-cred-password').textContent = password;
      const roleBadge = document.getElementById('created-cred-role');
      roleBadge.textContent = role === 'admin' ? 'Administrator' : 'Standard User';
      roleBadge.className = `badge ${role === 'admin' ? 'badge-primary' : 'badge-neutral'}`;

      const banner = document.getElementById('new-creds-banner');
      if (banner) banner.classList.remove('hidden');

      // Reset form fields
      document.getElementById('new-username').value = '';
      document.getElementById('new-display-name').value = '';
      document.getElementById('new-password').value = '';

      showToast(`✓ User account @${username} created successfully!`, 'success');
      await loadAdminUsers();
    } else {
      showToast(res.message || 'Failed to create user.', 'error');
    }
  } catch (err) {
    console.error('Error creating user:', err);
    showToast(err.message || 'Failed to create user account.', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = '➕ Create Account';
  }
}

function copyCreatedCredentials() {
  if (!AppState.createdUserCreds) return;
  const { username, password, role } = AppState.createdUserCreds;
  const appUrl = window.location.origin + window.location.pathname.replace(/\/dashboard\.html$/, '/');

  const text = [
    `🔐 Proxy Collector for Inexra — Account Credentials`,
    `----------------------------------------------------`,
    `• Username : ${username}`,
    `• Password : ${password}`,
    `• Role     : ${role}`,
    `• App URL  : ${appUrl}`,
    `----------------------------------------------------`
  ].join('\n');

  copyTextToClipboard(text, `Login credentials for @${username} copied!`);
}

function dismissCredsBanner() {
  const banner = document.getElementById('new-creds-banner');
  if (banner) banner.classList.add('hidden');
  AppState.createdUserCreds = null;
}

// ── Change Password Modal Handlers ─────────────────────────────
function openChangePasswordModal(userId, username) {
  const modal = document.getElementById('modal-change-pass');
  if (!modal) return;

  document.getElementById('change-pass-user-id').value = userId;
  document.getElementById('change-pass-username-hidden').value = username;
  document.getElementById('change-pass-subtitle').textContent = `Update credentials for @${username}`;

  // Suggest a fresh password
  autoGeneratePassword('change-pass-input');

  modal.classList.remove('hidden');
}

async function submitAdminChangePassword(e) {
  e.preventDefault();

  const userId = document.getElementById('change-pass-user-id').value;
  const username = document.getElementById('change-pass-username-hidden').value;
  const password = document.getElementById('change-pass-input').value;

  if (!password || password.length < 4) {
    showToast('Password must be at least 4 characters.', 'error');
    return;
  }

  const btn = document.getElementById('btn-change-pass-submit');
  const btnText = document.getElementById('btn-change-pass-text');
  btn.disabled = true;
  btnText.textContent = 'Saving…';

  try {
    const res = await API.adminChangePassword({ userId, password });
    if (res.success) {
      closeModal('modal-change-pass');

      // Copy new credentials to clipboard automatically
      const appUrl = window.location.origin + window.location.pathname.replace(/\/dashboard\.html$/, '/');
      const credText = [
        `🔑 Updated Password for Proxy Collector`,
        `• Username : ${username}`,
        `• Password : ${password}`,
        `• App URL  : ${appUrl}`
      ].join('\n');

      await copyTextToClipboard(credText, `Password for @${username} updated & copied to clipboard!`);
      showToast(`✓ Password for @${username} changed successfully!`, 'success');
      await loadAdminUsers();
    } else {
      showToast(res.message || 'Failed to update password.', 'error');
    }
  } catch (err) {
    console.error('Error changing password:', err);
    showToast('Failed to update password.', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Save New Password';
  }
}

// ── Toggle User Active / Inactive ──────────────────────────────
async function toggleAdminUserStatus(userId, currentActive) {
  const targetUser = AppState.adminUsers.find(u => u.id === userId);
  const name = targetUser ? targetUser.username : 'this user';
  const newActive = !currentActive;

  try {
    const res = await API.adminToggleUser({ userId, active: newActive });
    if (res.success) {
      showToast(`✓ Account for @${name} ${newActive ? 'activated' : 'disabled'}.`, 'success');
      await loadAdminUsers();
    } else {
      showToast(res.message || 'Failed to update status.', 'error');
    }
  } catch (err) {
    console.error('Error toggling user:', err);
    showToast('Failed to toggle user status.', 'error');
  }
}

// ── Admin Assign Proxies To User ───────────────────────────────
function adminAssignProxiesToUser(userId, username) {
  closeModal('modal-admin');
  openAddBoxModal();

  const group = document.getElementById('add-user-assign-group');
  const select = document.getElementById('add-user-assign');
  if (group) group.classList.remove('hidden');
  if (select) select.value = userId;

  showToast(`Assigning proxies to @${username}. Now select country, provider, and paste proxies.`, 'info');
}

// ── Clipboard Copy Helper ──────────────────────────────────────
async function copyTextToClipboard(text, successToastMsg) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (successToastMsg) showToast(successToastMsg, 'success');
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

// ── Modal Utilities ────────────────────────────────────────────
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('hidden');
}

function handleModalOverlayClick(e, id) {
  if (e.target.id === id) closeModal(id);
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// ── Helpers ────────────────────────────────────────────────────
function showLoading(show) {
  const el = document.getElementById('loading-state');
  if (el) el.classList.toggle('hidden', !show);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
