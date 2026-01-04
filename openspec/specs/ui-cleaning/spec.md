# ui-cleaning Specification

## Purpose
TBD - created by archiving change reverse-engineer-specs. Update Purpose after archive.
## Requirements
### Requirement: Static Ad Hiding
The system SHALL use CSS rules to hide sponsored content, banners, and ad slots immediately upon page load.

#### Scenario: Hide home banner
- **WHEN** the homepage loads
- **THEN** elements matching `.ytd-ad-slot-renderer` or `#masthead-ad` are hidden via `display: none !important`

### Requirement: Component Toggle
The system SHALL allow users to toggle visibility for specific UI components (Shorts shelf, Community posts, Breaking News).

#### Scenario: Hide Shorts shelf
- **WHEN** the "Shorts Section" rule is enabled
- **THEN** `ytd-rich-shelf-renderer` containers containing Shorts are hidden via CSS `:has()` selector

### Requirement: Playlist Recommendation Hiding
The system SHALL optionally hide "Recommended Playlists" on the homepage while preserving playlist functionality on channel pages.

#### Scenario: Hide homepage playlists
- **WHEN** on the homepage (`page-subtype="home"`)
- **THEN** playlist items in the rich grid are hidden

