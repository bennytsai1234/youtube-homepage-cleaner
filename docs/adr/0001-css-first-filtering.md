# ADR-001: CSS 優先過濾策略 | CSS-First Filtering Strategy

| 項目 | 內容 |
|------|------|
| **狀態** | ✅ Accepted |
| **日期** | 2025-11-01 |
| **決策者** | Benny, AI Collaborators |

---

## Context | 背景

YouTube 首頁包含大量需要隱藏的元素（廣告、Shorts、推薦區塊等）。我們需要選擇一種高效的過濾策略，需考慮：

1. **效能**: 不能影響頁面載入和捲動流暢度
2. **可靠性**: YouTube 的 DOM 結構會變化
3. **維護性**: 規則需要容易更新
4. **閃爍問題**: 要避免元素先出現再消失的視覺問題

### 選項考量 | Options Considered

| 選項 | 優點 | 缺點 |
|------|------|------|
| **A. 純 JavaScript** | 邏輯靈活 | 效能差，有閃爍 |
| **B. 純 CSS** | 效能最佳，無閃爍 | 無法處理複雜邏輯 |
| **C. CSS 優先 + JS 補充** | 兼顧效能和彈性 | 複雜度較高 |

---

## Decision | 決策

**採用 CSS 優先過濾策略 (選項 C)**

### 策略層級

```
第一層 (CSS):
  - 使用 `display: none !important`
  - 適用於有穩定選擇器的元素
  - 注入於 document-start，無閃爍

第二層 (CSS :has()):
  - 適用於需要根據子元素判斷的容器
  - 例如: `ytd-rich-item-renderer:has(a[href*="/shorts/"])`

第三層 (JavaScript):
  - 僅用於需要數值計算的邏輯
  - 例如: 觀看數過濾、時長過濾
  - 使用 MutationObserver + Debounce
```

---

## Consequences | 後果

### 正面 | Positive

- ⚡ **極致效能**: CSS 規則由瀏覽器原生處理，比 JS 快 10-100x
- 👁️ **無閃爍**: CSS 在渲染前就生效，使用者看不到元素消失
- 🔧 **易維護**: 大多數規則只需修改 CSS 選擇器
- 📱 **低記憶體**: 靜態 CSS 不需要持續執行

### 負面 | Negative

- 🔢 **複雜邏輯限制**: CSS 無法處理數值比較（觀看數）
- 🌐 **:has() 支援**: 需要較新瀏覽器（Chrome 105+, Firefox 121+）
- 📝 **雙重維護**: 部分規則需要 CSS 和 JS 兩套實作

### 中性 | Neutral

- 需要清楚區分哪些規則適合 CSS、哪些需要 JS
- 開發者需要了解 CSS 優先順序

---

## 實作範例 | Implementation Example

```javascript
// StyleManager: CSS 優先
const cssRules = [];
cssRules.push('ytd-ad-slot-renderer { display: none !important; }');
cssRules.push('ytd-rich-item-renderer:has(a[href*="/shorts/"]) { display: none !important; }');
GM_addStyle(cssRules.join('\n'));

// VideoFilter: JS 補充 (僅用於需要計算的情況)
function filterByViewCount(container) {
    const viewCount = parseViewCount(container);
    if (viewCount && viewCount < threshold) {
        container.style.display = 'none';
    }
}
```

---

## References | 參考資料

- [CSS :has() selector - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/:has)
- [Browser rendering performance - web.dev](https://web.dev/rendering-performance/)
