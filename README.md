# 🎯 YouTube 淨化大師

**YouTube 淨化大師** 一個為極致體驗而生的油猴（Tampermonkey）腳本，專注於提供一個 **高速、純粹、可自訂** 的 YouTube 瀏覽環境。

它不僅能掃除廣告、推薦區塊等視覺干擾，更具備強大的自訂過濾能力，讓您完全掌控自己的資訊流。

---
## 📌 腳本簡介

**YouTube 淨化大師 (Pantheon)** 是一款專為 YouTube 設計的高級內容過濾與行為優化腳本，具備強大而智能的影片過濾引擎與點擊行為控制。  
本腳本旨在為使用者打造一個**無廣告、無干擾、完全掌控的觀看體驗**。

---

## ✨ 主要功能與特色

### 🧼 內容過濾模組
自動隱藏以下干擾內容：
- ✅ 廣告、贊助商推廣、Premium 橫幅
- ✅ Shorts 區塊與單一 Shorts 項目
- ✅ 合輯 (Mix) 影片、自動播放串
- ✅ 新聞快報、貼文、社群區塊
- ✅ 會員專屬影片（可選擇開啟/關閉）
- ✅ 低觀看數的影片與直播（可調整閾值）

> 💡 預設「低觀看數過濾」會啟用，你可以在腳本功能表中一鍵切換！

---

### 🖱️ 智慧點擊優化（v25.0 重大升級）
- 🚀 支援「**懸停預覽播放**」與「**點擊開啟新分頁**」同時存在！
- 🧠 全域攔截 `pointerdown` 事件，精準判斷你是否點擊了預覽播放器或影片縮圖
- 🔗 自動在新分頁中開啟影片、Shorts 或播放清單，**避免 SPA 導航打斷瀏覽流程**

---

### 🛠️ 使用者設定
透過瀏覽器右上角的 Tampermonkey 功能表，可進行：
- ✅ 開啟 / 關閉「低觀看數過濾」
- ✅ 開啟 / 關閉「Debug 模式」（用於查看哪些內容被過濾）

---

## ⚡️ 安裝教學

只需兩個步驟，即可立即啟用：

### 1️⃣ 安裝使用者腳本管理器

請先在您的瀏覽器中安裝 **Tampermonkey**：

- [安裝於 Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [安裝於 Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
- [安裝於 Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

（其他管理器如 Violentmonkey 亦可支援）

### 2️⃣ 安裝本腳本

點擊下方連結，並在跳出的視窗中點擊「安裝」即可。

➡️ **[點我安裝「YouTube 淨化大師」](https://github.com/bennytsai1234/youtube-homepage-cleaner/raw/main/youtube-homepage-cleaner.user.js)** ⬅️


---

## 🤝 歡迎貢獻

如果您發現 BUG、有新功能建議或想優化程式碼，歡迎隨時提交 [Issues](https://github.com/bennytsai1234/youtube-homepage-cleaner/issues) 或發起 Pull Request。

---

## 🙏 特別致謝

- **Benny**：原創作者，為本專案奠定了堅實基礎。
- **AI Collaborators (Gemini, Claude, etc.)**：協助進行重構、優化與功能迭代。

---

## 📄 授權條款

本專案採用 [MIT License](LICENSE) 授權。
