## ADDED Requirements

### Requirement: Low View Count Filtering
The system SHALL hide videos that do not meet a configurable view count threshold to filter out low-quality content.

#### Scenario: Hide low view video
- **WHEN** a video has 500 views
- **AND** the threshold is set to 1000
- **AND** the video is older than the grace period (4 hours)
- **THEN** the video container is hidden

#### Scenario: Live video exemption logic
- **WHEN** a live stream has low viewers
- **THEN** it is filtered immediately without a grace period check

### Requirement: Duration Filtering
The system SHALL support filtering videos based on minimum and maximum duration constraints.

#### Scenario: Hide too short video
- **WHEN** duration filtering is enabled
- **AND** a video is 2 minutes long
- **AND** minimum duration is set to 5 minutes
- **THEN** the video is hidden

### Requirement: Keyword and Channel Blacklist
The system SHALL hide videos if their title or channel name matches user-defined keywords.

#### Scenario: Keyword match
- **WHEN** a video title contains a blacklisted keyword (e.g., "crypto")
- **THEN** the video is hidden
