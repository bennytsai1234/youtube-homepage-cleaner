# adblock-guard Specification

## Purpose

The AdBlock Guard capability handles YouTube's anti-adblock enforcement mechanisms. It detects and dismisses the "Ad blockers violate YouTube's Terms of Service" dialog, restores page scrollability, and uses a whitelist to avoid false positives on legitimate dialogs (e.g., membership offers).

---

## Requirements

### Requirement: Anti-Adblock Popup Removal

The system SHALL detect and close YouTube's "Ad blockers violate YouTube's Terms of Service" enforcement dialogs.

#### Scenario: Detect and close popup
- **WHEN** a `ytd-enforcement-message-view-model` dialog appears
- **THEN** the system simulates a click on the dismiss button
- **AND** unpauses the video if it was paused

#### Scenario: Multi-language detection
- **WHEN** the dialog contains text in any supported language:
  - English: "Ad blockers violate YouTube's Terms of Service"
  - Traditional Chinese: "YouTube 禁止使用廣告攔截器"
  - Simplified Chinese: "YouTube 不允许使用广告拦截器"
  - Japanese: "広告ブロッカーは YouTube の利用規約に違反しています"
- **THEN** the dialog is detected and closed

---

### Requirement: Scroll & Interaction Unlock

The system SHALL restore scrolling and user interaction if the specific anti-adblock modal locks the page.

#### Scenario: Unlock page
- **WHEN** the enforcement dialog is closed
- **THEN** the `overflow` properties on `body` and `ytd-app` are reset to `auto`
- **AND** the backdrop overlay is removed

#### Scenario: Restore video playback
- **WHEN** the enforcement dialog is closed
- **AND** the video was automatically paused
- **THEN** video playback is resumed

---

### Requirement: Popup Whitelist

The system SHALL distinguish between legitimate dialogs (Membership join, Report, Menu) and adblock enforcement dialogs to avoid false positives.

#### Scenario: Whitelist check - Membership dialog
- **WHEN** a "Join Membership" dialog appears
- **THEN** the system ignores it based on the presence of `ytd-sponsorships-offer-renderer`

#### Scenario: Whitelist check - Report dialog
- **WHEN** the user opens the "Report" form
- **THEN** the system ignores it based on the presence of `ytd-report-form-modal-renderer`

#### Scenario: Whitelist check - Channel about
- **WHEN** the user opens channel information
- **THEN** the system ignores it based on the presence of `ytd-about-channel-renderer`

---

### Requirement: Throttled Checking

The system SHALL check for anti-adblock popups at a reasonable interval to avoid performance impact.

#### Scenario: Check interval
- **WHEN** the AdBlock Guard is active
- **THEN** it checks for popups every 800ms
- **AND** uses `requestAnimationFrame` for efficient timing
