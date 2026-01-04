# Notification Control Spec

## ADDED Requirements

### Requirement: Open Notifications in New Tab
The system SHALL allow users to configure notification clicks to open in a new tab instead of navigating in the current page.

#### Scenario: User enables "Open in New Tab"
- **Given** the user has enabled the "Open Notifications in New Tab" setting
- **And** the notification menu is open
- **When** the user clicks on any notification item (`ytd-notification-renderer`)
- **Then** the link should open in a new browser tab (`target="_blank"`)
- **And** the current page should remain undisturbed

#### Scenario: User disables "Open in New Tab"
- **Given** the user has disabled the setting
- **When** the user clicks a notification
- **Then** YouTube's default navigation behavior (current tab) should occur
