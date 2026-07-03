// ContextFlow — Popup Script v1.1.0
// Complete rewrite with: duplicate, version history, color picker,
// word count, sort, badge, storage-change auto-refresh, all bugs fixed

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let allCapsules    = [];
let currentFilter  = 'all';
let currentSort    = 'updated';
let searchQuery    = '';
let currentEditId  = null;
let editTags       = [];
let settings       = {};

const SWATCHES = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#F59E0B','#10B981','#06B6D4','#3B82F6'];

// ─── DOM ─────────────────────────────────────────────────────────────────────

const views        = { list:'view-list', edit:'view-edit', settings:'view-settings' };
const capsuleList  = () => document.getElementById('capsule-list');
const emptyState   = () => document.getElementById('empty-state');
const footerCount  = () => document.getElementById('footer-count');
const searchBar    = () => document.getElementById('search-bar');
const searchInput  = () => document.getElementById('search-input');
const toast        = () => document.getElementById('popup-toast');

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadCapsules();
  buildColorSwatches();
  bindAllEvents();
  setupStorageListener();
});

// ─── Storage Change Listener — keeps popup in sync ───────────────────────────

function setupStorageListener() {
  // Refresh list automatically if storage changes while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.capsules) {
      allCapsules = changes.capsules.newValue || [];
      applyFiltersAndSort();
      updateFooter();
    }
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, res => {
      if (res?.success) {
        settings = res.settings || {};
        applySettingsToUI();
        if (res.stats) updateAboutStats(res.stats);
      }
      resolve();
    });
  });
}

function applySettingsToUI() {
  safeCheck('setting-show-capture', settings.showCaptureButton !== false);
  safeCheck('setting-confirm-delete', settings.confirmDelete !== false);
  safeCheck('setting-auto-tag', settings.autoTagPlatform !== false);
  safeCheck('setting-badge', settings.showBadge !== false);
}

function saveSettings() {
  const s = {
    showCaptureButton: gChecked('setting-show-capture'),
    confirmDelete:     gChecked('setting-confirm-delete'),
    autoTagPlatform:   gChecked('setting-auto-tag'),
    showBadge:         gChecked('setting-badge'),
  };
  chrome.runtime.sendMessage({ action: 'updateSettings', settings: s }, () => {
    settings = { ...settings, ...s };
    showToast('✅ Settings saved');
  });
}

// ─── Load capsules ────────────────────────────────────────────────────────────

async function loadCapsules() {
  showLoading();
  chrome.runtime.sendMessage({ action: 'getCapsules' }, res => {
    if (res?.success) {
      allCapsules = res.capsules || [];
      applyFiltersAndSort();
      updateFooter();
    } else {
      showToast('Failed to load capsules', 'error');
    }
  });
}

// ─── Filter + Sort ────────────────────────────────────────────────────────────

function applyFiltersAndSort() {
  let result = [...allCapsules];

  // Filter by platform/tag
  if (currentFilter !== 'all') {
    result = result.filter(c =>
      c.platform === currentFilter ||
      (c.tags || []).includes(currentFilter.toLowerCase())
    );
  }

  // Filter by search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(c =>
      c.title?.toLowerCase().includes(q) ||
      c.content?.toLowerCase().includes(q) ||
      c.summary?.toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q)) ||
      c.platform?.toLowerCase().includes(q)
    );
  }

  // Sort
  switch (currentSort) {
    case 'created': result.sort((a,b) => (a.createdAt||0) - (b.createdAt||0)); break;
    case 'alpha':   result.sort((a,b) => (a.title||'').localeCompare(b.title||'')); break;
    case 'platform':result.sort((a,b) => (a.platform||'').localeCompare(b.platform||'')); break;
    default:        result.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  }

  // Pinned always on top
  result.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));

  renderCapsules(result);
}

// ─── Render capsule list ──────────────────────────────────────────────────────

function renderCapsules(list) {
  const el = capsuleList();
  el.querySelectorAll('.cf-card,.cf-no-results,.cf-loading').forEach(n => n.remove());

  if (allCapsules.length === 0) { emptyState().style.display = 'flex'; return; }
  emptyState().style.display = 'none';

  if (list.length === 0) {
    const m = document.createElement('div');
    m.className = 'cf-no-results';
    m.textContent = searchQuery ? `No results for "${searchQuery}"` : `No "${currentFilter}" capsules`;
    el.appendChild(m);
    return;
  }

  list.forEach(c => el.appendChild(createCard(c)));
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function createCard(c) {
  const card = document.createElement('div');
  card.className = 'cf-card' + (c.pinned ? ' pinned' : '');
  card.dataset.id = c.id;

  const color  = c.color || '#6366F1';
  const age    = formatAge(c.updatedAt || c.createdAt);
  const tags   = c.tags || [];
  const words  = wordCount(c.content || '');
  const hasVer = (c.version || 1) > 1;

  let title   = esc(c.title || 'Untitled');
  let summary = esc(c.summary || (c.content||'').slice(0,130));
  if (searchQuery) { title = hl(title, searchQuery); summary = hl(summary, searchQuery); }

  card.innerHTML = `
    <div class="cf-card-header">
      <div class="cf-card-dot" style="background:${color}"></div>
      <div class="cf-card-title">${title}</div>
      ${c.pinned ? '<span title="Pinned" style="flex-shrink:0">📌</span>' : ''}
    </div>
    <div class="cf-card-meta">
      ${c.platform ? `<span class="cf-platform-tag">${esc(c.platform)}</span>` : ''}
      <span class="cf-card-time">${age}</span>
      ${hasVer ? `<span class="cf-card-version">v${c.version}</span>` : ''}
      <span class="cf-word-count">${words}w</span>
    </div>
    ${summary ? `<div class="cf-card-summary">${summary}</div>` : ''}
    ${tags.length ? `<div class="cf-card-tags">${tags.map(t=>`<span class="cf-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="cf-card-actions">
      <button class="cf-action-btn primary-action" data-a="inject">⚡ Inject</button>
      <button class="cf-action-btn" data-a="copy">📋 Copy</button>
      <button class="cf-action-btn" data-a="edit">✏️ Edit</button>
      <button class="cf-action-btn" data-a="duplicate" title="Duplicate capsule">⧉</button>
      <button class="cf-action-btn" data-a="pin">${c.pinned ? '📍 Unpin' : '📌 Pin'}</button>
      <button class="cf-action-btn danger-action" data-a="delete">🗑️</button>
    </div>
  `;

  card.querySelectorAll('[data-a]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); handleAction(btn.dataset.a, c); })
  );

  return card;
}

// ─── Card Actions ─────────────────────────────────────────────────────────────

function handleAction(action, c) {
  switch (action) {

    case 'inject':
      chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
        if (!tabs[0]) { showToast('No active tab', 'warning'); return; }
        chrome.runtime.sendMessage({ action:'injectCapsule', content:c.content, tabId:tabs[0].id }, res => {
          if (res?.success) {
            showToast('⚡ Injected!');
            chrome.runtime.sendMessage({ action:'trackStat', stat:'totalInjected' });
          } else {
            copyText(c.content || '').then(() => showToast('📋 Copied to clipboard — paste with Ctrl+V'));
          }
        });
      });
      break;

    case 'copy':
      copyText(c.content || '').then(() => {
        showToast('📋 Copied to clipboard!');
        chrome.runtime.sendMessage({ action:'trackStat', stat:'totalInjected' });
      });
      break;

    case 'edit':
      openEditView(c);
      break;

    case 'duplicate':
      chrome.runtime.sendMessage({ action:'duplicateCapsule', id:c.id }, res => {
        if (res?.success) {
          allCapsules.unshift(res.capsule);
          applyFiltersAndSort();
          updateFooter();
          showToast('⧉ Duplicated!');
        }
      });
      break;

    case 'pin': {
      const updated = { ...c, pinned: !c.pinned };
      chrome.runtime.sendMessage({ action:'updateCapsule', capsule:updated }, res => {
        if (res?.success) {
          const i = allCapsules.findIndex(x => x.id === c.id);
          if (i !== -1) allCapsules[i] = res.capsule;
          applyFiltersAndSort();
          showToast(updated.pinned ? '📌 Pinned' : '📍 Unpinned');
        }
      });
      break;
    }

    case 'delete':
      if (settings.confirmDelete !== false) {
        if (!confirm(`Delete "${c.title || 'this capsule'}"?\nThis cannot be undone.`)) return;
      }
      chrome.runtime.sendMessage({ action:'deleteCapsule', id:c.id }, res => {
        if (res?.success) {
          allCapsules = allCapsules.filter(x => x.id !== c.id);
          applyFiltersAndSort();
          updateFooter();
          showToast('🗑️ Deleted');
        }
      });
      break;
  }
}

// ─── Edit View ────────────────────────────────────────────────────────────────

function openEditView(c = null) {
  currentEditId = c?.id || null;
  editTags      = c ? [...(c.tags||[])] : [];

  gid('edit-view-title').textContent  = c ? 'Edit Capsule' : 'New Capsule';
  gid('edit-id').value                = c?.id || '';
  gid('edit-title').value             = c?.title || '';
  gid('edit-content').value           = c?.content || '';
  gid('edit-platform').value          = c?.platform || 'Web';
  gid('edit-color').value             = c?.color || '#6366F1';

  // Version badge
  const badge = gid('edit-version-badge');
  if (c && (c.version||1) > 1) {
    badge.textContent = `v${c.version}`; badge.style.display = 'inline';
  } else { badge.style.display = 'none'; }

  // Active swatch
  document.querySelectorAll('.cf-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === (c?.color || '#6366F1'));
  });

  // Version history
  const vhSection = gid('version-history-section');
  const vhList    = gid('version-list');
  if (c && c.versions?.length) {
    vhSection.style.display = 'block';
    vhList.innerHTML = '';
    [...c.versions].reverse().forEach(v => {
      const item = document.createElement('div');
      item.className = 'cf-version-item';
      item.innerHTML = `
        <span class="cf-version-num">v${v.version}</span>
        <span class="cf-version-meta">${formatAge(v.updatedAt)} · ${wordCount(v.content||'')}w</span>
        <button class="cf-version-restore" data-content="${esc(v.content||'')}" data-title="${esc(v.title||'')}">Restore</button>
      `;
      item.querySelector('.cf-version-restore').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (!confirm('Restore this version? Current content will be replaced.')) return;
        gid('edit-content').value = btn.dataset.content;
        gid('edit-title').value   = btn.dataset.title;
        updateContentStats();
        updateCharCount();
        showToast('↩ Version restored — click Save to confirm');
      });
      vhList.appendChild(item);
    });
  } else {
    vhSection.style.display = 'none';
  }

  updateTagsPreview();
  updateCharCount();
  updateContentStats();
  showView('edit');

  // Auto-detect platform if creating new
  if (!c) {
    chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
      if (tabs[0]) {
        detectPlatform(tabs[0].url);
        if (!gid('edit-title').value) gid('edit-title').value = tabs[0].title?.slice(0,80)||'';
      }
    });
  }

  setTimeout(() => gid('edit-title').focus(), 80);
}

function detectPlatform(url) {
  const MAP = {
    'chatgpt.com':'ChatGPT','openai.com':'ChatGPT','claude.ai':'Claude',
    'gemini.google.com':'Gemini','deepseek.com':'DeepSeek','grok.com':'Grok',
    'perplexity.ai':'Perplexity','copilot.microsoft.com':'Copilot',
    'mistral.ai':'Mistral','poe.com':'Poe','character.ai':'Character.AI',
    'v0.dev':'v0','bolt.new':'Bolt','lovable.dev':'Lovable'
  };
  try {
    const h = new URL(url).hostname;
    for (const [k,v] of Object.entries(MAP)) {
      if (h.includes(k)) { gid('edit-platform').value = v; return; }
    }
  } catch {}
}

function updateTagsPreview() {
  const prev = gid('tags-preview');
  prev.innerHTML = editTags.map((t,i) => `
    <span class="cf-tag-item">#${esc(t)}<button data-i="${i}">×</button></span>
  `).join('');
  prev.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { editTags.splice(+b.dataset.i, 1); updateTagsPreview(); })
  );
}

function updateCharCount() {
  const val = gid('edit-title').value;
  const el = gid('title-count');
  el.textContent = `${val.length} / 120`;
  el.style.color = val.length > 100 ? 'var(--warning)' : 'var(--text-dim)';
}

function updateContentStats() {
  const text = gid('edit-content').value;
  const wc   = wordCount(text);
  const cc   = text.length;
  const kb   = cc > 1024 ? `${(cc/1024).toFixed(1)} KB` : `${cc} chars`;
  gid('content-stats').textContent = `${wc} words · ${kb}`;
}

function saveCapsule() {
  const title   = gid('edit-title').value.trim();
  const content = gid('edit-content').value.trim();
  const platform = gid('edit-platform').value;
  const color   = gid('edit-color').value;

  if (!title)   { showToast('⚠️ Title is required', 'warning');   gid('edit-title').focus();   return; }
  if (!content) { showToast('⚠️ Content is required', 'warning'); gid('edit-content').focus(); return; }

  const capsule = { id:currentEditId, title, content,
    summary: content.slice(0,140).replace(/\n+/g,' '),
    tags: editTags, platform, color };

  const btn = gid('btn-save-capsule');
  btn.disabled = true; btn.textContent = 'Saving…';

  const action = currentEditId ? 'updateCapsule' : 'saveCapsule';
  chrome.runtime.sendMessage({ action, capsule }, res => {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Capsule`;

    if (res?.success) {
      if (currentEditId) {
        const i = allCapsules.findIndex(c => c.id === currentEditId);
        if (i !== -1) allCapsules[i] = res.capsule; else allCapsules.unshift(res.capsule);
      } else {
        allCapsules.unshift(res.capsule);
      }
      showToast(currentEditId ? '✅ Updated!' : '✅ Saved!');
      applyFiltersAndSort(); updateFooter(); showView('list');
    } else {
      showToast('❌ Save failed', 'error');
    }
  });
}

// ─── Capture from Page ────────────────────────────────────────────────────────

function captureFromPage() {
  chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
    if (!tabs[0]) { showToast('⚠️ No active tab', 'warning'); return; }

    const btn = gid('btn-capture');
    btn.disabled = true;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg> Capturing…';

    chrome.tabs.sendMessage(tabs[0].id, { action:'quickCapture' }, () => {
      // Chrome may not call this cb if content script doesn't reply — that's OK
    });

    // Wait for storage change listener to pick it up automatically,
    // but also do a fallback reload after 2s
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg> Capture Page';
      // Reload in case storage listener missed it
      chrome.runtime.sendMessage({ action:'getCapsules' }, res => {
        if (res?.success) {
          const prev = allCapsules.length;
          allCapsules = res.capsules || [];
          if (allCapsules.length > prev) {
            showToast(`✅ Captured! (${allCapsules.length - prev} new)`);
          } else {
            showToast('💡 Navigate to an AI chat page first', 'info');
          }
          applyFiltersAndSort(); updateFooter();
        }
      });
    }, 2000);
  });
}

// ─── Color Swatches ───────────────────────────────────────────────────────────

function buildColorSwatches() {
  const container = gid('color-swatches');
  SWATCHES.forEach(color => {
    const s = document.createElement('div');
    s.className = 'cf-swatch';
    s.dataset.color = color;
    s.style.background = color;
    s.title = color;
    s.addEventListener('click', () => {
      gid('edit-color').value = color;
      document.querySelectorAll('.cf-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
    container.appendChild(s);
  });
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportCapsules() {
  chrome.runtime.sendMessage({ action:'exportCapsules' }, res => {
    if (!res?.success) { showToast('❌ Export failed', 'error'); return; }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `contextflow-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✅ Exported ${allCapsules.length} capsule${allCapsules.length!==1?'s':''}`);
  });
}

function triggerImport() { gid('import-file').click(); }

function handleImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const raw = JSON.parse(ev.target.result);
      const capsules = Array.isArray(raw) ? raw : raw.capsules;
      if (!Array.isArray(capsules)) throw new Error('No capsules array found');
      chrome.runtime.sendMessage({ action:'importCapsules', capsules, mode:'merge' }, res => {
        if (res?.success) {
          showToast(`✅ Imported ${res.added}${res.skipped?` (${res.skipped} skipped)`:''}`);
          loadCapsules();
        } else { showToast('❌ Import failed', 'error'); }
      });
    } catch { showToast('❌ Invalid JSON file', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAll() {
  if (!confirm('Delete ALL capsules permanently?')) return;
  chrome.runtime.sendMessage({ action:'clearAll' }, res => {
    if (res?.success) { allCapsules = []; applyFiltersAndSort(); updateFooter(); showToast('🗑️ Cleared'); }
  });
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function showView(name) {
  Object.entries(views).forEach(([k,id]) => gid(id).style.display = k===name?'flex':'none');
}

function showLoading() {
  const el = capsuleList();
  el.querySelectorAll('.cf-card,.cf-no-results,.cf-loading').forEach(n=>n.remove());
  emptyState().style.display = 'none';
  const d = document.createElement('div');
  d.className = 'cf-loading';
  d.innerHTML = '<div class="cf-spinner"></div>Loading capsules…';
  el.appendChild(d);
}

function updateFooter() {
  const n = allCapsules.length;
  footerCount().textContent = `${n} capsule${n!==1?'s':''}`;
}

function updateAboutStats(stats) {
  const el = gid('about-stats');
  if (!el || !stats) return;
  const since = stats.installDate ? new Date(stats.installDate).toLocaleDateString() : '—';
  el.innerHTML = `📦 Captured: ${Number(stats.totalCaptured)||0} &nbsp;&#xFEFF; ⚡ Injected: ${Number(stats.totalInjected)||0}<br>📅 Using since: ${since.replace(/</g,'&lt;')}`;
}

let toastTmr;
function showToast(msg, type='info') {
  const el = toast();
  el.textContent = msg;
  el.className = 'cf-popup-toast show';
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value:text });
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    ta.remove(); return true;
  }
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hl(html, q) {
  if (!q) return html;
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return html.replace(rx, '<mark class="cf-highlight">$1</mark>');
}

function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatAge(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now()-ts)/1000);
  if (s<60) return 'just now';
  const m=Math.floor(s/60); if(m<60) return m+'m ago';
  const h=Math.floor(m/60); if(h<24) return h+'h ago';
  const d=Math.floor(h/24); if(d<30) return d+'d ago';
  const mo=Math.floor(d/30); if(mo<12) return mo+'mo ago';
  return Math.floor(mo/12)+'y ago';
}

function gid(id)       { return document.getElementById(id); }
function gChecked(id)  { return gid(id)?.checked ?? false; }
function safeCheck(id, val) { const el = gid(id); if (el) el.checked = val; }

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindAllEvents() {
  // Header
  gid('btn-search-toggle').addEventListener('click', () => {
    const visible = searchBar().style.display !== 'none';
    searchBar().style.display = visible ? 'none' : 'flex';
    if (!visible) setTimeout(() => searchInput().focus(), 40);
    else { searchQuery = ''; searchInput().value = ''; applyFiltersAndSort(); }
  });
  gid('btn-settings').addEventListener('click', () => {
    showView('settings');
    chrome.runtime.sendMessage({ action:'getSettings' }, r => { if (r?.stats) updateAboutStats(r.stats); });
  });

  // Search
  searchInput().addEventListener('input', e => { searchQuery = e.target.value; applyFiltersAndSort(); });
  gid('search-close').addEventListener('click', () => {
    searchBar().style.display = 'none'; searchQuery = ''; searchInput().value = ''; applyFiltersAndSort();
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); searchBar().style.display='flex'; searchInput().focus(); }
    if (e.key==='Escape') { searchBar().style.display='none'; searchQuery=''; searchInput().value=''; applyFiltersAndSort(); }
  });

  // Toolbar
  gid('btn-new').addEventListener('click', () => openEditView());
  gid('btn-empty-new').addEventListener('click', () => openEditView());
  gid('btn-capture').addEventListener('click', captureFromPage);
  gid('btn-export').addEventListener('click', exportCapsules);
  gid('btn-import').addEventListener('click', triggerImport);

  // Sort
  gid('sort-select').addEventListener('change', e => { currentSort = e.target.value; applyFiltersAndSort(); });

  // Filter chips
  document.querySelectorAll('.cf-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cf-chip').forEach(c => c.classList.remove('cf-chip-active'));
      chip.classList.add('cf-chip-active');
      currentFilter = chip.dataset.filter;
      applyFiltersAndSort();
    });
  });

  // Edit view
  gid('btn-back-from-edit').addEventListener('click', () => showView('list'));
  gid('btn-cancel-edit').addEventListener('click', () => showView('list'));
  gid('btn-save-capsule').addEventListener('click', saveCapsule);
  gid('edit-title').addEventListener('input', updateCharCount);
  gid('edit-content').addEventListener('input', updateContentStats);
  gid('edit-color').addEventListener('input', e => {
    document.querySelectorAll('.cf-swatch').forEach(s => s.classList.remove('active'));
  });

  // Tags
  gid('edit-tags').addEventListener('keydown', e => {
    if (e.key==='Enter'||e.key===',') {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^#/,'').toLowerCase().replace(/\s+/g,'-');
      if (v && !editTags.includes(v)) editTags.push(v);
      e.target.value = '';
      updateTagsPreview();
    }
  });

  // Settings
  gid('btn-back-from-settings').addEventListener('click', () => showView('list'));
  gid('btn-export-settings').addEventListener('click', exportCapsules);
  gid('btn-import-settings').addEventListener('click', triggerImport);
  gid('btn-clear-all').addEventListener('click', clearAll);
  ['setting-show-capture','setting-confirm-delete','setting-auto-tag','setting-badge']
    .forEach(id => gid(id)?.addEventListener('change', saveSettings));

  // File import
  gid('import-file').addEventListener('change', handleImport);
}
