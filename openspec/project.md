# Project Context

## Purpose
A Tampermonkey userscript designed to purify the YouTube homepage by removing Shorts, commercials, low-view videos, and other clutter elements. The goal is to restore a clean, focused viewing experience while bypassing anti-adblock detection mechanisms.

## Tech Stack
- **JavaScript (ES6+)**: Core logic, no external framework dependencies.
- **Tampermonkey API**: Used for script injection, menu registration (`GM_registerMenuCommand`), and storage (`GM_getValue`/`GM_setValue`).
- **CSS3**: For high-performance static element filtering.
- **GitHub**: Source of truth for updates and issue tracking.

## Project Conventions

### Code Style
- **Standard JS**: Semicolons, camelCase variables.
- **Classes**: Use ES6 classes for modular logic (e.g., `ConfigManager`, `StyleManager`).
- **Constants**: Uppercase with underscores (e.g., `SELECTORS`, `RULE_ENABLES`).
- **JSDoc**: Use basic JSDoc for complex functions.

### Architecture Patterns
- **Modular Design**: Logic split into distinct modules (Config, Utils, Logger, Stats, Style, AdBlockGuard).
- **Centralized Selectors**: All DOM selectors are defined in a single `SELECTORS` object to ease maintenance when YouTube updates its DOM.
- **Hybrid Filtering**:
    - **Static CSS**: For performance-critical hiding.
    - **Dynamic JS**: For logic-based filtering (e.g., view counts, duration).
- **Debouncing**: `MutationObserver` callbacks are debounced to prevent performance degradation.

### Testing Strategy
- **Manual Testing**: Verifying on live YouTube execution contexts (Home, Watch Page, Search Results).
- **A/B Test Resilience**: Code should handle multiple potential DOM structures (e.g., `ytd-rich-item-renderer` vs `yt-lockup-view-model`).

### Git Workflow
- **`beta` branch**: For development and testing of new features.
- **`main` branch**: Stable releases only. Merged from `beta`.
- **Tags**: SemVer tags (e.g., `v1.6.0`) for releases.
- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, etc.

## Domain Context
- **YouTube DOM**: Highly dynamic, uses Polymer/web-components. Elements often have randomized or obfuscated classes.
- **SPA Navigation**: YouTube uses SPF (Structured Page Fragments) for navigation. The script must listen for `yt-navigate-finish` or similar events to re-apply logic.
- **Anti-Adblock**: YouTube aggressively detects blockers. The script uses an `AdBlockGuard` to hide enforcement popups without triggering detection loops.

## Important Constraints
- **Performance**: Script must not slow down initial page load or scrolling. Use `requestIdleCallback` where possible.
- **Permissions**: Minimize required permissions in the userscript header.

## External Dependencies
- **None**: Zero external runtime dependencies to ensure privacy and speed.
