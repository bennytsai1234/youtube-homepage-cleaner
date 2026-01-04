# ADR-005: 原生 UI 優於自訂模態 | Native UI Over Custom Modal

| 項目 | 內容 |
|------|------|
| **狀態** | ✅ Accepted |
| **日期** | 2025-12-01 |
| **決策者** | Benny, AI Collaborators |

---

## Context | 背景

userscript 需要提供設定介面讓使用者調整過濾規則。我們需要決定 UI 的實作方式。

### 選項 | Options

| 選項 | 描述 |
|------|------|
| **A. 瀏覽器原生 UI** | 使用 `prompt()`, `alert()`, `confirm()` |
| **B. Tampermonkey 選單** | 使用 `GM_registerMenuCommand` |
| **C. 自訂 HTML Modal** | 自行建立浮動視窗 |
| **D. 仿 YouTube 原生 UI** | 模擬 YouTube 的設計風格 |

---

## Decision | 決策

**採用 Tampermonkey 選單 + 瀏覽器原生對話框 (選項 A + B)**

### 具體實作

| 功能 | UI 方式 |
|------|---------|
| 主選單 | Tampermonkey 選單 |
| 切換開關 | 選單項目 (✅/❌ 狀態) |
| 數值輸入 | `prompt()` |
| 確認動作 | `confirm()` |
| 資訊顯示 | `alert()` |
| 列表編輯 | `prompt()` + 解析 |

---

## Consequences | 後果

### 正面 | Positive

- 🔧 **零維護成本**: 不需要處理 CSS、z-index、響應式設計
- 🛡️ **穩定性**: 不受 YouTube DOM 變化影響
- 📱 **跨瀏覽器相容**: 原生 API 在所有瀏覽器運作一致
- 📦 **程式碼精簡**: 不需要額外的 HTML/CSS
- ♿ **無障礙**: 原生對話框支援螢幕閱讀器
- ⚡ **效能**: 無需載入額外資源

### 負面 | Negative

- 🎨 **外觀有限**: 無法自訂對話框樣式
- 🖼️ **視覺體驗**: 看起來較為「老派」
- 📋 **功能限制**: 無法實現複雜的表單互動
- 🔄 **阻斷式**: prompt/alert 會阻斷使用者操作

---

## 被拒絕的選項 | Rejected Options

### 自訂 HTML Modal

```
❌ 拒絕原因:
1. 維護成本高 - 需要處理 z-index 與 YouTube 彈窗衝突
2. 樣式維護 - YouTube 主題變化需要跟進
3. 程式碼膨脹 - 增加數百行 HTML/CSS
4. 潛在衝突 - 可能與其他 userscript 或擴充功能衝突
```

### 仿 YouTube 原生 UI

```
❌ 拒絕原因:
1. 極高維護成本 - YouTube UI 經常改版
2. 版權考量 - 可能侵犯 YouTube 設計版權
3. 複雜度過高 - 不符合專案簡約原則
4. 容易失效 - A/B 測試可能破壞樣式相容性
```

---

## 使用者體驗考量 | UX Considerations

### 選單組織

```
📂 設定過濾規則
    ├─ ✅ 廣告阻擋彈窗
    ├─ ✅ 廣告/贊助
    ├─ ✅ Shorts 項目
    └─ ...

🔢 設定閾值
    ├─ 低觀看數: 1000
    └─ 時長範圍: 0-60 分鐘

🚫 進階過濾
    ├─ 關鍵字過濾
    └─ 頻道過濾
```

### 多語言支援

所有選單項目和對話框訊息都透過 `I18N` 模組翻譯：

```javascript
const text = I18N.t('menu_threshold'); // "🔢 設定閾值" / "🔢 Set Threshold"
```

---

## 未來可能的改變 | Future Considerations

若使用者強烈要求更好的 UI，可考慮：

1. **Settings Page**: 建立獨立的設定頁面 (`about:blank` 或專用 URL)
2. **Web Component**: 使用 Shadow DOM 隔離樣式
3. **Browser Extension**: 轉型為完整的瀏覽器擴充功能

但目前評估，原生 UI 已足夠滿足 90% 使用者需求。

---

## References | 參考資料

- [Window.prompt() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/prompt)
- [GM_registerMenuCommand - Tampermonkey](https://www.tampermonkey.net/documentation.php#api:GM_registerMenuCommand)
