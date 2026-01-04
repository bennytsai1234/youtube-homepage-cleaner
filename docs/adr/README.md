# Architecture Decision Records (ADRs)

本目錄包含專案的架構決策記錄。每個 ADR 記錄了一個重要的技術決策、其背景和後果。

This directory contains the Architecture Decision Records for this project. Each ADR documents a significant technical decision, its context, and consequences.

---

## 📋 ADR 索引 | ADR Index

| ID | 標題 | 狀態 | 日期 |
|----|------|------|------|
| [ADR-001](./0001-css-first-filtering.md) | CSS 優先過濾策略 | ✅ Accepted | 2025-11-01 |
| [ADR-002](./0002-no-external-dependencies.md) | 零外部依賴原則 | ✅ Accepted | 2025-11-01 |
| [ADR-003](./0003-hybrid-dom-observer-strategy.md) | 混合式 DOM 監控策略 | ✅ Accepted | 2025-11-01 |
| [ADR-004](./0004-centralized-selector-management.md) | 集中式選擇器管理 | ✅ Accepted | 2025-12-01 |
| [ADR-005](./0005-native-ui-over-custom-modal.md) | 原生 UI 優於自訂模態 | ✅ Accepted | 2025-12-01 |

---

## 📝 如何新增 ADR | How to Add an ADR

1. 建立新檔案: `XXXX-kebab-case-title.md`
2. 使用 [ADR 模板](./template.md)
3. 更新上方索引

---

## 📚 什麼是 ADR? | What is an ADR?

Architecture Decision Record 是記錄重要架構決策的簡短文件。它包含：

- **Context**: 做決策的背景和條件
- **Decision**: 具體的決策內容
- **Consequences**: 決策的正面和負面後果

更多資訊: [ADR GitHub Organization](https://adr.github.io/)
