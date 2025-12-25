# YouTube 淨化大師 - Beta 開發計劃

## 📋 概述

此分支用於開發和測試新功能，穩定後將合併至 `main` 分支。

**Beta 安裝連結**：
```
https://raw.githubusercontent.com/bennytsai1234/youtube-homepage-cleaner/beta/youtube-homepage-cleaner.user.js
```

---

## 🎯 開發目標

### Phase 1: 架構優化 (v2.0.0-beta.1) ✅ 已完成

- [x] **統一選擇器管理 (SELECTORS)**
  - 建立 `SELECTORS` 常量物件
  - 集中管理所有 CSS 選擇器
  - 方便 YouTube 更新時快速修改

- [x] **國際化數字解析**
  - 支援日文 (万, 億)
  - 支援韓文 (천, 만, 억)
  - 支援英文縮寫 (K, M, B)
  - 支援印度格式 (lakh, crore)
  - 支援泰文時間單位

- [x] **過濾統計系統 (FilterStats)**
  - 記錄每種規則的過濾數量
  - 主選單顯示過濾總數
  - 選項 8 查看詳細統計

### Phase 2: 穩定性優化 (v2.0.0-beta.2) ✅ 已完成

- [x] **效能優化**
  - 使用 `requestIdleCallback` 分批處理
  - 減少初始載入阻塞
  - 500ms 超時保證

- [x] **設定匯出/匯入**
  - JSON 格式匯出所有設定
  - 一鍵匯入還原設定
  - 自動複製到剪貼簿

### Phase 3: 進階功能 (v2.0.0-rc) ✅ 已完成

- [x] **Anti-Adblock 強化**
  - 更積極的 DOM 移除策略
  - 新增多種彈窗選擇器
  - 點擊所有可能的關閉按鈕

- [x] **播放頁推薦過濾**
  - 強化側邊欄支援 (ytd-compact-video-renderer)
  - 自動播放清單過濾 (ytd-compact-radio-renderer)
  - 播放清單面板 (ytd-playlist-panel-video-renderer)

---

## 📝 變更日誌

### v2.0.0-rc (2025-12-26)
- ✅ Phase 3 完成
- 🛡️ Anti-Adblock 強化
- 📺 播放頁推薦過濾支援

### v2.0.0-beta.2 (2025-12-26)
- ✅ Phase 2 完成
- ⚡ requestIdleCallback 效能優化
- 💾 設定匯出/匯入功能

### v2.0.0-beta.1 (2025-12-26)
- ✅ Phase 1 完成
- 🏗️ SELECTORS 集中管理架構
- 🌐 國際化數字/時間解析
- 📊 過濾統計系統

---

## ⚠️ 注意事項

1. Beta 版本可能不穩定，請謹慎使用
2. 報告問題請在 GitHub Issues 中標註 `[BETA]`
3. 穩定版本請使用 `main` 分支
