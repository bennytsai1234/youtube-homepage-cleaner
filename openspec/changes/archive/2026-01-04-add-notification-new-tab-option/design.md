# Design: Open Notification in New Tab

## Architecture
本功能將整合至現有的 `MutationObserver` 流程中，作為一個新的處理模組或擴充現有的清理邏輯。

### Components
1.  **ConfigManager Update**:
    - 新增設定鍵值: `OPEN_NOTIFICATIONS_IN_NEW_TAB` (Boolean, default: `true` or based on user preference).
    - 選單需新增對應開關。

2.  **DOM Handler**:
    - 監聽目標: `ytd-notification-renderer` 及其內部的 `a.yt-simple-endpoint`。
    - 行為: 當偵測到通知節點時，檢查其錨點標籤 (`<a>`)。
    - 操作: 若設定開啟，強制加入 `target="_blank"` 屬性，並可能需要移除 Polymer 內建的導航攔截 (雖然 `target="_blank"` 通常優先權較高)。

### Technical Constraints
- **Shadow DOM / Polymer**: 需確認直接修改 `<a>` 標籤是否會被 YouTube 的事件委派 (Event Delegation) 覆蓋。
    - 驗證方法: 實作後測試點擊是否觸發 `SPF` (Single Page Navigation) 或開啟新視窗。
- **Performance**: 通知欄位項目較多，需確保處理邏輯輕量且經過 Debounce 處理。

## User Interface
- 在 Tampermonkey 選單中新增「通知：新分頁開啟」選項。
