# ADR-004: 集中式選擇器管理 | Centralized Selector Management

| 項目 | 內容 |
|------|------|
| **狀態** | ✅ Accepted |
| **日期** | 2025-12-01 |
| **決策者** | Benny, AI Collaborators |

---

## Context | 背景

YouTube 經常進行 A/B 測試和 UI 更新，導致：

1. DOM 元素的 class 名稱變化
2. 新元素類型出現（如 `yt-lockup-view-model`）
3. 元素層級結構調整
4. 同一功能有多種可能的選擇器

### 痛點 | Pain Points

- 選擇器散落在各處，難以維護
- 更新選擇器需要搜尋整個程式碼
- 容易遺漏某處的選擇器
- 難以知道總共使用了哪些選擇器

---

## Decision | 決策

**建立 `SELECTORS` 常數物件，集中管理所有 DOM 選擇器**

```javascript
const SELECTORS = {
    VIDEO_CONTAINERS: [
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'yt-lockup-view-model',
        // 新選擇器只需在此新增
    ],
    METADATA: {
        TEXT: '.inline-metadata-item, #metadata-line span',
        TITLE_LINKS: ['a#video-title-link', 'a#thumbnail'],
        DURATION: 'ytd-thumbnail-overlay-time-status-renderer',
    },
    // ...更多分類
};
```

---

## Consequences | 後果

### 正面 | Positive

- 🔧 **易維護**: YouTube 更新時，只需修改一處
- 📖 **可讀性**: 清楚看到所有使用的選擇器
- 🧪 **易測試**: 可以單獨驗證選擇器有效性
- 🔄 **A/B 相容**: 容易支援多種 DOM 結構
- 📝 **文件化**: 選擇器本身就是文件

### 負面 | Negative

- 📏 **初期成本**: 需要整理和分類現有選擇器
- 🔗 **間接引用**: 需要透過常數存取，稍微增加程式碼

---

## 選擇器分類 | Selector Categories

| 分類 | 用途 | 範例 |
|------|------|------|
| `VIDEO_CONTAINERS` | 影片卡片容器 | `ytd-rich-item-renderer` |
| `SECTION_CONTAINERS` | 區塊容器 | `ytd-rich-section-renderer` |
| `METADATA` | 影片資訊 | 觀看數、時長、頻道名 |
| `BADGES` | 標記元素 | 廣告、會員、Shorts |
| `INTERACTION_EXCLUDE` | 互動排除 | 按鈕、選單 |
| `CLICKABLE` | 可點擊容器 | 新分頁開啟用 |
| `LINK_CANDIDATES` | 連結元素 | 縮圖、標題連結 |

---

## 使用範例 | Usage Examples

### 取得組合選擇器

```javascript
// 使用 getter 生成組合選擇器
const allContainers = SELECTORS.allContainers;
// => 'ytd-rich-item-renderer, ytd-video-renderer, ...'

document.querySelectorAll(SELECTORS.videoContainersStr);
```

### 多選擇器支援

```javascript
// 支援多種可能的選擇器
for (const selector of SELECTORS.METADATA.TITLE_LINKS) {
    const link = container.querySelector(selector);
    if (link) return link;
}
```

### 新增 A/B 測試支援

```javascript
// YouTube 推出新佈局時，只需新增選擇器
VIDEO_CONTAINERS: [
    'ytd-rich-item-renderer',      // 傳統佈局
    'yt-lockup-view-model',        // 2024 新佈局
    'ytd-compact-video-renderer',  // 播放頁側邊欄
]
```

---

## 維護指南 | Maintenance Guide

### 新增選擇器

1. 確認元素用途，選擇正確的分類
2. 新增到對應的陣列或物件
3. 如果是新分類，建立新的 key
4. 更新相關的 getter (如 `allContainers`)

### 驗證選擇器

```javascript
// 在瀏覽器 Console 驗證
document.querySelectorAll('new-selector').length
```

### 移除過時選擇器

1. 確認 YouTube 已完全棄用該結構
2. 等待 2-4 週確保不是 A/B 測試
3. 移除選擇器並更新 getter

---

## References | 參考資料

- [CSS Selectors Reference - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
- [Selector Performance - CSS Tricks](https://css-tricks.com/efficiently-rendering-css/)
