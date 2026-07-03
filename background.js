// ContextFlow — Background Service Worker
// All data is stored 100% locally in chrome.storage.local
// No external servers, no accounts, no limits

const CF_VERSION = '1.1.0';

// ─── Init ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.local.get(['capsules', 'settings', 'cf_initialized']);

  if (!data.cf_initialized) {
    await chrome.storage.local.set({
      capsules: [],
      settings: {
        theme: 'dark',
        showCaptureButton: true,
        defaultPlatform: 'auto',
        compactMode: false,
        autoTagPlatform: true,
        confirmDelete: true
      },
      stats: {
        totalCaptured: 0,
        totalInjected: 0,
        installDate: Date.now()
      },
      cf_initialized: true,
      cf_version: CF_VERSION
    });
    console.log('[ContextFlow] Initialized with fresh storage');
  }

  // Set up context menu
  setupContextMenus();
});

// ─── Context Menus ───────────────────────────────────────────────────────────

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'cf-capture-selection',
      title: 'Save selection as ContextFlow Capsule',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'cf-open-popup',
      title: 'Open ContextFlow',
      contexts: ['page', 'editable']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'cf-capture-selection' && info.selectionText) {
    const capsule = {
      title: info.selectionText.slice(0, 60) + (info.selectionText.length > 60 ? '...' : ''),
      content: info.selectionText,
      summary: info.selectionText.slice(0, 120),
      tags: ['manual'],
      platform: detectPlatformFromUrl(tab.url),
      source_url: tab.url,
      source_title: tab.title
    };
    await saveCapsule(capsule);
    
    // Notify content script
    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: '✅ Saved to ContextFlow!',
      type: 'success'
    });
  }
});

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-panel') {
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  }
  if (command === 'quick-capture') {
    chrome.tabs.sendMessage(tab.id, { action: 'quickCapture' });
  }
});

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep message channel open for async
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {

      case 'getCapsules': {
        const data = await chrome.storage.local.get(['capsules']);
        sendResponse({ success: true, capsules: data.capsules || [] });
        break;
      }

      case 'saveCapsule': {
        const saved = await saveCapsule(message.capsule);
        sendResponse({ success: true, capsule: saved });
        break;
      }

      case 'updateCapsule': {
        const updated = await updateCapsule(message.capsule);
        sendResponse({ success: true, capsule: updated });
        break;
      }

      case 'deleteCapsule': {
        await deleteCapsule(message.id);
        sendResponse({ success: true });
        break;
      }

      case 'duplicateCapsule': {
        const dup = await duplicateCapsule(message.id);
        sendResponse({ success: true, capsule: dup });
        break;
      }

      case 'getSettings': {
        const settingsData = await chrome.storage.local.get(['settings', 'stats']);
        sendResponse({ success: true, settings: settingsData.settings, stats: settingsData.stats });
        break;
      }

      case 'updateSettings': {
        const existingSettings = await chrome.storage.local.get(['settings']);
        await chrome.storage.local.set({
          settings: { ...(existingSettings.settings || {}), ...message.settings }
        });
        sendResponse({ success: true });
        break;
      }

      case 'exportCapsules': {
        const exportData = await chrome.storage.local.get(['capsules', 'settings']);
        const exportPayload = {
          version: CF_VERSION,
          exportedAt: new Date().toISOString(),
          capsules: exportData.capsules || [],
          settings: exportData.settings || {}
        };
        sendResponse({ success: true, data: exportPayload });
        break;
      }

      case 'importCapsules': {
        const result = await importCapsules(message.capsules, message.mode || 'merge');
        sendResponse(result);
        break;
      }

      case 'injectCapsule': {
        await injectCapsuleIntoPage(message.content, message.tabId || sender.tab?.id);
        sendResponse({ success: true });
        break;
      }

      case 'captureFromPage': {
        const captured = await capturePageContext(sender.tab);
        if (captured) {
          sendResponse({ success: true, capsule: captured });
        } else {
          sendResponse({ success: false, error: 'No conversation found to capture' });
        }
        break;
      }

      case 'trackStat': {
        const stats = await chrome.storage.local.get(['stats']);
        const current = stats.stats || {};
        current[message.stat] = (current[message.stat] || 0) + 1;
        current.lastUsed = Date.now();
        await chrome.storage.local.set({ stats: current });
        sendResponse({ success: true });
        break;
      }

      case 'clearAll': {
        await chrome.storage.local.set({ capsules: [] });
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    }
  } catch (err) {
    console.error('[ContextFlow] Error handling message:', message.action, err);
    sendResponse({ success: false, error: err.message });
  }
}

// ─── Storage Operations ───────────────────────────────────────────────────────

async function saveCapsule(capsuleData) {
  const { capsules = [] } = await chrome.storage.local.get(['capsules']);

  const newCapsule = {
    id: generateId(),
    title: capsuleData.title || 'Untitled Capsule',
    content: capsuleData.content || '',
    summary: capsuleData.summary || generateSummary(capsuleData.content || ''),
    tags: capsuleData.tags || [],
    platform: capsuleData.platform || 'unknown',
    source_url: capsuleData.source_url || '',
    source_title: capsuleData.source_title || '',
    color: capsuleData.color || getRandomColor(),
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    versions: []
  };

  capsules.unshift(newCapsule);
  await chrome.storage.local.set({ capsules });

  // Track stat
  const stats = await chrome.storage.local.get(['stats']);
  const s = stats.stats || {};
  s.totalCaptured = (s.totalCaptured || 0) + 1;
  await chrome.storage.local.set({ stats: s });

  return newCapsule;
}

async function updateCapsule(updatedData) {
  const { capsules = [] } = await chrome.storage.local.get(['capsules']);
  const index = capsules.findIndex(c => c.id === updatedData.id);

  if (index === -1) throw new Error('Capsule not found');

  const old = capsules[index];
  const versions = [...(old.versions || [])];

  // Keep last 10 versions
  if (versions.length >= 10) versions.shift();
  versions.push({
    title: old.title,
    content: old.content,
    updatedAt: old.updatedAt,
    version: old.version
  });

  capsules[index] = {
    ...old,
    ...updatedData,
    id: old.id,           // Never change the ID
    createdAt: old.createdAt, // Never change creation date
    updatedAt: Date.now(),
    version: (old.version || 1) + 1,
    versions: versions
  };

  await chrome.storage.local.set({ capsules });
  return capsules[index];
}

async function deleteCapsule(id) {
  const { capsules = [] } = await chrome.storage.local.get(['capsules']);
  await chrome.storage.local.set({ capsules: capsules.filter(c => c.id !== id) });
}

async function duplicateCapsule(id) {
  const { capsules = [] } = await chrome.storage.local.get(['capsules']);
  const source = capsules.find(c => c.id === id);
  if (!source) throw new Error('Capsule not found');

  return await saveCapsule({
    ...source,
    title: source.title + ' (copy)',
    id: undefined
  });
}

async function importCapsules(newCapsules, mode) {
  const { capsules = [] } = await chrome.storage.local.get(['capsules']);
  let added = 0;
  let skipped = 0;

  if (mode === 'replace') {
    await chrome.storage.local.set({ capsules: newCapsules });
    added = newCapsules.length;
  } else {
    // Merge mode: skip duplicates by ID
    const existingIds = new Set(capsules.map(c => c.id));
    const toAdd = newCapsules.filter(c => {
      if (existingIds.has(c.id)) { skipped++; return false; }
      return true;
    });
    const merged = [...toAdd, ...capsules];
    await chrome.storage.local.set({ capsules: merged });
    added = toAdd.length;
  }

  return { success: true, added, skipped };
}

// ─── Context Injection ────────────────────────────────────────────────────────

async function injectCapsuleIntoPage(content, tabId) {
  if (!tabId) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (textToInject) => {
      // Try to find the best input element
      const selectors = [
        // ChatGPT
        'div#prompt-textarea',
        // Claude
        'div[contenteditable="true"].ProseMirror',
        'div.ProseMirror',
        // Gemini
        'div.ql-editor',
        // Generic contenteditable
        '[contenteditable="true"]:not([aria-readonly="true"])',
        // Grok, Perplexity, others
        'textarea[placeholder]',
        'textarea',
        // Last resort: any focused element
        'document.activeElement'
      ];

      let target = null;
      for (const sel of selectors) {
        if (sel === 'document.activeElement') {
          const el = document.activeElement;
          if (el && (el.tagName === 'TEXTAREA' || el.contentEditable === 'true')) {
            target = el;
            break;
          }
        } else {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) { // visible
            target = el;
            break;
          }
        }
      }

      if (!target) {
        // Fallback: copy to clipboard and show alert
        navigator.clipboard.writeText(textToInject).then(() => {
          const div = document.createElement('div');
          div.style.cssText = `
            position:fixed;bottom:24px;right:24px;z-index:999999;
            background:#6366F1;color:#fff;padding:12px 20px;
            border-radius:10px;font-family:system-ui;font-size:14px;
            box-shadow:0 8px 24px rgba(99,102,241,0.4);
            animation:cfSlideIn 0.3s ease;
          `;
          div.textContent = '📋 ContextFlow: Copied to clipboard! Paste anywhere.';
          document.body.appendChild(div);
          setTimeout(() => div.remove(), 3000);
        });
        return;
      }

      target.focus();

      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        // Standard input element
        const start = target.selectionStart || target.value.length;
        const end = target.selectionEnd || target.value.length;
        const before = target.value.substring(0, start);
        const after = target.value.substring(end);
        target.value = before + textToInject + after;
        target.setSelectionRange(start + textToInject.length, start + textToInject.length);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (target.contentEditable === 'true') {
        // ContentEditable (ChatGPT, Claude, etc.)
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(textToInject);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Place at end
          target.textContent = (target.textContent || '') + textToInject;
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Show success indicator
      const toast = document.createElement('div');
      toast.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:999999;
        background:#6366F1;color:#fff;padding:12px 20px;
        border-radius:10px;font-family:system-ui;font-size:14px;
        box-shadow:0 8px 24px rgba(99,102,241,0.4);
        transition:opacity 0.3s;pointer-events:none;
      `;
      toast.textContent = '⚡ ContextFlow injected!';
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; }, 1800);
      setTimeout(() => toast.remove(), 2200);
    },
    args: [content]
  });
}

// ─── Platform Detection ───────────────────────────────────────────────────────

function detectPlatformFromUrl(url = '') {
  const platforms = {
    'chatgpt.com': 'ChatGPT',
    'chat.openai.com': 'ChatGPT',
    'claude.ai': 'Claude',
    'gemini.google.com': 'Gemini',
    'aistudio.google.com': 'AI Studio',
    'chat.deepseek.com': 'DeepSeek',
    'grok.com': 'Grok',
    'x.com': 'Grok',
    'perplexity.ai': 'Perplexity',
    'copilot.microsoft.com': 'Copilot',
    'character.ai': 'Character.AI',
    'poe.com': 'Poe',
    'cohere.com': 'Cohere',
    'mistral.ai': 'Mistral',
    'huggingface.co': 'HuggingFace',
    'together.ai': 'Together',
    'replit.com': 'Replit',
    'lovable.dev': 'Lovable',
    'v0.dev': 'v0',
    'bolt.new': 'Bolt'
  };

  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [key, name] of Object.entries(platforms)) {
      if (hostname.includes(key)) return name;
    }
  } catch {}
  return 'Web';
}

async function capturePageContext(tab) {
  // This is called when the page has already extracted context via content script
  // The actual extraction happens in content.js via 'quickCapture' message
  return null; // handled by content.js
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return 'cf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function generateSummary(text, maxLen = 140) {
  const clean = text.replace(/\n+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 3) + '...' : clean;
}

const COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#06B6D4', '#3B82F6', '#EF4444'
];
let colorIndex = 0;
function getRandomColor() {
  return COLORS[colorIndex++ % COLORS.length];
}

// ─── Badge Counter ────────────────────────────────────────────────────────────
// Shows capsule count on the extension icon in real-time

async function updateBadge() {
  const { capsules = [] } = await chrome.storage.local.get(['capsules']);
  const count = capsules.length;
  const text = count === 0 ? '' : count > 99 ? '99+' : String(count);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#6366F1' });
}

// Update badge whenever storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.capsules) {
    updateBadge();
  }
});

// Update badge on startup
chrome.runtime.onStartup.addListener(updateBadge);
updateBadge(); // Run once on service worker activation
