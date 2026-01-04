# interaction Specification

## Purpose

The Interaction capability enhances user browsing behavior on YouTube. Its primary feature is forcing video links to open in new browser tabs, bypassing YouTube's SPA (Single Page Application) navigation. This preserves the user's current browsing context and watch progress.

---

## Requirements

### Requirement: Open in New Tab

The system SHALL optionally force all video, shorts, and playlist clicks to open in a new browser tab, bypassing YouTube's SPA (Single Page Application) navigation.

#### Scenario: Click video thumbnail
- **WHEN** "Open in New Tab" is enabled
- **AND** user left-clicks a video thumbnail
- **THEN** the link opens in a `_blank` window
- **AND** the default SPA navigation event is prevented

#### Scenario: Click video title
- **WHEN** "Open in New Tab" is enabled
- **AND** user clicks a video title link
- **THEN** the link opens in a new tab

#### Scenario: Click shorts link
- **WHEN** "Open in New Tab" is enabled
- **AND** user clicks a Shorts video link
- **THEN** it opens in a new tab (if Shorts are not hidden)

#### Scenario: Ctrl+Click behavior preserved
- **WHEN** user Ctrl+clicks or middle-clicks a link
- **THEN** normal browser behavior is preserved (new tab regardless of setting)

---

### Requirement: New Tab Exclusion

The system SHALL NOT interfere with non-video interaction elements like menus, buttons, or scrubber bars.

#### Scenario: Click menu button
- **WHEN** user clicks the "three dots" menu button on a video card
- **THEN** the menu opens in-place normally

#### Scenario: Click subscribe button
- **WHEN** user clicks a subscribe button
- **THEN** the subscription action executes normally

#### Scenario: Click progress bar
- **WHEN** user clicks the video progress bar
- **THEN** seeking occurs normally without opening new tab

#### Scenario: Click chip filter
- **WHEN** user clicks a filter chip (e.g., "Gaming", "Music")
- **THEN** the filter is applied in-place

---

### Requirement: Notification New Tab

The system SHALL optionally force notification dropdown links to open in new tabs.

#### Scenario: Click notification item
- **WHEN** "Open Notifications in New Tab" is enabled
- **AND** user clicks a notification item in the dropdown
- **THEN** the notification link opens in a new tab
- **AND** the dropdown remains open

#### Scenario: Feature disabled
- **WHEN** "Open Notifications in New Tab" is disabled
- **AND** user clicks a notification item
- **THEN** normal SPA navigation occurs
