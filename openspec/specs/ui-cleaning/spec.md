# ui-cleaning Specification

## Purpose

The UI Cleaning capability handles static CSS-based element hiding on YouTube. It uses high-performance CSS rules (including modern `:has()` selectors) to remove unwanted UI elements such as ads, banners, and recommendation shelves before they are rendered, ensuring a clean viewing experience without visual flicker.

---

## Requirements

### Requirement: Static Ad Hiding

The system SHALL use CSS rules to hide sponsored content, banners, and ad slots immediately upon page load.

#### Scenario: Hide home banner
- **WHEN** the homepage loads
- **THEN** elements matching `.ytd-ad-slot-renderer` or `#masthead-ad` are hidden via `display: none !important`

#### Scenario: Hide in-feed ads
- **WHEN** scrolling through the video feed
- **THEN** ad slots (`ytd-ad-slot-renderer`) are immediately hidden

#### Scenario: Hide premium promotion
- **WHEN** a Premium promotion banner appears
- **THEN** `ytd-statement-banner-renderer` is hidden

---

### Requirement: Component Toggle

The system SHALL allow users to toggle visibility for specific UI components (Shorts shelf, Community posts, Breaking News).

#### Scenario: Hide Shorts shelf
- **WHEN** the "Shorts Section" rule is enabled
- **THEN** `ytd-rich-shelf-renderer` containers containing Shorts are hidden via CSS `:has()` selector

#### Scenario: Hide community posts
- **WHEN** the "Community Posts" rule is enabled
- **THEN** sections containing "貼文" or "Posts" are hidden

#### Scenario: Hide breaking news
- **WHEN** the "News Block" rule is enabled
- **THEN** sections containing "新聞快報" or "Breaking News" are hidden

#### Scenario: Rule independence
- **WHEN** user disables the "Shorts Section" rule
- **AND** enables the "Shorts Items" rule
- **THEN** Shorts are hidden only within video grids, not as section headers

---

### Requirement: Playlist Recommendation Hiding

The system SHALL optionally hide "Recommended Playlists" on the homepage while preserving playlist functionality on channel pages.

#### Scenario: Hide homepage playlists
- **WHEN** on the homepage (`page-subtype="home"`)
- **THEN** playlist items in the rich grid are hidden

#### Scenario: Preserve channel playlists
- **WHEN** on a channel page
- **THEN** playlist sections are NOT hidden

---

### Requirement: Shorts Item Hiding

The system SHALL hide individual Shorts items in video grids.

#### Scenario: Hide Shorts in search results
- **WHEN** "Shorts Items" rule is enabled
- **AND** searching for a term
- **THEN** individual Shorts results are hidden

#### Scenario: Hide Shorts in grid
- **WHEN** "Shorts Items" rule is enabled
- **AND** browsing the homepage
- **THEN** Shorts items interspersed with regular videos are hidden

---

### Requirement: Mix/Compilation Hiding

The system SHALL hide YouTube Mix playlists.

#### Scenario: Hide Mix playlists
- **WHEN** "Mix Playlists" rule is enabled
- **THEN** items with labels containing "合輯" or "Mix" are hidden
