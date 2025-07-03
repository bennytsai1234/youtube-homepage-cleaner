// ==UserScript==
// @name         YouTube 首頁淨化大師 (v9.5 - 架構優化版)
// @namespace    http://tampermonkey.net/
// @version      9.5
// @description  終極佈局優化！採用「容器優先」處理架構與「塌縮式隱藏」策略，大幅提升效能與穩定性。一次性掃描容器，逐一應用規則，徹底解決殘留空白與重複處理問題，確保與YouTube原生腳本最高相容性。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v9.2) & Claude-3 (v9.5 Architecture)
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
        DEBUG_MODE: true, // true: 開啟詳細日誌, false: 只顯示啟動訊息

        // 低觀看數過濾器
        ENABLE_LOW_VIEW_FILTER: true,
        LOW_VIEW_THRESHOLD: 1000,

        // 定期巡邏掃描 (應對某些腳本延遲載入的內容)
        ENABLE_PERIODIC_SCAN: true,
        PERIODIC_SCAN_INTERVAL: 1500, // 毫秒
        MAX_PATROLS: 10, // 執行10次後停止，轉為純事件驅動

        // 要處理的頂層容器選擇器。這些是構成YouTube頁面網格或列表的基本單元。
        TOP_LEVEL_CONTAINER_SELECTOR: `
            ytd-rich-item-renderer,
            ytd-rich-section-renderer,
            ytd-video-renderer,
            ytd-compact-video-renderer,
            ytd-reel-shelf-renderer,
            ytd-ad-slot-renderer,
            ytd-statement-banner-renderer,
            ytd-promoted-sparkles-text-search-renderer
        `,

        // 規則一：特徵規則 (Signature Rules) - 根據特定標記或文字快速過濾
        signatureRules: [
            { name: '會員專屬內容', selector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]'},
            { name: 'Shorts 區塊', selector: 'ytd-rich-shelf-renderer #title, ytd-reel-shelf-renderer #title', textKeyword: /^Shorts$/i },
            { name: '新聞快報區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /新聞快報|Breaking news/i },
            { name: '為你推薦區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /為你推薦|For you/i },
            { name: '最新貼文區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /最新( YouTube )?貼文|Latest posts/i },
            { name: '音樂合輯/播放清單區塊', selector: 'ytd-rich-shelf-renderer #title, ytd-playlist-renderer #title', textKeyword: /合輯|Mixes|Playlist/i },
            { name: '頻道推薦區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /推薦頻道|Channels for you|Similar channels/i },
            { name: '各類廣告/促銷', selector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]' },
            { name: '頂部橫幅(聲明/資訊)', selector: 'ytd-statement-banner-renderer' },
            { name: '單一 Shorts 影片', selector: 'a#thumbnail[href*="/shorts/"]' }
        ],
    };

    // --- 腳本核心 (Script Core) ---

    const PROCESSED_MARKER_ATTR = 'data-yt-purifier-processed';
    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: '9.5', name: 'YouTube Purifier' }; }
    })();

    const logger = {
        log: (message) => CONFIG.DEBUG_MODE && console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #fd7e14;'),
        info: (message) => console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #17a2b8; font-weight: bold;'),
        success: (message) => console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #28a745;'),
    };

    const parseViewCount = (text) => {
        if (!text) return null;
        const textContent = text.toLowerCase();
        const numPart = parseFloat(textContent.replace(/,/g, ''));
        if (isNaN(numPart)) return null;

        const multipliers = { 'k': 1000, 'm': 1000000, '萬': 10000, '万': 10000 };
        for (const [char, multiplier] of Object.entries(multipliers)) {
            if (textContent.includes(char)) {
                return Math.floor(numPart * multiplier);
            }
        }
        return Math.floor(numPart);
    };

    // 規則二：功能性規則 (Functional Rules) - 需執行函式進行複雜判斷
    const functionalRules = [];
    if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
        functionalRules.push({
            name: `低觀看數影片 (< ${CONFIG.LOW_VIEW_THRESHOLD})`,
            // 這些是可能包含觀看次數的影片卡片類型
            targetSelector: `ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer`,
            condition: (container) => {
                // 如果影片有特殊標記(如 "新上傳")，則不處理
                const visibleBadge = container.querySelector('#channel-name ytd-badge-supported-renderer:not([hidden])');
                if (visibleBadge) return { shouldHide: false, isFinal: true }; // isFinal: true 代表這是最終決定，無需再檢查其他規則

                // 精準尋找觀看次數
                const metaSpans = container.querySelectorAll('#metadata-line .inline-metadata-item');
                let viewCountText = null;
                for (const span of metaSpans) {
                    const text = span.textContent || '';
                    if (text.includes('觀看') || text.toLowerCase().includes('view')) {
                        viewCountText = text;
                        break; // 找到就停止，避免匹配到其他不相關的 span
                    }
                }

                if (!viewCountText) return { shouldHide: false, isFinal: false }; // 沒有觀看次數資訊，可能還在載入，暫不處理

                const views = parseViewCount(viewCountText);
                if (views === null) return { shouldHide: false, isFinal: true }; // 無法解析，視為最終決定

                return { shouldHide: views < CONFIG.LOW_VIEW_THRESHOLD, isFinal: true };
            }
        });
    }

    const hideAndCollapseElement = (element, ruleName, source) => {
        if (element.style.height === '0px') return; // 已被處理，快速退出

        Object.assign(element.style, {
            display: 'block',
            height: '0',
            width: '0',
            margin: '0',
            padding: '0',
            border: '0',
            overflow: 'hidden',
            visibility: 'hidden',
        });
        element.setAttribute(PROCESSED_MARKER_ATTR, 'hidden');
        logger.log(`已隱藏 (${source}): "${ruleName}" (容器: <${element.tagName.toLowerCase()}>)`);
    };

    const markAsChecked = (element) => {
        if (!element.hasAttribute(PROCESSED_MARKER_ATTR)) {
            element.setAttribute(PROCESSED_MARKER_ATTR, 'checked');
        }
    };

    /**
     * 【核心處理函式 - Container-First 架構】
     * @param {NodeList} containers - 要處理的頂層容器元素列表
     * @param {string} source - 呼叫來源 ('initial', 'observer', 'periodic')
     */
    const processContainers = (containers, source) => {
        if (containers.length > 0) {
            logger.log(`發現 ${containers.length} 個新容器，來源: ${source}`);
        }

        containerLoop:
        for (const container of containers) {
            // 1. 檢查特徵規則 (Signature Rules)
            for (const rule of CONFIG.signatureRules) {
                // 在容器內部尋找特徵元素，或檢查容器本身是否是特徵
                const signatureEl = container.matches(rule.selector) ? container : container.querySelector(rule.selector);

                if (signatureEl) {
                    if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent?.trim() || '')) {
                        continue; // 文字不匹配，跳過此規則
                    }
                    hideAndCollapseElement(container, rule.name, source);
                    continue containerLoop; // 已隱藏，處理下一個容器
                }
            }

            // 2. 檢查功能性規則 (Functional Rules)
            for (const rule of functionalRules) {
                if (container.matches(rule.targetSelector)) {
                    const result = rule.condition(container);
                    if (result.shouldHide) {
                        hideAndCollapseElement(container, rule.name, source);
                        continue containerLoop; // 已隱藏，處理下一個容器
                    } else if (result.isFinal) {
                        markAsChecked(container);
                        continue containerLoop; // 標記為無需處理，處理下一個容器
                    }
                }
            }

            // 3. 如果所有規則都不匹配，標記為已檢查
            markAsChecked(container);
        }
    };

    const scanPage = (source = 'scan') => {
        const unprocessedSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR
            .split(',')
            .map(s => `${s.trim()}:not([${PROCESSED_MARKER_ATTR}])`)
            .join(', ');

        const elementsToProcess = document.querySelectorAll(unprocessedSelector);
        if (elementsToProcess.length > 0) {
            processContainers(elementsToProcess, source);
        }
    };

    const observer = new MutationObserver((mutations) => {
        // 使用 Set 避免重複處理同一個節點
        const addedNodes = new Set();
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addedNodes.add(node);
                    }
                }
            }
        }

        if (addedNodes.size > 0) {
            // 我們不需要直接處理 addedNodes，因為它們可能是零散的片段。
            // 重新掃描整個頁面中未處理的容器，這樣更可靠。
            scanPage('observer');
        }
    });

    const run = () => {
        logger.info(`v${SCRIPT_INFO.version} 初始化完畢，過濾系統已啟動。`);
        if (CONFIG.DEBUG_MODE) {
             logger.info(`除錯模式已開啟。`);
        }

        // 初次掃描
        scanPage('initial');

        // 啟動觀察者
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // 啟動定期巡邏
        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            let patrolCounter = 0;
            const patrolIntervalId = setInterval(() => {
                scanPage('periodic');
                patrolCounter++;
                if (patrolCounter >= CONFIG.MAX_PATROLS) {
                    clearInterval(patrolIntervalId);
                    logger.success(`初期巡邏任務完成，系統進入純即時監控模式。`);
                }
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            logger.info(`限時巡邏已開啟 (共執行 ${CONFIG.MAX_PATROLS} 次，每 ${CONFIG.PERIODIC_SCAN_INTERVAL / 1000} 秒一次)。`);
        }
    };

    // 等待 DOM 載入完成後執行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
