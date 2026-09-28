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

  // Has available proxies
  const availProxies = displayProxies.filter(p => p.status === 'available');
  const allAvailSelected = availProxies.length > 0 && availProxies.every(p => AppState.selectedIds.has(p.id));

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

      <!-- Box Action Bar (Bulk Copy & Paste) -->
      <div class="box-toolbar">
        <button class="btn btn-xs btn-paste-toggle ${isPasteOpen ? 'active' : ''}" onclick="toggleInlinePaste('${escapeAttr(key)}')">
          <span>${isPasteOpen ? '✕ Close Paste' : '➕ Paste Proxies'}</span>
        </button>

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
              📋 Copy Selected (${selectedInThisBox.length})
            </button>
            <button class="btn btn-xs btn-secondary" onclick="resetSelectedInBox('${escapeAttr(key)}')">
              ↺ Reset
            </button>
            <button class="btn btn-xs btn-ghost" onclick="clearSelectionInBox('${escapeAttr(key)}')">
              ✕
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Select All Header Row -->
      <div class="box-select-row">
        <label class="select-all-label">
          <input
            type="checkbox"
            class="proxy-checkbox"
            ${allAvailSelected ? 'checked' : ''}
            ${availProxies.length === 0 ? 'disabled' : ''}
            onchange="toggleSelectAllAvailInBox('${escapeAttr(key)}', this.checked)"
          />
          <span>Select all available (${availProxies.length})</span>
        </label>
        <span class="text-xs text-muted">${displayProxies.length} proxies showing</span>
      </div>

      <!-- Proxy List Rows -->
      <div class="box-list">
        ${displayProxies.length === 0 ? `
          <div class="box-empty-hint">No proxies matching current filter.</div>
        ` : displayProxies.map(p => renderProxyRowHtml(p)).join('')}
      </div>
    </div>
  `;
}

function renderProxyRowHtml(p) {
  const isAvailable = p.status === 'available';
  const isSelected = AppState.selectedIds.has(p.id);
  const isRecent = AppState.recentlyCopiedIds.has(p.id);

  // Formatted date
  const usedTimeFormatted = p.used_at ? formatTimeShort(p.used_at) : '';
  const copyCount = p.copy_count || 0;

  return `
    <div class="proxy-row ${isAvailable ? 'row-avail' : 'row-used'} ${isRecent ? 'row-anim-copied' : ''}" id="prow-${escapeAttr(p.id)}">
      <!-- Left: Checkbox + Status dot + Proxy String -->
      <div class="proxy-row-left">
        <input
          type="checkbox"
          class="proxy-checkbox"
          ${isSelected ? 'checked' : ''}
          onchange="toggleProxySelection('${escapeAttr(p.id)}', this.checked)"
          title="Select proxy"
        />

        <span class="status-indicator ${isAvailable ? 'status-avail' : 'status-used'}" title="${isAvailable ? 'Available' : 'Used'}">
          ${isAvailable ? '🟢 Avail' : '🔴 Used'}
        </span>

        <span class="proxy-string mono" title="Click to copy" onclick="copySingleProxy('${escapeAttr(p.id)}')">
          ${escapeHtml(p.proxy)}
        </span>
      </div>

      <!-- Right: Copied Count + Used Time right in front of proxy + Action buttons -->
      <div class="proxy-row-right">
        <div class="proxy-meta-info">
          <span class="meta-copied-count ${copyCount > 0 ? 'highlight' : ''}" title="Total times copied">
            ${copyCount > 0 ? `Copied ${copyCount}×` : 'Never copied'}
          </span>
          ${usedTimeFormatted ? `
            <span class="meta-used-time" title="Last used timestamp: ${escapeAttr(p.used_at)}">
              Used: ${usedTimeFormatted}
            </span>
          ` : `
            <span class="meta-used-time text-muted">—</span>
          `}
        </div>

        <div class="proxy-row-btns">
          <button class="btn-row-action btn-row-copy" onclick="copySingleProxy('${escapeAttr(p.id)}')" title="Copy proxy and mark as Used">
            📋 Copy
          </button>
          <button class="btn-row-action btn-row-reset" onclick="resetSingleProxy('${escapeAttr(p.id)}')" title="Reset status to Available">
            ↺
          </button>
          <button class="btn-row-action btn-row-del" onclick="deleteSingleProxy('${escapeAttr(p.id)}')" title="Delete this proxy">
            🗑
          </button>
        </div>
      </div>
    </div>
  `;
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(clipText);
    } else {
      // Fallback for non-https or older browser context
      const ta = document.createElement('textarea');
      ta.value = clipText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    // Call API to mark as used
    if (ids.length === 1) {
      await API.copyProxy(ids[0]);
    } else {
      await API.copyMultipleProxies(ids);
    }

    // Optimistically update local state so UI updates instantly
    const nowISO = new Date().toISOString();
    ids.forEach(id => {
      const item = AppState.proxies.find(p => p.id === id);
      if (item) {
        item.status = 'used';
        item.used_at = nowISO;
        item.last_copied_at = nowISO;
        item.copy_count = (item.copy_count || 0) + 1;
        AppState.recentlyCopiedIds.add(id);
      }
    });

    updateHeaderStats();
    renderBoxes();

    // Pulse animation clear after 2 seconds
    setTimeout(() => {
      ids.forEach(id => AppState.recentlyCopiedIds.delete(id));
      renderBoxes();
    }, 2500);

    showToast(`✓ Copied ${label} to clipboard and marked as Used!`, 'success');

  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    showToast('Failed to copy to clipboard. Please grant clipboard permissions.', 'error');
  }
}

// ── Reset & Delete Handlers ────────────────────────────────────
async function resetSingleProxy(proxyId) {
  try {
    const res = await API.resetProxy(proxyId);
    if (res.success) {
      const item = AppState.proxies.find(p => p.id === proxyId);
      if (item) {
        item.status = 'available';
        item.used_at = '';
      }
      updateHeaderStats();
      renderBoxes();
      showToast('Proxy reset to Available.', 'success');
    } else {
      showToast(res.message || 'Failed to reset proxy.', 'error');
    }
  } catch (err) {
    console.error('Reset error:', err);
    showToast('Failed to reset proxy.', 'error');
  }
}

async function resetSelectedInBox(boxKey) {
  const selected = AppState.proxies.filter(p => AppState.selectedIds.has(p.id) && p.status !== 'deleted');
  if (selected.length === 0) return;

  const ids = selected.map(p => p.id);
  try {
    await API.resetMultipleProxies(ids);
    ids.forEach(id => {
      const item = AppState.proxies.find(p => p.id === id);
      if (item) {
        item.status = 'available';
        item.used_at = '';
      }
      AppState.selectedIds.delete(id);
    });
    updateHeaderStats();
    renderBoxes();
    showToast(`✓ ${ids.length} proxies reset to Available.`, 'success');
  } catch (err) {
    showToast('Failed to reset selected proxies.', 'error');
  }
}

async function deleteSingleProxy(proxyId) {
  if (!confirm('Are you sure you want to delete this proxy?')) return;

  try {
    const res = await API.deleteProxy(proxyId);
    if (res.success) {
      AppState.proxies = AppState.proxies.filter(p => p.id !== proxyId);
      AppState.selectedIds.delete(proxyId);
      updateHeaderStats();
      renderBoxes();
      showToast('Proxy deleted.', 'success');
    } else {
      showToast(res.message || 'Failed to delete proxy.', 'error');
    }
  } catch (err) {
    showToast('Failed to delete proxy.', 'error');
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

function toggleSelectAllAvailInBox(boxKey, isChecked) {
  const [country, provider] = boxKey.split('___');
  const avail = AppState.proxies.filter(p =>
    p.status === 'available' &&
    p.country.toUpperCase() === country &&
    p.provider === provider
  );

  avail.forEach(p => {
    if (isChecked) AppState.selectedIds.add(p.id);
    else AppState.selectedIds.delete(p.id);
  });
  renderBoxes();
}

function clearSelectionInBox(boxKey) {
  const [country, provider] = boxKey.split('___');
  const inBox = AppState.proxies.filter(p =>
    p.country.toUpperCase() === country &&
    p.provider === provider
  );
  inBox.forEach(p => AppState.selectedIds.delete(p.id));
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

  const btn = document.getElementById('submit-add-box-btn');
  const btnText = document.getElementById('submit-add-box-text');
  btn.disabled = true;
  btnText.textContent = 'Adding…';

  try {
    const res = await API.addProxies({ country, provider, proxies: lines });
    if (res.success) {
      closeModal('modal-add-box');
      showToast(`✓ Added ${res.data.added} proxies! (${res.data.skipped} duplicates skipped)`, 'success');
      await loadData();
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

// ── Admin: Users Modal ─────────────────────────────────────────
async function openUsersModal() {
  const modal = document.getElementById('modal-users');
  if (!modal) return;
  modal.classList.remove('hidden');

  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:16px;">Loading users…</td></tr>';

  try {
    const res = await API.adminGetUsers();
    if (res.success && Array.isArray(res.data)) {
      tbody.innerHTML = res.data.map(u => `
        <tr>
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.display_name || '—')}</td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-neutral'}">${escapeHtml(u.role)}</span></td>
          <td><span class="badge ${u.active === 'TRUE' ? 'badge-success' : 'badge-danger'}">${u.active === 'TRUE' ? 'Active' : 'Inactive'}</span></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--red); padding:16px;">${escapeHtml(res.message || 'Error')}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--red); padding:16px;">Failed to load users.</td></tr>';
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
