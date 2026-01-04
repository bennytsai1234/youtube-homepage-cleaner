# Spec: Default Language and Version

## MODIFIED Requirements

#### Requirement: Version 1.6.2
The userscript MUST identify itself as version `1.6.2`.

#### Requirement: Smart Logic with Chinese Fallback
The userscript MUST detect supported languages (`en`, `ja`, `zh-CN`) and switch to them.
The userscript MUST default to Traditional Chinese (`zh-TW`) for any unknown/unsupported system languages.

##### Scenario: Detected English
Given a user with system language set to English (`en-US`)
When the script runs
Then the interface language should be English (`en`)

##### Scenario: Detected Japanese
Given a user with system language set to Japanese (`ja-JP`)
When the script runs
Then the interface language should be Japanese (`ja`)

##### Scenario: Unsupported Language (Fallback)
Given a user with system language set to French (`fr-FR`)
When the script runs
Then the interface language should be Traditional Chinese (`zh-TW`)
