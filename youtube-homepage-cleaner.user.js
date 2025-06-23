// ==UserScript==
// @name         YouTube 首頁淨化大師 (v8.0 - 最終架構升級版)
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  引入最終架構，採用向上追溯容器的策略，徹底清除被過濾元素的父層卡片，解決殘留空白問題。
// @author       Benny (v6.2) & Gemini (v8.0 Refactor)
// @match        https://www.youtube.com/*
// @grant        GM_info
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    // --- 設定區 ---
    const getScriptInfo = () => {
        try { return { version: GM_info.script.version || 'N/A', name: GM_info.script.name || 'YouTube Purifier' }; }
        catch (e) { return { version: 'N/A', name: 'YouTube Purifier' }; }
    };
    const SCRIPT_INFO = getScriptInfo();
    const processedElements = new WeakSet();

    // 定義所有可能的「最外層獨立卡片/區塊」的選擇器。這是我們要最終隱藏的目標。
    const TOP_LEVEL_CONTAINER_SELECTOR = `
        ytd-rich-item-renderer,
        ytd-rich-section-renderer,
        ytd-video-renderer,
        ytd-reel-shelf-renderer,
        ytd-ad-slot-renderer,
        ytd-compact-video-renderer
    `;

    /**
     * @typedef {Object} SignatureRule
     * @property {string} name - 規則名稱。
     * @property {string} signatureSelector - 用於識別的「特徵」元素選擇器。
     * @property {RegExp} [textKeyword=null] - (可選) 檢查特徵元素的 textContent 是否匹配。
     */
    /** @type {SignatureRule[]} */
    const signatureRules = [
        // 規則組 1: 會員內容
        {
            name: '會員影片',
            signatureSelector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]',
        },
        // 規則組 2: 帶有特定標題的區塊
        {
            name: '新聞快報',
            signatureSelector: '#title.ytd-rich-shelf-renderer, #title.ytd-reel-shelf-renderer',
            textKeyword: /新聞快報|Breaking news/i
        },
        {
            name: 'Shorts 區塊',
            signatureSelector: '#title.ytd-rich-shelf-renderer, #title.ytd-reel-shelf-renderer',
            textKeyword: /^Shorts$/i
        },
        {
            name: '為你推薦',
            signatureSelector: '#title.ytd-rich-shelf-renderer',
            textKeyword: /為你推薦|For you/i
        },
        {
            name: '最新貼文',
            signatureSelector: '#title.ytd-rich-shelf-renderer',
            textKeyword: /最新( YouTube )?貼文|Latest posts/i
        },
        {
            name: '音樂合輯',
            signatureSelector: '#title.ytd-rich-shelf-renderer, #title.ytd-playlist-renderer',
            textKeyword: /合輯|Mixes/i
        },
        // 規則組 3: 各類廣告和促銷
        {
            name: '橫幅廣告/促銷',
            signatureSelector: 'ytd-statement-banner-renderer',
        },
        {
            name: '其他廣告/促銷',
            signatureSelector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]',
        }
    ];

    // --- 核心邏輯 ---
    const hideElement = (element, ruleName) => {
        if (!element || processedElements.has(element)) return;

        // === v8.0 核心改動 ===
        // 向上追溯，找到真正的最外層容器並隱藏它
        const topLevelContainer = element.closest(TOP_LEVEL_CONTAINER_SELECTOR);
        const elementToHide = topLevelContainer || element; // 如果找不到，就隱藏元素本身

        if (processedElements.has(elementToHide)) return;

        elementToHide.style.display = 'none';
        processedElements.add(elementToHide);
        console.log(`[淨化大師 v${SCRIPT_INFO.version}] 已隱藏 "${ruleName}" (容器: ${elementToHide.tagName.toLowerCase()})`);
    };

    const processNode = (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        for (const rule of signatureRules) {
            const signatures = node.matches(rule.signatureSelector) ? [node] : node.querySelectorAll(rule.signatureSelector);
            if (signatures.length === 0) continue;

            signatures.forEach(signatureEl => {
                if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent || '')) {
                    return;
                }
                // 直接將找到的特徵元素傳遞給 hideElement，由它負責向上追溯
                hideElement(signatureEl, rule.name);
            });
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const addedNode of mutation.addedNodes) {
                    processNode(addedNode);
                }
            }
        }
    });

    const run = () => {
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始化...`, 'color: #28a745;');
        processNode(document.body);
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 監控中...`, 'color: #28a745; font-weight: bold;');
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
