## ADDED Requirements

### Requirement: Open in New Tab
The system SHALL optionally force all video, shorts, and playlist clicks to open in a new browser tab, bypassing YouTube's SPA (Single Page Application) navigation.

#### Scenario: Click video thumbnail
- **WHEN** "Open in New Tab" is enabled
- **AND** user left-clicks a video thumbnail
- **THEN** the link opens in a `_blank` window
- **AND** the default SPA navigation event is prevented

### Requirement: New Tab Exclusion
The system SHALL NOT interfere with non-video interaction elements like menus, buttons, or scrubber bars.

#### Scenario: Click menu button
- **WHEN** user clicks the "three dots" menu button on a video card
- **THEN** the menu opens in-place normally
