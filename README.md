<div align="center">

# 🎯 YouTube Cleaner - Block Shorts, Ads & Clutter

### 🚫 Hide Shorts · 🔇 Block Ads · 🧹 Filter Clutter · ⚡ High Performance

**隱藏 Shorts、廣告與雜訊，讓 YouTube 回歸純淨**

[![GitHub Stars](https://img.shields.io/github/stars/bennytsai1234/youtube-homepage-cleaner?style=for-the-badge&logo=github&color=gold)](https://github.com/bennytsai1234/youtube-homepage-cleaner/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/bennytsai1234/youtube-homepage-cleaner?style=for-the-badge&logo=github&color=blue)](https://github.com/bennytsai1234/youtube-homepage-cleaner/network/members)
[![License](https://img.shields.io/github/license/bennytsai1234/youtube-homepage-cleaner?style=for-the-badge&color=green)](LICENSE)
[![Version](https://img.shields.io/badge/version-v1.6.0-orange?style=for-the-badge)](https://github.com/bennytsai1234/youtube-homepage-cleaner/releases)

[📥 **一鍵安裝**](#-安裝教學) · [✨ **功能特色**](#-主要功能與特色) · [📖 **更新日誌**](#-版本紀錄) · [🐛 **問題回報**](https://github.com/bennytsai1234/youtube-homepage-cleaner/issues)

---

### ⭐ 覺得好用嗎？幫我點顆星星吧！

[![Star This Project](https://img.shields.io/badge/⭐_Star_This_Project-支持開發者-yellow?style=for-the-badge&logo=github)](https://github.com/bennytsai1234/youtube-homepage-cleaner)

</div>

---

## 🌟 為什麼選擇這個腳本？

| 😤 使用前 | 😊 使用後 |
|:---:|:---:|
| 首頁充斥廣告與推廣 | ✅ 純淨的影片列表 |
| Shorts 佔據大量版面 | ✅ 完全隱藏 Shorts |
| 低品質內容干擾 | ✅ 智慧過濾低熱度影片 |
| 點擊跳轉中斷瀏覽 | ✅ 全部新分頁開啟 |
| Anti-Adblock 彈窗騷擾 | ✅ 自動攔截處理 |

> 🎉 **超過 15+ 種過濾規則**，所有功能都可以**一鍵開關**，完全由你掌控！

---

## ✨ 主要功能與特色

### 🧼 強大的內容過濾引擎
腳本會自動並精準地移除頁面上的各種干擾元素，您可以透過選單獨立開關每一條規則：

| 類別 | 過濾內容 |
|:---|:---|
| 🚫 **廣告與推廣** | 影片廣告、首頁橫幅、贊助商內容、Premium 推廣、問卷調查 |
| 📱 **Shorts** | 首頁 Shorts 區塊、搜尋結果 Shorts、Shorts Grid |
| 🎬 **推薦干擾** | 合輯 (Mix)、新聞快報、貼文、電影推薦、YouTube 精選、熱門遊戲 |
| 📑 **播放清單** | 智慧隱藏首頁推薦播放清單，但**保留**個人與頻道頁面播放清單 |
| 👑 **特殊內容** | 會員專屬影片 |
| 📉 **低熱度內容** | 自動過濾低觀看數影片 (**閾值可自訂**)，包含 **4 小時豁免期**保護新影片 |

---

### 🖱️ 全方位點擊優化
告別 YouTube 的頁內跳轉（SPA）機制，回歸最直覺的多分頁瀏覽體驗：

- 🚀 **一律在新分頁開啟**: 影片、Shorts、播放清單、頻道連結
- 🧠 **範圍覆蓋完整**: 首頁、搜尋結果、影片頁面下方作者區塊
- 🔗 **流程不中斷**: 探索新內容不會打斷當前頁面

---

### 🌐 國際化支援 (i18n)
完整支援多語言介面：

| 🇹🇼 繁體中文 | 🇨🇳 简体中文 | 🇺🇸 English | 🇯🇵 日本語 |
|:---:|:---:|:---:|:---:|

自動偵測語系，數字單位也會自動換算 (如 1.2萬、50K、1.2万)！

---

### ⚙️ 高度可自訂的選單
無需修改任何程式碼！所有功能均可透過 Tampermonkey 選單即時設定：

- ✅ **一鍵開關**：所有過濾規則均可獨立啟用或停用
- ✅ **低觀看數過濾**：自由開關，並可自訂閾值
- ✅ **進階過濾**：關鍵字黑名單、頻道黑名單、影片長度限制
- ✅ **設定匯出/匯入**：換電腦或重裝不用怕，設定一鍵備份
- ✅ **過濾統計**：可視化統計面板，清楚知道幫您擋掉了多少內容
- ✅ **Debug 模式**：開啟後可在控制台查看詳細的過濾日誌
- ✅ **一鍵重設**：隨時可以恢復為預設值

---

## 🔄 舊用戶注意

> 💡 **原「YouTube 淨化大師」用戶**：這是同一個腳本，只是改了名字！
>
> **不需要重新安裝**，Tampermonkey 會自動更新，你的設定也會完整保留。

---

## ⚡️ 安裝教學

只需兩個步驟，即可立即啟用：

### 1️⃣ 安裝使用者腳本管理器
請先在您的瀏覽器中安裝 **Tampermonkey** (或其他相容的管理器)：

| 瀏覽器 | 安裝連結 |
|:---|:---|
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=flat-square&logo=googlechrome&logoColor=white) | [安裝 Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=flat-square&logo=firefox&logoColor=white) | [安裝 Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/) |
| ![Edge](https://img.shields.io/badge/Edge-0078D7?style=flat-square&logo=microsoftedge&logoColor=white) | [安裝 Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |

### 2️⃣ 安裝本腳本

<div align="center">

### 👇 點擊下方按鈕立即安裝 👇

[![Install Script](https://img.shields.io/badge/📥_立即安裝_YouTube_淨化大師-安裝腳本-success?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/bennytsai1234/youtube-homepage-cleaner/main/youtube-homepage-cleaner.user.js)

</div>

> 💡 **提示**：如果您之前是從 GreasyFork 安裝的，建議重新安裝一次以確保能收到最即時的更新。

---

## 📋 版本紀錄

### 🆕 最新版本: v1.6.0 (2025-12-26)

<details>
<summary><b>📦 v1.6.0 重大更新</b></summary>

- 🚀 **全新架構**: 代碼完全重寫，導入模組化設計，穩定性與擴充性大幅提升
- ⚡ **極致效能**: 導入 `requestIdleCallback` 與智慧防抖技術
- 🌐 **國際化支援 (i18n)**: 完整支援繁中、简中、English、日本語
- 📊 **過濾統計**: 新增可視化統計面板
- 💾 **設定匯出/匯入**: 設定一鍵備份
- 🛡️ **Anti-Adblock 2.0**: 全新白名單機制，精準攔截

</details>

<details>
<summary><b>📦 v1.5.7</b></summary>

- 🆕 **支援新版 YouTube 佈局**: 完整支援 `yt-lockup-view-model` 結構
- 📊 更新 metadata 解析器
- ⏱️ 更新時長解析器

</details>

<details>
<summary><b>📦 v1.5.6</b></summary>

- 🔧 **完整還原 v1.4.0**: 補回所有遺漏功能

</details>

<details>
<summary><b>📦 v1.5.2</b></summary>

- ⚡ **效能與穩定性大幅優化**: 深度重構核心引擎
- 🛡️ **強化反偵測機制**

</details>

---

## 🤝 貢獻與支持

<div align="center">

### 💖 喜歡這個專案嗎？

[![Star History Chart](https://img.shields.io/badge/⭐_給我一顆星星-支持開發-yellow?style=for-the-badge&logo=github)](https://github.com/bennytsai1234/youtube-homepage-cleaner)

**你的星星是我持續更新的動力！**

</div>

如果您發現 BUG、有新功能建議或想優化程式碼：

- 🐛 [回報問題 (Issues)](https://github.com/bennytsai1234/youtube-homepage-cleaner/issues)
- 🔧 [發起 Pull Request](https://github.com/bennytsai1234/youtube-homepage-cleaner/pulls)
- 💬 歡迎在 Issues 討論任何想法！

---

## ⚠️ 已知問題

> **介面變動**: YouTube 經常進行 A/B 測試。如果過濾功能突然失效，可能是 YouTube 修改了前端代碼結構。遇到這種情況，請 [建立 Issue](https://github.com/bennytsai1234/youtube-homepage-cleaner/issues/new) 回報，我會盡快跟進！

---

## 🙏 特別致謝

- **Benny** - 原創作者，為本專案奠定了堅實基礎
- **AI Collaborators** (Gemini, Claude, etc.) - 協助進行重構、優化與功能迭代

---

## 📄 授權條款

本專案採用 [MIT License](LICENSE) 授權。

---

<div align="center">

**Made with ❤️ by [Benny](https://github.com/bennytsai1234)**

[![GitHub](https://img.shields.io/badge/GitHub-bennytsai1234-181717?style=flat-square&logo=github)](https://github.com/bennytsai1234)

</div>
