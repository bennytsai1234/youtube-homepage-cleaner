# Change: Reverse Engineer Specs

## Why
The project lacks comprehensive OpenSpec documentation reflecting the current codebase state. To enable spec-driven development, we need to populate the `specs/` directory with the existing capabilities.

## What Changes
- Create `specs/core-filtering/spec.md`: Logic for video analysis and hiding (views, duration, keywords).
- Create `specs/ui-cleaning/spec.md`: Static CSS rules for hiding elements (Shorts shelf, ads).
- Create `specs/adblock-guard/spec.md`: Anti-adblock evasion logic.
- Create `specs/interaction/spec.md`: UX enhancements like "Open in New Tab".
- Create `specs/i18n/spec.md`: Internationalization support.

## Impact
- Affected specs: All new specs.
- Affected code: None (Documentation only).
