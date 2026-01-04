# Design: Default Language Update

## Context
Currently, the script attempts to auto-detect the language based on the browser or YouTube settings (`detectLanguage()`).
The user requests to default to Traditional Chinese (`zh-TW`).

## Decision
- We will modify the `I18N.detectLanguage()` method.
- **Current Logic**: Checks `zh-CN`, `zh`, `ja`. Defaults everything else to `en`.
- **New Logic**:
    1. Check `zh-CN`/`zh-Hans` -> Return `zh-CN`
    2. Check `zh` -> Return `zh-TW`
    3. Check `ja` -> Return `ja`
    4. **Add**: Check `en` -> Return `en` (Explicitly preserve English for English users)
    5. **Fallback**: Return `zh-TW` (For French, German, and other unsupported languages)

- This ensures that while "Default is Chinese" (for the general unknown public), users with explicitly supported languages still get their preferred language.

## Versioning
- Metadata block `@version` will be updated to `1.6.2`.
