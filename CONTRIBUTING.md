# Contributing to ContextFlow

First off — **thank you** for wanting to contribute! ContextFlow is built by the community, for the community. Whether you're fixing a typo, adding support for a new AI platform, or improving the UI, every contribution matters.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding a New Platform Extractor](#adding-a-new-platform-extractor)
- [Code Style](#code-style)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)
- [Community](#community)

---

## Getting Started

1. **Fork** this repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/contextflow-extension.git
   cd contextflow-extension
   ```
3. Create a **feature branch**:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```

## Development Setup

ContextFlow requires **zero build tools** — it's pure vanilla JavaScript. Here's how to load it for development:

1. Open **Chrome** (or any Chromium browser: Edge, Brave, Arc, etc.)
2. Navigate to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Select the `contextflow-extension` folder (the one containing `manifest.json`)
6. The ContextFlow icon will appear in your browser toolbar

### Hot Reloading

After making code changes:
- **Content script or CSS changes** → Refresh the target web page
- **Background script changes** → Click the ↻ reload button on the extension card in `chrome://extensions/`
- **Popup changes** → Close and reopen the popup

> **Tip:** Keep `chrome://extensions/` pinned in a tab. You'll use it frequently during development.

---

## Project Structure

```
contextflow-extension/
├── manifest.json          # Chrome Extension Manifest V3 config
├── background.js          # Service worker — storage, context menus, messaging
├── content.js             # Content script — platform extraction, UI injection
├── content.css            # Styles for injected UI (capture button, panel)
├── popup/
│   ├── popup.html         # Extension popup markup
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic — capsule CRUD, search, import/export
├── icons/                 # Extension icons (16, 32, 48, 128px)
├── LICENSE                # MIT License
└── README.md              # Project documentation
```

---

## Adding a New Platform Extractor

This is one of the most impactful contributions you can make. Here's the pattern:

### Step 1: Register the platform in `PLATFORMS`

At the top of `content.js`, add your platform to the `PLATFORMS` object:

```javascript
const PLATFORMS = {
  // ... existing platforms ...
  'newplatform.com': { name: 'NewPlatform', color: '#HEX_COLOR' },
};
```

### Step 2: Create an extractor function

Add a new `extract<PlatformName>()` function following the existing pattern:

```javascript
function extractNewPlatform() {
  const turns = [];
  
  // Query DOM for user messages
  document.querySelectorAll('[your-user-message-selector]').forEach(el => {
    const text = el.innerText?.trim();
    if (text) {
      turns.push({ role: 'user', content: text.slice(0, 12000) });
    }
  });

  // Query DOM for assistant messages
  document.querySelectorAll('[your-assistant-message-selector]').forEach(el => {
    const text = el.innerText?.trim();
    if (text) {
      turns.push({ role: 'assistant', content: text.slice(0, 12000) });
    }
  });

  return turns;
}
```

### Step 3: Wire it into `extractConversation()`

Add a condition to the `extractConversation()` function:

```javascript
if (host.includes('newplatform.com')) return extractNewPlatform();
```

### Tips for Writing Extractors

- **Use DevTools** to inspect the target platform's DOM structure
- **Prefer `data-testid` attributes** or semantic selectors over class names (classes change often)
- **Include fallback selectors** — AI platforms update their UIs frequently
- **Cap content at 12,000 characters** per turn — provides full context while keeping capsules manageable
- **Sort by position** if you need to interleave user/assistant messages (see `extractClaude()` for an example)
- **Test with real conversations** containing code blocks, images, and long threads

### Step 4: Update documentation

- Add the platform to the "Supported AI Platforms" table in `README.md`
- Add a CHANGELOG entry

---

## Code Style

ContextFlow follows a simple, consistent style:

### Rules

1. **Vanilla JavaScript only** — no frameworks, no TypeScript, no build tools
2. **IIFE pattern** — all content script code lives inside the `contextflowInit()` IIFE to avoid global scope pollution
3. **`'use strict'`** — always at the top of the IIFE
4. **`const` > `let` > `var`** — prefer `const`, use `let` only when reassignment is needed, never use `var`
5. **No external dependencies** — zero npm packages, zero CDN imports
6. **Descriptive function names** — `extractChatGPT()`, `showToast()`, `injectText()`
7. **Guard checks early** — return early from functions on invalid input
8. **Comment sections** — use the `// ─── Section Title ───` banner style for major sections

### Formatting

- 2-space indentation
- Single quotes for strings
- No trailing semicolons are okay, but be consistent within a function
- Keep lines under 120 characters when practical

### Don'ts

- ❌ Don't add jQuery, React, Vue, or any framework
- ❌ Don't add a build step (webpack, rollup, etc.)
- ❌ Don't add npm/node_modules
- ❌ Don't introduce external API calls or network requests
- ❌ Don't access user data beyond what's needed for context extraction

---

## Testing

Since ContextFlow has no build step or test framework, testing is manual but methodical:

### Before Submitting a PR

1. **Load the extension** in Chrome via Developer Mode
2. **Test on the affected platform(s)**:
   - Navigate to the AI platform
   - Have a conversation (at least 3-4 turns)
   - Click ⚡ Save Context — verify the capsule is created correctly
   - Open the popup — verify the capsule appears with correct title, tags, and platform
   - Click ⚡ Inject on a different AI platform — verify the text is inserted
3. **Test edge cases**:
   - Empty conversations (no messages yet)
   - Very long conversations (20+ turns)
   - Conversations with code blocks
   - Pages that haven't fully loaded
4. **Test existing platforms still work** — don't break other extractors
5. **Check the browser console** for errors (`F12` → Console tab)
6. **Test keyboard shortcuts**: `Ctrl+Shift+S` (capture) and `Ctrl+Shift+K` (toggle panel)

### Testing Checklist

- [ ] Extension loads without errors in `chrome://extensions/`
- [ ] No console errors on supported platforms
- [ ] Capture works on affected platform(s)
- [ ] Inject works on affected platform(s)
- [ ] Popup displays capsules correctly
- [ ] Export/import still functions
- [ ] No regressions on other platforms

---

## Submitting a Pull Request

### PR Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/add-newplatform-extractor
   ```
2. **Make your changes** — keep commits focused and well-described
3. **Test thoroughly** (see [Testing](#testing) above)
4. **Push** to your fork:
   ```bash
   git push origin feature/add-newplatform-extractor
   ```
5. **Open a Pull Request** against the `main` branch
6. **Fill out the PR template** completely

### PR Guidelines

- **One feature per PR** — don't bundle unrelated changes
- **Descriptive title** — e.g., "Add Mistral AI extractor" not "Update content.js"
- **Reference issues** — link to any related issue (e.g., "Closes #42")
- **Include screenshots** for UI changes
- **Keep it small** — smaller PRs are reviewed faster
- **Update CHANGELOG.md** for user-facing changes

### What We Look For

- ✅ Code follows the project's style guidelines
- ✅ No new dependencies introduced
- ✅ Existing functionality isn't broken
- ✅ Changes are well-tested
- ✅ Documentation is updated if needed

---

## Reporting Issues

### Bug Reports

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:
- Browser and version (e.g., Chrome 126)
- Extension version (shown in popup footer)
- Which AI platform the bug occurred on
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or console errors

### Feature Requests

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and describe:
- What you'd like to see
- Why it would be useful
- How you envision it working

### Platform Requests

Want ContextFlow to support a new AI platform? Use the [Platform Request template](.github/ISSUE_TEMPLATE/platform_request.md).

---

## Community

- Be respectful and constructive — see our [Code of Conduct](CODE_OF_CONDUCT.md)
- Ask questions in GitHub Discussions or Issues
- Help others who are stuck — great way to contribute without writing code!

---

**Thank you for making ContextFlow better for everyone! 🚀**
