# i18n Specification

## Purpose

The Internationalization (i18n) capability provides multi-language support for the userscript's user interface and ensures correct parsing of localized content from YouTube. It handles language detection, string localization, and numeric unit conversion across different locales.

---

## Requirements

### Requirement: Multi-language Support

The system SHALL support multiple interface languages and automatically detect the user's preference.

#### Scenario: Language Detection
- **WHEN** the script initializes
- **THEN** it detects the language from `document.documentElement.lang` or `navigator.language`
- **AND** falls back to Traditional Chinese (zh-TW) if detection fails or is unsupported

#### Scenario: Supported Languages
- **GIVEN** the system supports:
  - `zh-TW` (Traditional Chinese)
  - `zh-CN` (Simplified Chinese)
  - `en` (English)
  - `ja` (Japanese)

#### Scenario: Manual Language Override
- **WHEN** a user manually selects a language from the settings menu
- **THEN** that language is persisted and used on subsequent visits
- **AND** overrides automatic detection

---

### Requirement: Numeric Localization

The system SHALL parse and normalize view counts and time units across different languages (e.g., "1.2萬", "50K", "1.2億").

#### Scenario: Parse Chinese Units
- **WHEN** parsing "1.2萬觀看"
- **THEN** it is correctly interpreted as 12,000 views

#### Scenario: Parse English Units
- **WHEN** parsing "50K views"
- **THEN** it is correctly interpreted as 50,000 views

#### Scenario: Parse Japanese Units
- **WHEN** parsing "1.2万回視聴"
- **THEN** it is correctly interpreted as 12,000 views

#### Scenario: Parse Korean Units
- **WHEN** parsing "5만회"
- **THEN** it is correctly interpreted as 50,000 views

---

### Requirement: Time Ago Parsing

The system SHALL correctly parse relative time strings (e.g., "2 hours ago", "3 天前") to calculate video upload time.

#### Scenario: Parse English Time
- **WHEN** parsing "2 hours ago"
- **THEN** it returns 120 minutes

#### Scenario: Parse Chinese Time
- **WHEN** parsing "3 天前"
- **THEN** it returns 4320 minutes (3 days)

#### Scenario: Parse Japanese Time
- **WHEN** parsing "1 週間前"
- **THEN** it returns 10080 minutes (1 week)
