# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- None

### Changed
- None

### Fixed
- None

---

## [1.6.2] - 2026-01-04

### Changed
- **Default Language**: Changed fallback language from English to Traditional Chinese (zh-TW)
- Language detection now explicitly checks for English before falling back
- Non-supported languages (French, German, etc.) now default to Traditional Chinese

---

## [1.6.1] - 2026-01-04

### Added
- **Notification New Tab**: Force notification clicks to open in new tabs
- New menu option: "強制新分頁 (通知)" / "Force New Tab (Notif)"

### Changed
- Updated i18n strings for notification feature across all 4 languages

---

## [1.6.0] - 2025-12-26

### Added
- 🚀 **Complete Architecture Rewrite**: Modular ES6 class-based design
- 🌐 **Internationalization (i18n)**: Full support for zh-TW, zh-CN, en, ja
- 📊 **Filter Statistics Panel**: Visualize filtered content counts
- 💾 **Settings Export/Import**: Backup and restore configurations
- 🛡️ **Anti-Adblock Guard 2.0**: Whitelist mechanism to avoid false positives
- ⚡ **Performance Optimization**: `requestIdleCallback` and smart debouncing

### Changed
- Reorganized codebase into 10+ focused modules
- Improved selector resilience for YouTube A/B tests

### Fixed
- Resolved false positive on membership join dialogs

---

## [1.5.7] - 2025-12-20

### Added
- Support for new YouTube layout (`yt-lockup-view-model`)

### Changed
- Updated metadata parser for new DOM structure
- Updated duration parser accuracy

---

## [1.5.6] - 2025-12-15

### Fixed
- Restored all v1.4.0 features that were accidentally removed in v1.5.x

---

## [1.5.2] - 2025-12-10

### Changed
- Deep refactoring of core filtering engine
- Enhanced anti-detection mechanisms

### Fixed
- Performance improvements for scrolling

---

## [1.4.0] - 2025-11-01

### Added
- Initial public release with 15+ filter rules
- Low view count filtering with grace period
- Keyword and channel blacklist
- Duration filtering
- Anti-adblock popup removal
- New tab opening for videos

---

[Unreleased]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.6.2...HEAD
[1.6.2]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.5.7...v1.6.0
[1.5.7]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.5.6...v1.5.7
[1.5.6]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.5.2...v1.5.6
[1.5.2]: https://github.com/bennytsai1234/youtube-homepage-cleaner/compare/v1.4.0...v1.5.2
[1.4.0]: https://github.com/bennytsai1234/youtube-homepage-cleaner/releases/tag/v1.4.0
