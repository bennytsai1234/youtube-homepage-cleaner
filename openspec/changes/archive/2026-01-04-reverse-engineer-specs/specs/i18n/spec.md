## ADDED Requirements

### Requirement: Multi-language Support
The system SHALL support multiple interface languages and automatically detect the user's preference.

#### Scenario: Language Detection
- **WHEN** the script initializes
- **THEN** it detects the language from `document.documentElement.lang` or `navigator.language`
- **AND** falls back to Traditional Chinese (zh-TW) if detection fails or is unsupported

#### Scenario: Supported Languages
- **GIVEN** the system supports `zh-TW` (Traditional Chinese)
- **AND** `zh-CN` (Simplified Chinese)
- **AND** `en` (English)
- **AND** `ja` (Japanese)

### Requirement: Numeric Localization
The system SHALL parse and normalize view counts and time units across different languages (e.g., "1.2萬", "50K", "1.2億").

#### Scenario: Parse Chinese Units
- **WHEN** parsing "1.2萬觀看"
- **THEN** it is correctly interpreted as 12,000 views
