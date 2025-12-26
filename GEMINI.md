# Gemini CLI 核心行為準則 (Core Guidelines)

本檔案定義了 Gemini CLI 針對 `youtube-homepage-cleaner` 專案的核心操作規範。

---

### **第一章：互動協議與工作方法論**

*   **溝通語言**: 繁體中文 (Traditional Chinese)。
*   **自主執行**: 自動連續執行步驟，僅在錯誤時暫停。
*   **代碼完整性**:
    *   **原子化提交**: 遵循 Conventional Commits (e.g., `feat:`, `fix:`, `chore:`)。
    *   **增量交付**: 變更分解為最小邏輯單元。
*   **Git 工作流 (Git Flow)**:
    *   **`beta` 分支**: 用於開發、測試新功能。所有新功能必須先在此分支通過驗證。
    *   **`main` 分支**: 僅放穩定的發布版本。由 `beta` 合併而來。
    *   **發布流程**: 開發 -> `beta` 測試 -> 穩定後合併至 `main` -> 標上 Tag (e.g., `v1.6.0`)。

---

### **第二章：技術規範 (Userscript)**

*   **技術棧**: Pure JavaScript (ES6+), Tampermonkey API, CSS3.
*   **核心策略**:
    1.  **混合過濾**: 優先使用 CSS 隱藏，配合 MutationObserver 處理動態加載內容。
    2.  **效能優化**: 使用 Debounce (防抖) 機制優化 MutationObserver，避免頻繁觸發；查詢應針對特定選擇器以降低 DOM 操作成本。
    3.  **介面策略**: 設定選單採用瀏覽器原生互動 (Prompt/Alert) 以保持腳本輕量與低維護成本，不強制追求仿 YouTube 原生 UI。

---

### **第三章：Agent 操作規範**

*   **無輸出處理**: 若 `run_command` 無預期輸出，**強制**改用 `run_command` 啟動 Shell Session (如 `cmd`)，再以 `send_command_input` 發送指令。

---

### **第四章：專案記憶**

*   **Git 設定**: 已解決 Windows 環境下 Git 中文亂碼問題。
*   **日誌策略**: 保持日誌精簡，避免過度輸出影響效能 (v1.4.0+)。
