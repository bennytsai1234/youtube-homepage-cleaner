# Gemini CLI 核心行為準則 (Core Guidelines)

本檔案定義了 Gemini CLI 針對 `youtube-homepage-cleaner` 專案的核心操作規範。

---

## 第一章：互動協議與工作方法論

### 1.1 溝通規範

| 項目 | 規範 |
|------|------|
| **主要語言** | 繁體中文 (Traditional Chinese) |
| **程式碼註釋** | 繁體中文 (複雜邏輯) |
| **Commit Message** | English (Conventional Commits) |
| **文檔** | 雙語 (README 等公開文件) |

### 1.2 自主執行原則

- **連續執行**: 多步驟任務應自動連續完成，僅在錯誤或需人工決策時暫停。
- **增量交付**: 變更分解為最小邏輯單元，每個階段性成果都可獨立驗證。
- **主動驗證**: 完成變更後主動檢查 (build, lint, test 等)。

### 1.3 代碼完整性

| 原則 | 說明 |
|------|------|
| **尊重現狀** | 修改前必須理解既有邏輯 |
| **優先順序** | 可讀性 > 維護性 > 效能 (除非有特定效能需求) |
| **原子化提交** | 遵循 Conventional Commits (`feat:`, `fix:`, `chore:`) |

---

## 第二章：Git 工作流

### 2.1 分支策略

```
main ─────────────────────────────── 穩定發布版本
  │
  └─── beta ──────────────────────── 開發/測試
         │
         ├─── feature/xxx ────────── 功能分支
         └─── fix/xxx ────────────── 修復分支
```

### 2.2 發布流程

1. 在 `beta` 分支開發新功能
2. 完成測試後合併至 `main`
3. 在 `main` 打上版本 Tag (e.g., `v1.6.2`)
4. 推送: `git push origin main --tags`

### 2.3 Commit 規範

| Type | 用途 | 範例 |
|------|------|------|
| `feat:` | 新功能 | `feat: add Korean language support` |
| `fix:` | Bug 修復 | `fix: resolve CSS selector for new layout` |
| `perf:` | 效能優化 | `perf: optimize MutationObserver callback` |
| `refactor:` | 重構 | `refactor: extract Utils module` |
| `docs:` | 文檔 | `docs: update README installation guide` |
| `chore:` | 維護 | `chore: update metadata version` |

---

## 第三章：技術規範 (Userscript)

### 3.1 技術棧

| Category | Technology | Notes |
|----------|------------|-------|
| **Core** | JavaScript (ES6+) | 無需轉譯 |
| **Runtime** | Tampermonkey 5.0+ | 兼容 Violentmonkey |
| **Styling** | CSS3 | 使用 `:has()` |
| **Dependencies** | None | 零外部依賴 |

### 3.2 核心策略

#### 混合過濾

```
優先順序:
1. CSS 規則 (最高效能，靜態)
2. MutationObserver (動態內容)
3. 文字匹配 (備援)
```

#### 效能優化

- 使用 Debounce 機制優化 MutationObserver (150ms)
- 使用 `requestIdleCallback` 處理非關鍵任務
- 查詢應針對特定選擇器而非整個 document

#### 介面策略

- 設定選單採用瀏覽器原生互動 (Prompt/Alert)
- 不強制追求仿 YouTube 原生 UI
- 保持腳本輕量與低維護成本

### 3.3 程式碼規範

```javascript
// ✅ GOOD
const videoContainer = document.querySelector('#content');
if (videoContainer?.classList.contains('active')) {
    processVideo(videoContainer);
}

// ❌ BAD
const video_container = document.querySelector("#content")
if (video_container.classList.contains("active")) {
    process_video(video_container)
}
```

---

## 第四章：Agent 操作規範

### 4.1 指令執行

| 情況 | 處理方式 |
|------|---------|
| 指令有輸出 | 正常使用 `run_command` |
| 指令無輸出 | 使用 Shell Session + `send_command_input` |
| 長時間執行 | 設定適當 timeout |

### 4.2 檔案操作

- 使用絕對路徑
- 修改前先讀取確認內容
- 大型修改使用 `multi_replace_file_content`

### 4.3 錯誤處理

- 遇到錯誤時先分析原因
- 嘗試自動修復
- 無法解決時清楚說明問題並詢問用戶

---

## 第五章：專案記憶

### 5.1 已解決的問題

| 問題 | 解決方案 | 日期 |
|------|---------|------|
| Windows Git 中文亂碼 | 設定 `core.quotepath=false` | v1.4.0 |
| 日誌過多影響效能 | 精簡日誌輸出 | v1.4.0 |
| openspec.js 不存在 | 手動執行檔案操作 | v1.6.2 |

### 5.2 重要架構決策

參見 `docs/adr/` 目錄:
- ADR-001: CSS 優先過濾策略
- ADR-002: 零外部依賴原則
- ADR-003: 混合式 DOM 監控策略
- ADR-004: 集中式選擇器管理
- ADR-005: 原生 UI 優於自訂模態

---

## 第六章：OpenSpec 工作流

### 6.1 Proposal 流程

1. 執行 `/openspec-proposal`
2. 建立 `proposal.md`, `tasks.md`, `design.md` (選用)
3. 建立 spec deltas

### 6.2 Apply 流程

1. 執行 `/openspec-apply`
2. 依序完成 tasks
3. 勾選完成項目

### 6.3 Archive 流程

1. 執行 `/openspec-archive`
2. 移動 change 到 `archive/`
3. 更新 specs
