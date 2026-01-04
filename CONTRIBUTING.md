# 貢獻指南 | Contributing Guide

感謝您對 YouTube Cleaner 的興趣！本文件將引導您如何參與本專案的開發。

Thank you for your interest in YouTube Cleaner! This document will guide you through contributing to this project.

---

## 📋 目錄 | Table of Contents

- [行為準則](#-行為準則--code-of-conduct)
- [如何貢獻](#-如何貢獻--how-to-contribute)
- [開發環境設置](#-開發環境設置--development-setup)
- [程式碼規範](#-程式碼規範--code-standards)
- [提交變更](#-提交變更--submitting-changes)
- [問題回報](#-問題回報--reporting-issues)

---

## 🤝 行為準則 | Code of Conduct

請保持友善、尊重和專業。我們歡迎所有人的貢獻，無論經驗水平如何。

Please be friendly, respectful, and professional. We welcome contributions from everyone regardless of experience level.

---

## 🎯 如何貢獻 | How to Contribute

### 貢獻類型 | Types of Contributions

| 類型 | 描述 | 難度 |
|------|------|------|
| 🐛 **Bug 修復** | 修復已知問題 | ⭐ 入門 |
| 📝 **文檔改進** | 改善 README、註釋 | ⭐ 入門 |
| 🌐 **翻譯** | 新增語言支援 | ⭐⭐ 中等 |
| ✨ **新功能** | 新增過濾規則或功能 | ⭐⭐⭐ 進階 |
| 🏗️ **架構改進** | 重構或效能優化 | ⭐⭐⭐ 進階 |

### 開始之前 | Before You Start

1. **查看現有 Issues**: 確認問題尚未被報告或解決
2. **開啟 Discussion**: 對於較大的變更，先討論方向
3. **理解架構**: 閱讀 `openspec/project.md` 了解專案結構

---

## 💻 開發環境設置 | Development Setup

### 必要工具 | Prerequisites

- **瀏覽器**: Chrome, Firefox, 或 Edge (最新版)
- **腳本管理器**: [Tampermonkey](https://www.tampermonkey.net/) v5.0+
- **編輯器**: VS Code (推薦) 或任何支援 JavaScript 的編輯器
- **Git**: 版本控制

### 本地開發流程 | Local Development

```bash
# 1. Fork 並 Clone 專案
git clone https://github.com/YOUR_USERNAME/youtube-homepage-cleaner.git
cd youtube-homepage-cleaner

# 2. 建立分支
git checkout -b feature/your-feature-name

# 3. 在 Tampermonkey 中開啟「允許存取檔案網址」
#    Chrome: chrome://extensions -> Tampermonkey -> Details -> Allow access to file URLs

# 4. 在 Tampermonkey 中建立新腳本，使用 @require 指向本地檔案
#    // @require file:///C:/path/to/youtube-homepage-cleaner.user.js

# 5. 開發並測試
# 6. 提交變更
git add .
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
```

### 測試清單 | Testing Checklist

在提交 PR 之前，請確保：

- [ ] 在 YouTube 首頁測試
- [ ] 在播放頁面測試
- [ ] 在搜尋結果頁面測試
- [ ] 使用不同的過濾設定測試
- [ ] 確認沒有 Console 錯誤
- [ ] 確認效能沒有明顯下降

---

## 📏 程式碼規範 | Code Standards

### JavaScript 風格 | JavaScript Style

```javascript
// ✅ GOOD: 使用分號，單引號，camelCase
const videoContainer = document.querySelector('#content');
if (videoContainer?.classList.contains('active')) {
    processVideo(videoContainer);
}

// ❌ BAD: 缺少分號，雙引號混用
const video_container = document.querySelector("#content")
if (video_container.classList.contains("active")) {
    process_video(video_container)
}
```

### 命名規範 | Naming Conventions

| 類型 | 規範 | 範例 |
|------|------|------|
| 變數/函數 | camelCase | `videoContainer`, `parseViewCount` |
| 常數 | UPPER_SNAKE_CASE | `SELECTORS`, `MAX_RETRY` |
| 類別 | PascalCase | `ConfigManager`, `VideoFilter` |
| 私有成員 | 底線前綴 | `_load()`, `_lang` |

### 註釋規範 | Comment Standards

```javascript
// 單行註釋：簡短說明
const threshold = 1000; // 預設觀看數閾值

/**
 * 多行註釋：複雜邏輯說明
 * 使用繁體中文描述業務邏輯
 *
 * @param {Element} container - 影片容器元素
 * @returns {boolean} 是否應該隱藏
 */
function shouldHideVideo(container) {
    // 實作...
}
```

### Commit Message 規範 | Commit Convention

使用 [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat:` 新功能
- `fix:` Bug 修復
- `docs:` 文檔變更
- `style:` 程式碼風格 (不影響功能)
- `refactor:` 重構
- `perf:` 效能優化
- `chore:` 維護性變更

**範例:**
```
feat: add Korean language support

- Added ko-KR translations for all UI strings
- Updated language detection logic
- Added Korean number parsing (천, 만, 억)

Closes #42
```

---

## 📤 提交變更 | Submitting Changes

### Pull Request 流程 | PR Process

1. **建立 PR**: 從你的 fork 到 `bennytsai1234/youtube-homepage-cleaner:main`
2. **填寫描述**: 使用 PR 模板說明變更
3. **等待審核**: 維護者會在 1-3 天內回覆
4. **回應反饋**: 根據審核意見進行修改
5. **合併**: 通過審核後由維護者合併

### PR 描述模板 | PR Template

```markdown
## 變更說明 | Description
簡述這個 PR 做了什麼變更。

## 變更類型 | Type of Change
- [ ] Bug 修復
- [ ] 新功能
- [ ] 文檔更新
- [ ] 重構
- [ ] 其他

## 測試方式 | How to Test
描述如何測試這些變更。

## 相關 Issue | Related Issue
Closes #XX

## 螢幕截圖 | Screenshots (if applicable)
```

---

## 🐛 問題回報 | Reporting Issues

### Bug 回報 | Bug Reports

請包含以下資訊：

1. **環境**: 瀏覽器版本、Tampermonkey 版本、腳本版本
2. **重現步驟**: 如何觸發這個問題
3. **預期行為**: 應該發生什麼
4. **實際行為**: 實際發生了什麼
5. **螢幕截圖**: 如果適用
6. **Console 錯誤**: 如果有的話

### 功能建議 | Feature Requests

請說明：

1. **問題**: 你想解決什麼問題
2. **解決方案**: 你建議的解決方式
3. **替代方案**: 你考慮過的其他方案
4. **使用情境**: 這個功能會在什麼情況下使用

---

## 🏆 貢獻者 | Contributors

感謝所有貢獻者！您的貢獻將會被記錄在 README 中。

Thank you to all contributors! Your contributions will be acknowledged in the README.

---

## ❓ 需要幫助？| Need Help?

- 📖 閱讀 [README](README.md)
- 💬 開啟 [Discussion](https://github.com/bennytsai1234/youtube-homepage-cleaner/discussions)
- 🐛 提交 [Issue](https://github.com/bennytsai1234/youtube-homepage-cleaner/issues)

---

**Happy Contributing! 🎉**
