// ==UserScript==
// @name         YouTube 首頁淨化大師 (v8.5 - 巡邏增強版)
// @namespace    http://tampermonkey.net/
// @version      8.5
// @description  為解決偶發性攔截失敗問題，引入「定時巡邏掃描」機制作為第三道防線，定期檢查並清除所有漏網之魚，顯著提升過濾的穩定性與可靠性。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v8.5 Refinement)
// @match        https://www.youtube.com/*
// @grant        GM_info
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    // --- 設定區 (Configuration Area) ---
    const CONFIG = {
        // [v8.5 新增] 是否啟用定時巡邏掃描。這能有效解決因渲染時機問題導致的偶發性攔截失敗。
        ENABLE_PERIODIC_SCAN: true,
        // [v8.5 新增] 巡邏掃描的時間間隔（毫秒）。1500ms = 1.5秒。
        PERIODIC_SCAN_INTERVAL: 1500,

        TOP_LEVEL_CONTAINER_SELECTOR: `
            ytd-rich-item-renderer,
            ytd-rich-section-renderer,
            ytd-video-renderer,
            ytd-compact-video-renderer,
            ytd-reel-shelf-renderer,
            ytd-ad-slot-renderer,
            ytd-statement-banner-renderer
        `,
        signatureRules: [
            // ... 規則內容與 v8.4 相同，此處省略以保持簡潔 ...
            // 規則組 1: 會員內容
            {
                name: '會員專屬內容',
                signatureSelector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]',
            },
            // 規則組 2: 區塊標題
            {
                name: 'Shorts 區塊',
                signatureSelector: 'ytd-rich-shelf-renderer #title, ytd-reel-shelf-renderer #title',
                textKeyword: /^Shorts$/i
            },
            {
                name: '新聞快報區塊',
                signatureSelector: 'ytd-rich-shelf-renderer #title',
                textKeyword: /新聞快報|Breaking news/i
            },
            {
                name: '為你推薦區塊',
                signatureSelector: 'ytd-rich-shelf-renderer #title',
                textKeyword: /為你推薦|For you/i
            },
            {
                name: '最新貼文區塊',
                signatureSelector: 'ytd-rich-shelf-renderer #title',
                textKeyword: /最新( YouTube )?貼文|Latest posts/i
            },
            {
                name: '音樂合輯/播放清單區塊',
                signatureSelector: 'ytd-rich-shelf-renderer #title, ytd-playlist-renderer #title',
                textKeyword: /合輯|Mixes|Playlist/i
            },
            {
                name: '頻道推薦區塊',
                signatureSelector: 'ytd-rich-shelf-renderer #title',
                textKeyword: /推薦頻道|Channels for you|Similar channels/i
            },
            // 規則組 3: 廣告/促銷
            {
                name: '各類廣告/促銷',
                signatureSelector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]',
            },
            {
                name: '頂部橫幅(聲明/資訊)',
                signatureSelector: 'ytd-statement-banner-renderer',
            },
            // 規則組 4: 連結特徵
            {
                name: '單一 Shorts 影片',
                signatureSelector: 'a#thumbnail[href*="/shorts/"]',
            }
        ]
    };

    // --- 核心邏輯 (Core Logic) ---

    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: 'N/A', name: 'YouTube Purifier' }; }
    })();

    const processedElements = new WeakSet();

    const formattedContainerSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR
        .split('\n')
        .map(line => line.replace(/\/\*.*?\*\//g, '').replace(/,/g, '').trim())
        .filter(Boolean)
        .join(', ');

    const hideElementAndContainer = (element, ruleName, source = 'observer') => {
        if (!element || processedElements.has(element)) {
            return;
        }
        const topLevelContainer = element.closest(formattedContainerSelector);
        const elementToHide = topLevelContainer || element;
        if (processedElements.has(elementToHide)) {
            return;
        }

        elementToHide.style.display = 'none';
        processedElements.add(elementToHide);
        processedElements.add(element);

        const logSource = source === 'periodic' ? '巡邏' : '即時';
        console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${logSource}): "${ruleName}" (容器: <${elementToHide.tagName.toLowerCase()}>)`, 'color: #fd7e14;');
    };

    const processNode = (node, source = 'observer') => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }
        for (const rule of CONFIG.signatureRules) {
            const signatureElements = node.matches(rule.signatureSelector)
                ? [node]
                : Array.from(node.querySelectorAll(rule.signatureSelector));

            if (signatureElements.length > 0) {
                 for (const signatureEl of signatureElements) {
                    if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent?.trim() || '')) {
                        continue;
                    }
                    hideElementAndContainer(signatureEl, rule.name, source);
                }
            }
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const addedNode of mutation.addedNodes) {
                    processNode(addedNode, 'observer'); // 來源是即時監控
                }
            }
        }
    });

    const run = () => {
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始化完畢，三道防線已啟動：`, 'color: #17a2b8; font-weight: bold;');
        
        // --- 第一道防線：立即掃描已存在內容 ---
        console.log('%c  1. [立即掃描] 已完成對現有內容的初步淨化。', 'color: #17a2b8;');
        processNode(document.body, 'initial');
        
        // --- 第二道防線：啟動動態監控 ---
        console.log('%c  2. [即時監控] MutationObserver 已啟動，監控後續新增內容。', 'color: #17a2b8;');
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        
        // --- 第三道防線：啟動定時巡邏 ---
        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            setInterval(() => {
                processNode(document.body, 'periodic'); // 來源是巡邏掃描
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            console.log(`%c  3. [定時巡邏] 安全巡邏機制已啟動，每 ${CONFIG.PERIODIC_SCAN_INTERVAL / 1000} 秒檢查一次漏網之魚。`, 'color: #17a2b8;');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
