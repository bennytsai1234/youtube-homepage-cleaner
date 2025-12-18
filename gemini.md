# Gemini CLI 核心行為準則 (Core Guidelines)

本檔案定義了 Gemini CLI 的核心操作規範、架構偏好與技術最佳實踐。此準則適用於所有 Android/Kotlin 專案開發，旨在確保代碼品質、一致性與使用者體驗。

---

### **第一章：互動協議與工作方法論 (Protocol & Methodology)**

*   **溝通語言**: 預設使用 **繁體中文 (Traditional Chinese)**。
*   **自主執行 (Autonomous Execution)**: 對於多步驟任務，應自動連續執行，僅在遇到致命錯誤或需人工決策時暫停。
*   **代碼完整性**: 
    *   **尊重現狀**: 修改前必須理解既有邏輯。
    *   **優先順序**: 可讀性 > 維護性 > 效能。
    *   **原子化提交**: 變更分解為最小邏輯單元，遵循 Conventional Commits (e.g., `feat:`, `fix:`, `chore:`)。
*   **增量交付**: 避免巨大變更，每個階段性成果都應可獨立驗證。

---

### **第二章：架構規範 (Architecture Standards)**

本規範基於 **Clean Architecture** 與 **Modularization** 原則。

*   **分層職責**:
    1.  **Domain Layer (Business Logic)**: 純 Kotlin，嚴禁依賴 Android SDK。定義 UseCase、Repository 介面與數據模型。
    2.  **Data Layer (Implementation)**: 提供數據來源實作 (API, DB, Preferences, File)。對外隱藏細節。
    3.  **UI Layer (Presentation)**: 採用 MVVM 與 Compose。透過 UseCase 與 Domain 互動，嚴禁直接依賴 Data Layer。採用單向數據流 (UDF)。
*   **依賴規則**: `UI -> Domain <- Data`。

---

### **第三章：技術最佳實踐 (Technical Excellence)**

*   **狀態韌性 (State Resilience)**: 
    *   **Process Death 防護**: 關鍵 UI 狀態必須使用 `rememberSaveable`。ViewModel 狀態必須使用 `SavedStateHandle` 持久化。
    *   **佈局適配**: 避免因尺寸變化重新創建狀態，確保互動不中斷。
*   **使用者體驗 (UX Excellence)**: 
    *   **智慧定位**: 列表首頁進入時應自動滾動至活躍項目。
    *   **容錯互動**: 自定義控制項應有吸附或智慧查找功能；所有拖動/長按須有視覺回饋。
    *   **誠實 UI**: 保證所有視覺控制項功能完備，避免欺騙預期。
    *   **優雅降級**: 圖片加載失敗顯示佔位符；無數據時顯示明確空狀態。
*   **效能優化 (Performance)**: 
    *   **後台優先**: 所有涉及大數據的邏輯必須移至 `.flowOn(Dispatchers.Default)` 執行。
    *   **狀態與佈局穩定**: UI State 標註 `@Immutable`；列表項目優先使用固定高度以減少測量成本。
    *   **圖片優化**: 指定 size 與 memoryCache，避免阻塞主線程。

---

### **第四章：Agent 操作規範 (Agent Operations)**

*   **無輸出處理 (No Output Handling) [CRITICAL]**:
    *   當發現 `run_command` 沒有預期輸出時，**強制**改用 `run_command` 啟動一個持續的 Shell Session (如 `cmd`)，接著使用 `send_command_input` 發送指令，以確保能獲取執行結果。

---
