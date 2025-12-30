## ADDED Requirements

### Requirement: Anti-Adblock Popup Removal
The system SHALL detect and close YouTube's "Ad blockers violate YouTube's Terms of Service" enforcement dialogs.

#### Scenario: Detect and close popup
- **WHEN** a `ytd-enforcement-message-view-model` dialog appears
- **THEN** the system simulates a click on the dismiss button
- **AND** unpauses the video if it was paused

### Requirement: Scroll & Interaction Unlock
The system SHALL restore scrolling and user interaction if the specific anti-adblock modal locks the page.

#### Scenario: Unlock page
- **WHEN** the enforcement dialog is closed
- **THEN** the `overflow` properties on `body` and `ytd-app` are reset to `auto`
- **AND** the backdrop overlay is removed

### Requirement: Popup Whitelist
The system SHALL distinguish between legitimate dialogs (Membership join, Report, Menu) and adblock enforcement dialogs to avoid false positives.

#### Scenario: Whitelist check
- **WHEN** a "Join Membership" dialog appears
- **THEN** the system ignores it based on the presence of `ytd-sponsorships-offer-renderer`
