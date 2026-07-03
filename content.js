// ContextFlow — Content Script v1.1.0
// Single scope, single message listener, no IIFE conflicts

(function contextflowInit() {
  'use strict';
  if (window.__contextflow_loaded) return;
  window.__contextflow_loaded = true;

  // ─── Platform Detection ──────────────────────────────────────────────────────

  const PLATFORMS = {
    'chatgpt.com': { name: 'ChatGPT', color: '#10A37F' },
    'chat.openai.com': { name: 'ChatGPT', color: '#10A37F' },
    'claude.ai': { name: 'Claude', color: '#D97706' },
    'gemini.google.com': { name: 'Gemini', color: '#4285F4' },
    'aistudio.google.com': { name: 'AI Studio', color: '#4285F4' },
    'chat.deepseek.com': { name: 'DeepSeek', color: '#2563EB' },
    'grok.com': { name: 'Grok', color: '#555' },
    'x.com': { name: 'Grok', color: '#555' },
    'perplexity.ai': { name: 'Perplexity', color: '#20B2AA' },
    'copilot.microsoft.com': { name: 'Copilot', color: '#0078D4' },
    'character.ai': { name: 'Character.AI', color: '#7C3AED' },
    'poe.com': { name: 'Poe', color: '#8B5CF6' },
    'mistral.ai': { name: 'Mistral', color: '#FF6B35' },
    'v0.dev': { name: 'v0', color: '#000' },
    'bolt.new': { name: 'Bolt', color: '#0F172A' },
    'lovable.dev': { name: 'Lovable', color: '#EC4899' },
    'replit.com': { name: 'Replit', color: '#F26207' },
    'huggingface.co': { name: 'HuggingFace', color: '#FFD21E' }
  };

  function getCurrentPlatform() {
    const host = window.location.hostname.replace('www.', '');
    for (const [key, info] of Object.entries(PLATFORMS)) {
      if (host.includes(key)) return info;
    }
    return null;
  }

  const platform = getCurrentPlatform();

  // ─── Formatted Text Extraction ────────────────────────────────────────────────

  function extractFormattedText(element) {
    const clone = element.cloneNode(true);
    // Replace <pre><code> and <pre> blocks with fenced code blocks
    clone.querySelectorAll('pre code, pre').forEach(block => {
      if (block.tagName === 'CODE' && block.parentElement.tagName === 'PRE') {
        // <pre><code class="language-python">...</code></pre>
        const langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
        const lang = langClass ? langClass.replace('language-', '') : '';
        const fenced = '\n```' + lang + '\n' + block.textContent + '\n```\n';
        block.parentElement.replaceWith(document.createTextNode(fenced));
      } else if (block.tagName === 'PRE' && !block.querySelector('code')) {
        // Standalone <pre> without nested <code>
        const fenced = '\n```\n' + block.textContent + '\n```\n';
        block.replaceWith(document.createTextNode(fenced));
      }
    });
    // Replace inline <code> with backtick-wrapped text
    clone.querySelectorAll('code').forEach(c => {
      c.replaceWith(document.createTextNode('`' + c.textContent + '`'));
    });
    return clone.innerText;
  }

  // ─── Context Extraction ──────────────────────────────────────────────────────

  function extractConversation() {
    const host = window.location.hostname;
    try {
      if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return extractChatGPT();
      if (host.includes('claude.ai')) return extractClaude();
      if (host.includes('gemini.google.com')) return extractGemini();
      if (host.includes('deepseek.com')) return extractDeepSeek();
      if (host.includes('grok.com') || host.includes('x.com')) return extractGrok();
      if (host.includes('perplexity.ai')) return extractPerplexity();
      if (host.includes('poe.com')) return extractPoe();
    } catch (e) { console.warn('[ContextFlow] Extractor error:', e); }
    return extractGeneric();
  }

  function extractChatGPT() {
    const turns = [];
    // MV: data-testid="conversation-turn-N"
    const articles = document.querySelectorAll('[data-testid^="conversation-turn"]');
    articles.forEach(el => {
      const role = el.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
      const msgEl = el.querySelector('.whitespace-pre-wrap, [data-message-author-role]');
      const text = msgEl ? extractFormattedText(msgEl)?.trim() : null;
      if (text && role) turns.push({ role: role === 'user' ? 'user' : 'assistant', content: text.slice(0, 12000) });
    });
    if (!turns.length) {
      // Fallback selectors
      document.querySelectorAll('[class*="message-bubble"], [class*="MessageBubble"]').forEach(el => {
        turns.push({ role: 'context', content: extractFormattedText(el)?.trim().slice(0, 8000) });
      });
    }
    return turns;
  }

  function extractClaude() {
    const turns = [];
    const all = [];
    // Human messages
    document.querySelectorAll('[data-testid="human-turn"], .human-turn, [class*="human"][class*="turn"], [class*="HumanTurn"]').forEach(el => {
      all.push({ role: 'user', content: extractFormattedText(el)?.trim().slice(0, 12000), pos: el.getBoundingClientRect().top + window.scrollY });
    });
    // Assistant messages
    document.querySelectorAll('[data-testid="assistant-turn"], .assistant-turn, [class*="assistant"][class*="turn"], [class*="AssistantTurn"]').forEach(el => {
      all.push({ role: 'assistant', content: extractFormattedText(el)?.trim().slice(0, 12000), pos: el.getBoundingClientRect().top + window.scrollY });
    });
    all.sort((a, b) => a.pos - b.pos);
    all.forEach(t => { delete t.pos; if (t.content) turns.push(t); });
    if (!turns.length) {
      // Broader fallback: grab the conversation wrapper
      const conv = document.querySelector('[class*="conversation"], main');
      if (conv) return [{ role: 'context', content: extractFormattedText(conv)?.trim().slice(0, 12000) }];
    }
    return turns;
  }

  function extractGemini() {
    const turns = [];
    document.querySelectorAll('user-query, model-response').forEach(el => {
      const isUser = el.tagName.toLowerCase() === 'user-query';
      const text = extractFormattedText(el)?.trim();
      if (text) turns.push({ role: isUser ? 'user' : 'assistant', content: text.slice(0, 12000) });
    });
    if (!turns.length) {
      document.querySelectorAll('[class*="query-text"], [class*="response-text"], [class*="model-run"]').forEach(el => {
        turns.push({ role: 'context', content: extractFormattedText(el)?.trim().slice(0, 8000) });
      });
    }
    return turns;
  }

  function extractDeepSeek() {
    const turns = [];
    document.querySelectorAll('[class*="chat-message"], [class*="message-item"], [class*="ds-message"]').forEach(el => {
      const isUser = el.className.includes('user') || !!el.querySelector('[class*="user"]');
      const text = extractFormattedText(el)?.trim();
      if (text && text.length > 5) turns.push({ role: isUser ? 'user' : 'assistant', content: text.slice(0, 12000) });
    });
    return turns;
  }

  function extractGrok() {
    const turns = [];
    // Smart container detection to avoid matching unrelated UI elements
    const container = document.querySelector('[class*="conversation"], [class*="chat-scroll"], [role="log"], main') || document;
    container.querySelectorAll('[class*="message"], [data-testid*="message"], [class*="Message"]').forEach(el => {
      const text = extractFormattedText(el)?.trim();
      if (!text || text.length < 30) return;
      // Skip elements that look like UI chrome (short text matching common patterns)
      if (text.length < 50 && /^(copy|share|edit|delete|retry|regenerate|like|dislike|more|menu|close|cancel|ok|submit|send|loading|\.\.\.)$/i.test(text.trim())) return;
      const isUser = el.className.toLowerCase().includes('user') || !!el.closest('[class*="user-message"], [class*="UserMessage"]');
      turns.push({ role: isUser ? 'user' : 'assistant', content: text.slice(0, 12000) });
    });
    return turns;
  }

  function extractPerplexity() {
    const turns = [];
    document.querySelectorAll('[class*="UserMessage"], [data-testid*="user"]').forEach(el => {
      turns.push({ role: 'user', content: extractFormattedText(el)?.trim().slice(0, 12000), pos: el.offsetTop });
    });
    document.querySelectorAll('[class*="AnswerBody"], [class*="answer-body"], [class*="MarkdownBody"]').forEach(el => {
      turns.push({ role: 'assistant', content: extractFormattedText(el)?.trim().slice(0, 12000), pos: el.offsetTop });
    });
    turns.sort((a, b) => (a.pos || 0) - (b.pos || 0));
    turns.forEach(t => delete t.pos);
    return turns.filter(t => t.content);
  }

  function extractPoe() {
    const turns = [];
    document.querySelectorAll('[class*="Message_humanMessageBubble"], [class*="Message_botMessageBubble"]').forEach(el => {
      const isUser = el.className.includes('human');
      turns.push({ role: isUser ? 'user' : 'assistant', content: extractFormattedText(el)?.trim().slice(0, 12000) });
    });
    return turns;
  }

  function extractGeneric() {
    // Grab visible text content intelligently
    const main = document.querySelector('main, [role="main"], article, .chat-container, #chat') || document.body;
    const text = main.innerText?.trim() || '';
    if (text.length < 30) return [];
    return [{ role: 'context', content: text.slice(0, 15000) }];
  }

  function turnsToText(turns) {
    if (!turns || turns.length === 0) return '';
    return turns.map(t => {
      const label = t.role === 'user' ? '👤 User' : t.role === 'assistant' ? '🤖 AI' : '📄 Context';
      return `${label}:\n${t.content}`;
    }).join('\n\n---\n\n');
  }

  function generateTitle(turns) {
    const firstUser = turns.find(t => t.role === 'user');
    if (firstUser?.content) {
      return firstUser.content.replace(/\n+/g, ' ').slice(0, 70) + (firstUser.content.length > 70 ? '...' : '');
    }
    return document.title?.slice(0, 70) || 'Captured Context';
  }

  // ─── Toast Notifications ─────────────────────────────────────────────────────

  function showToast(message, type = 'info') {
    document.querySelector('.cf-toast-el')?.remove();
    const colors = { success: '#10B981', error: '#EF4444', warning: '#F59E0B', info: '#6366F1' };
    const toast = document.createElement('div');
    toast.className = 'cf-toast-el';
    toast.style.cssText = `
      position:fixed;bottom:80px;right:24px;z-index:2147483646;
      background:${colors[type] || colors.info};color:#fff;
      padding:11px 16px;border-radius:10px;
      font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
      font-size:13px;font-weight:500;
      box-shadow:0 6px 20px rgba(0,0,0,0.28);
      max-width:300px;pointer-events:none;
      animation:cfToast .3s cubic-bezier(0.34,1.56,0.64,1);
    `;
    const style = document.createElement('style');
    style.textContent = `@keyframes cfToast{from{transform:translateX(110%);opacity:0}to{transform:none;opacity:1}}`;
    toast.appendChild(style);
    const msg = document.createElement('span');
    msg.textContent = message;
    toast.appendChild(msg);
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.transition = 'opacity .3s'; toast.style.opacity = '0'; }, 2800);
    setTimeout(() => toast.remove(), 3200);
  }

  // ─── Capture ─────────────────────────────────────────────────────────────────

  async function doCapture() {
    const turns = extractConversation();
    if (!turns || turns.length === 0) {
      showToast('⚠️ No conversation found on this page', 'warning');
      return;
    }

    const content = turnsToText(turns);
    const title = generateTitle(turns);
    const summary = content.slice(0, 140).replace(/\n+/g, ' ');

    const capsule = {
      title,
      content,
      summary,
      tags: [platform ? platform.name.toLowerCase() : 'web'],
      platform: platform ? platform.name : 'Web',
      source_url: window.location.href,
      source_title: document.title
    };

    // Update capture button
    const btn = document.getElementById('cf-capture-btn');
    if (btn) {
      btn.classList.add('cf-capturing');
      btn.querySelector('.cf-btn-label').textContent = 'Saving…';
    }
    // Update panel capture button
    const panelBtn = document.getElementById('cf-panel-capture');
    if (panelBtn) { panelBtn.disabled = true; panelBtn.textContent = '⏳ Saving…'; }

    chrome.runtime.sendMessage({ action: 'saveCapsule', capsule }, (res) => {
      if (res?.success) {
        showToast(`✅ Saved: "${title.slice(0, 35)}${title.length > 35 ? '…' : ''}"`, 'success');
        if (btn) {
          btn.querySelector('.cf-btn-label').textContent = '✓ Saved!';
          setTimeout(() => {
            btn.classList.remove('cf-capturing');
            btn.querySelector('.cf-btn-label').textContent = 'Save Context';
          }, 2000);
        }
        if (panelBtn) {
          panelBtn.disabled = false;
          panelBtn.textContent = '⚡ Capture This Page';
        }
        // Refresh panel list
        if (document.getElementById('cf-panel')?.style.display === 'flex') {
          loadPanelCapsules();
        }
      } else {
        showToast('❌ Save failed. Try again.', 'error');
        if (btn) {
          btn.classList.remove('cf-capturing');
          btn.querySelector('.cf-btn-label').textContent = 'Save Context';
        }
        if (panelBtn) { panelBtn.disabled = false; panelBtn.textContent = '⚡ Capture This Page'; }
      }
    });
  }

  // ─── Inject into Page ────────────────────────────────────────────────────────

  function injectText(text) {
    const SELECTORS = [
      '#prompt-textarea',
      'div.ProseMirror[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
      'div.ql-editor',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]:not([aria-readonly="true"])',
      'textarea#chat-input',
      'textarea[placeholder]',
      'textarea',
    ];
    let target = null;
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && !el.getAttribute('aria-readonly')) {
        target = el; break;
      }
    }
    // Last resort: active element
    if (!target) {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'TEXTAREA' || ae.contentEditable === 'true')) target = ae;
    }

    if (!target) {
      navigator.clipboard.writeText(text).then(() =>
        showToast('📋 Copied to clipboard — paste with Ctrl+V', 'info')
      );
      return;
    }

    target.focus();
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const s = target.selectionStart ?? target.value.length;
      const e = target.selectionEnd ?? target.value.length;
      target.value = target.value.slice(0, s) + text + target.value.slice(e);
      target.setSelectionRange(s + text.length, s + text.length);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contenteditable
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node); range.setEndAfter(node);
        sel.removeAllRanges(); sel.addRange(range);
      } else {
        target.textContent = (target.textContent || '') + text;
        // Move cursor to end
        const range = document.createRange();
        range.selectNodeContents(target); range.collapse(false);
        const sel2 = window.getSelection();
        sel2.removeAllRanges(); sel2.addRange(range);
      }
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    showToast('⚡ Context injected!', 'success');
  }

  // ─── Capture Button ──────────────────────────────────────────────────────────

  let captureBtn = null;

  function injectCaptureButton() {
    if (!platform || document.getElementById('cf-capture-btn')) return;
    captureBtn = document.createElement('div');
    captureBtn.id = 'cf-capture-btn';
    captureBtn.innerHTML = `<span class="cf-btn-icon">⚡</span><span class="cf-btn-label">Save Context</span>`;
    captureBtn.title = 'Save conversation to ContextFlow (Ctrl+Shift+S)';
    captureBtn.addEventListener('click', doCapture);
    document.body.appendChild(captureBtn);
    setTimeout(() => captureBtn?.classList.add('cf-visible'), 1200);
  }

  // ─── Floating Panel ──────────────────────────────────────────────────────────

  let panel = null;
  let panelVisible = false;
  let panelDragging = false;
  let dragOX = 0, dragOY = 0;
  let allPanelCapsules = [];

  function escH(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function pAge(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function buildPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'cf-panel';
    panel.innerHTML = `
      <div id="cf-panel-header">
        <div id="cf-panel-logo">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="4" width="16" height="2.5" rx="1.25" fill="white"/>
            <rect x="2" y="8.5" width="11" height="2.5" rx="1.25" fill="white" opacity=".7"/>
            <rect x="2" y="13" width="16" height="2.5" rx="1.25" fill="white"/>
          </svg>
          <span>ContextFlow</span>
        </div>
        <div id="cf-panel-controls">
          <button id="cf-panel-refresh" title="Refresh">↻</button>
          <button id="cf-panel-close" title="Close (Ctrl+Shift+K)">✕</button>
        </div>
      </div>
      <div id="cf-panel-search-wrap">
        <input id="cf-panel-search" type="text" placeholder="🔍  Search capsules…" autocomplete="off"/>
      </div>
      <div id="cf-panel-list"></div>
      <div id="cf-panel-footer">
        <button id="cf-panel-capture">⚡ Capture This Page</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Events — all reference functions IN THIS SAME SCOPE ✅
    panel.querySelector('#cf-panel-close').addEventListener('click', hidePanel);
    panel.querySelector('#cf-panel-refresh').addEventListener('click', loadPanelCapsules);
    panel.querySelector('#cf-panel-capture').addEventListener('click', doCapture);

    const search = panel.querySelector('#cf-panel-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      renderPanelCapsules(q ? allPanelCapsules.filter(c =>
        c.title?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.content?.toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.includes(q))
      ) : allPanelCapsules);
    });

    // Drag
    const hdr = panel.querySelector('#cf-panel-header');
    hdr.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      panelDragging = true;
      const r = panel.getBoundingClientRect();
      dragOX = e.clientX - r.left; dragOY = e.clientY - r.top;
      panel.style.transition = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!panelDragging) return;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, e.clientX - dragOX)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - dragOY)) + 'px';
    });
    document.addEventListener('mouseup', () => { if (panelDragging) { panelDragging = false; panel.style.transition = ''; } });
  }

  function loadPanelCapsules() {
    const list = panel?.querySelector('#cf-panel-list');
    if (!list) return;
    list.innerHTML = '<div class="cf-pi-loading">Loading…</div>';
    chrome.runtime.sendMessage({ action: 'getCapsules' }, (res) => {
      allPanelCapsules = res?.capsules || [];
      renderPanelCapsules(allPanelCapsules);
    });
  }

  function renderPanelCapsules(capsules) {
    const list = panel?.querySelector('#cf-panel-list');
    if (!list) return;
    list.innerHTML = '';
    if (!capsules.length) {
      list.innerHTML = `<div class="cf-pi-empty">${
        allPanelCapsules.length === 0
          ? 'No capsules yet.<br/>Click ⚡ Capture to save this page.'
          : 'No matches.'
      }</div>`;
      return;
    }
    capsules.forEach(c => {
      const item = document.createElement('div');
      item.className = 'cf-pi-item';
      item.draggable = true;
      item.title = 'Drag into chat input OR click ⚡ Inject';
      item.innerHTML = `
        <div class="cf-pi-title">${escH(c.title || 'Untitled')}</div>
        <div class="cf-pi-meta">
          ${c.platform ? `<span class="cf-pi-plat">${escH(c.platform)}</span>` : ''}
          <span class="cf-pi-age">${pAge(c.updatedAt || c.createdAt)}</span>
          ${(c.version || 1) > 1 ? `<span class="cf-pi-ver">v${c.version}</span>` : ''}
        </div>
        <div class="cf-pi-summary">${escH((c.summary || '').slice(0, 85))}${(c.summary || '').length > 85 ? '…' : ''}</div>
        <div class="cf-pi-btns">
          <button class="cf-pi-inject-btn">⚡ Inject</button>
          <button class="cf-pi-copy-btn">📋 Copy</button>
        </div>
      `;
      item.querySelector('.cf-pi-inject-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        injectText(c.content || '');
      });
      item.querySelector('.cf-pi-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(c.content || '').then(() =>
          showToast('📋 Copied to clipboard!', 'success')
        );
      });
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.content || '');
        e.dataTransfer.effectAllowed = 'copy';
        item.style.opacity = '.5';
      });
      item.addEventListener('dragend', () => { item.style.opacity = ''; });
      list.appendChild(item);
    });
  }

  function showPanel() {
    buildPanel();
    panel.style.display = 'flex';
    panelVisible = true;
    loadPanelCapsules();
    setTimeout(() => panel.querySelector('#cf-panel-search')?.focus(), 80);
  }

  function hidePanel() {
    if (panel) panel.style.display = 'none';
    panelVisible = false;
  }

  function togglePanel() { panelVisible ? hidePanel() : showPanel(); }

  // ─── SINGLE Message Listener ─────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'quickCapture':
        doCapture();
        break;
      case 'togglePanel':
        togglePanel();
        break;
      case 'injectText':
        injectText(message.content || '');
        break;
      case 'showToast':
        showToast(message.message, message.type || 'info');
        break;
      case 'ping':
        sendResponse({ alive: true, platform: platform?.name || 'none' });
        break;
    }
  });

  // ─── SPA Navigation Observer ─────────────────────────────────────────────────

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        if (!document.getElementById('cf-capture-btn')) {
          captureBtn = null;
          injectCaptureButton();
        }
      }, 1200);
    }
  }).observe(document.documentElement, { subtree: true, childList: true });

  // ─── Init ────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCaptureButton);
  } else {
    injectCaptureButton();
  }

})();
