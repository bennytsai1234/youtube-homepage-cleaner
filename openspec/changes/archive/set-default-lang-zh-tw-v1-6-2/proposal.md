# Proposal: Update to v1.6.2 and Default to Traditional Chinese

## Description
Update the userscript version to 1.6.2 and change the fallback language to Traditional Chinese (zh-TW).
The system will still automatically detect and switch to supported languages (English, Japanese, Simplified Chinese), but will default to Traditional Chinese for any unsupported system languages (previously defaulted to English).

## Objectives
- Bump version to `1.6.2`.
- Update `detectLanguage()` logic:
    - Add explicit detection for English (`en`).
    - Change global fallback from `en` to `zh-TW`.

## Scope
- `youtube-homepage-cleaner.user.js`: `I18N` module (`detectLanguage` method).
