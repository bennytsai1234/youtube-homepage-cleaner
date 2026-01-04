# Project Context

## 📌 Purpose

A Tampermonkey userscript designed to purify the YouTube homepage by removing Shorts, commercials, low-view videos, and other clutter elements. The goal is to restore a clean, focused viewing experience while bypassing anti-adblock detection mechanisms.

**Target Audience**: YouTube power users who want a distraction-free viewing experience without algorithm-driven recommendations and intrusive elements.

---

## 🛠️ Tech Stack

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **Core Language** | JavaScript | ES6+ (ES2020) | No transpilation needed for modern browsers |
| **Runtime Environment** | Tampermonkey | 5.0+ | Also compatible with Violentmonkey, Greasemonkey |
| **Styling** | CSS3 | N/A | `:has()` selector for modern filtering |
| **VCS** | Git + GitHub | N/A | Source of truth for updates and issue tracking |
| **Package Manager** | None | N/A | Zero external dependencies by design |

### Tampermonkey API Usage

| API | Purpose | Security Implication |
|-----|---------|---------------------|
| `GM_addStyle` | Inject CSS rules | Low - UI only |
| `GM_getValue` / `GM_setValue` | Persist user settings | Low - Local storage |
| `GM_registerMenuCommand` | Create settings menu | None |
| `GM_unregisterMenuCommand` | Dynamic menu updates | None |
| `GM_info` | Script metadata access | None |

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Point (App)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ ConfigManager│  │    I18N      │  │      Logger          │   │
│  │ (State)      │  │ (Localization│  │  (Debug Output)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ StyleManager │  │ VideoFilter  │  │  CustomRuleManager   │   │
│  │ (CSS Rules)  │  │ (Dynamic JS) │  │  (Text Matching)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ AdBlockGuard │  │ Interaction  │  │     UIManager        │   │
│  │ (Anti-popup) │  │ Enhancer     │  │  (Tampermonkey Menu) │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility | Coupling |
|--------|---------------|----------|
| `ConfigManager` | Centralized state management, persistence | Low |
| `I18N` | Language detection, string localization | Low |
| `Utils` | Stateless helpers (parsing, debouncing) | None |
| `Logger` | Conditional console output | None |
| `FilterStats` | Filtering statistics tracking | Low |
| `StyleManager` | CSS rule injection | Medium (uses Config) |
| `VideoFilter` | Dynamic DOM filtering with MutationObserver | Medium |
| `CustomRuleManager` | Text-based rule matching engine | Low |
| `AdBlockGuard` | Anti-adblock popup detection and removal | Low |
| `InteractionEnhancer` | New tab opening behavior | Low |
| `UIManager` | Tampermonkey menu interface | High (orchestrator) |

---

## 📜 Project Conventions

### Code Style

| Rule | Convention | Example |
|------|------------|---------|
| **Semicolons** | Always | `const x = 1;` |
| **Variables** | camelCase | `videoContainer` |
| **Constants** | UPPER_SNAKE_CASE | `SELECTORS`, `RULE_ENABLES` |
| **Classes** | PascalCase | `ConfigManager`, `StyleManager` |
| **Private fields** | Underscore prefix | `_load()`, `_lang` |
| **String quotes** | Single quotes for code | `'use strict'` |
| **Indentation** | 4 spaces | - |

### Documentation Standards

| Type | Format | Required |
|------|--------|----------|
| **AI Responses** | Traditional Chinese (繁體中文) | ✅ Always |
| **Code Comments** | Traditional Chinese (for complex logic) | 🔶 Preferred |
| **Public Documentation** | Bilingual (Chinese + English) | ✅ README |
| **Commit Messages** | English (Conventional Commits) | ✅ Always |
| **JSDoc** | English | 🔶 For public APIs |

### Architecture Patterns

#### 1. Hybrid Filtering Strategy
```
Priority Order:
1. CSS Rules (highest performance, static)
   └─ `:has()` selectors for container-based hiding
2. MutationObserver (dynamic content)
   └─ Debounced callbacks (50-200ms)
3. Text Matching (fallback)
   └─ Regex patterns for shelf/section titles
```

#### 2. Centralized Selector Management
All DOM selectors are defined in a single `SELECTORS` object at the top of the script. This pattern:
- Eases maintenance when YouTube updates its DOM
- Provides a single source of truth
- Enables quick A/B test adaptation

#### 3. Defensive DOM Querying
```javascript
// GOOD: Handle potential null
const element = container.querySelector(':scope a#video-title-link');
if (element?.ariaLabel) { /* safe access */ }

// BAD: Assume element exists
container.querySelector('a').textContent; // May throw
```

---

## 🌐 Domain Context

### YouTube DOM Characteristics

| Aspect | Description | Implication |
|--------|-------------|-------------|
| **Polymer Components** | Custom elements like `ytd-*` | Use shadow DOM-aware selectors |
| **SPA Navigation** | History API, no full page loads | Listen for `yt-navigate-finish` |
| **A/B Testing** | Multiple DOM structures coexist | Support both old and new layouts |
| **Lazy Loading** | Content loads on scroll | MutationObserver is essential |
| **Obfuscated Classes** | Random class names in some elements | Prefer semantic selectors |

### Key Events to Monitor

| Event | Trigger | Use Case |
|-------|---------|----------|
| `yt-navigate-finish` | SPA navigation complete | Re-apply filters |
| `yt-page-data-updated` | Page data refreshed | Update filter state |
| `DOMContentLoaded` | Initial page load | First filter pass |

---

## ⚡ Performance Guidelines

### MUST Follow

| Rule | Rationale |
|------|-----------|
| Use CSS `:has()` over JS when possible | 10-100x faster for static hiding |
| Debounce MutationObserver callbacks | Prevent UI jank during rapid updates |
| Limit `querySelectorAll` scope | Avoid full document scans |
| Use `requestIdleCallback` for non-critical work | Don't block main thread |

### SHOULD Follow

| Rule | Rationale |
|------|-----------|
| Batch DOM reads/writes | Minimize reflows |
| Cache selector results when appropriate | Reduce repeated queries |
| Profile with DevTools before/after changes | Verify performance impact |

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial script execution | < 50ms | `console.time()` |
| Filter pass (100 videos) | < 100ms | DevTools Performance |
| Memory overhead | < 5MB | DevTools Memory |

---

## 🔒 Security & Privacy

### Data Handling

| Data Type | Storage | Transmission | Retention |
|-----------|---------|--------------|-----------|
| User preferences | Local (`GM_setValue`) | Never | Until cleared |
| Filter statistics | Memory only | Never | Session only |
| Browsing activity | Never collected | Never | N/A |

### Permission Minimization

The script requests ONLY the following Tampermonkey grants:
- `GM_addStyle` - Required for CSS injection
- `GM_getValue` / `GM_setValue` - Required for settings persistence
- `GM_registerMenuCommand` - Required for settings UI
- `GM_info` - Required for version display

**No network permissions** (`GM_xmlhttpRequest`) are requested.

---

## 🔄 Git Workflow

### Branch Strategy

```
main ─────────────────────────────────────── Stable releases
  │
  └─── beta ──────────────────────────────── Development/Testing
         │
         ├─── feature/add-xyz ────────────── Feature branches
         └─── fix/issue-123 ──────────────── Bug fix branches
```

### Commit Convention (Conventional Commits)

| Type | Description | Example |
|------|-------------|---------|
| `feat:` | New feature | `feat: add duration filter` |
| `fix:` | Bug fix | `fix: resolve CSS selector for new layout` |
| `perf:` | Performance improvement | `perf: optimize MutationObserver callback` |
| `refactor:` | Code restructure | `refactor: extract Utils module` |
| `docs:` | Documentation | `docs: update README installation guide` |
| `chore:` | Maintenance | `chore: update metadata version` |
| `style:` | Code style (no logic change) | `style: fix indentation` |

### Release Process

1. Develop on `beta` branch
2. Test thoroughly on live YouTube
3. Merge to `main` via PR (or direct if solo)
4. Tag release: `git tag v1.6.2`
5. Push: `git push origin main --tags`

---

## 📁 Directory Structure

```
youtube-homepage-cleaner/
├── .agent/                      # AI agent configuration
│   └── workflows/               # Automated workflows
├── assets/                      # Images and media
│   └── banner.png
├── docs/                        # Extended documentation
│   └── adr/                     # Architecture Decision Records
├── openspec/                    # Spec-driven development
│   ├── project.md               # This file
│   ├── AGENTS.md                # OpenSpec instructions
│   ├── specs/                   # Current specifications
│   │   ├── adblock-guard/
│   │   ├── core-filtering/
│   │   ├── i18n/
│   │   ├── interaction/
│   │   ├── localization/
│   │   ├── notification-control/
│   │   └── ui-cleaning/
│   └── changes/                 # Proposed changes
│       └── archive/             # Completed changes
├── youtube-homepage-cleaner.user.js  # Main script
├── README.md                    # User-facing documentation
├── README-greasyfork.md         # GreasyFork version
├── CHANGELOG.md                 # Version history
├── CONTRIBUTING.md              # Contribution guide
├── SECURITY.md                  # Security policy
├── GEMINI.md                    # AI collaboration rules
├── AGENTS.md                    # Root agent config
└── LICENSE                      # MIT License
```

---

## 🧪 Testing Strategy

### Manual Testing Checklist

| Context | Test Cases |
|---------|------------|
| **Homepage** | Shorts hidden, ads hidden, low-view filter works |
| **Watch Page** | Related videos filtered, anti-adblock active |
| **Search Results** | Shorts/ads hidden, playlist hiding respects settings |
| **Channel Page** | Playlists NOT hidden (intentional) |
| **SPA Navigation** | Filters re-apply on navigation |

### A/B Test Resilience

YouTube frequently tests multiple layouts. The script MUST handle:
- `ytd-rich-item-renderer` (traditional layout)
- `yt-lockup-view-model` (new 2024+ layout)
- Both layouts simultaneously on the same page

---

## 📚 External References

- [Tampermonkey Documentation](https://www.tampermonkey.net/documentation.php)
- [YouTube DOM Structure Analysis](https://github.com/nickyout/youtube-element-reference)
- [OpenSpec Framework](https://github.com/sammcj/openspec)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
