// ==UserScript==
// @name         YouTube 首頁淨化大師 (v10.1 - 精準修正版)
// @namespace    http://tampermonkey.net/
// @version      10.1
// @description  v10.1: 精準修正豁免規則的適用範圍，解決「新聞快報」等區塊無法被正常隱藏的問題。根本性架構升級！引入基於優先級的「分級審查」規則引擎，徹底解決規則間的衝突問題 (如“會員影片”被“豁免規則”錯誤放行)，確保過濾邏輯的絕對準確與穩定。
// @author       Benny, Gemini, Claude-3 & GPT-4 (v8.1-v10.1)
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
        DEBUG_MODE: false,
        ENABLE_LOW_VIEW_FILTER: true,
        LOW_VIEW_THRESHOLD: 1000,
        ENABLE_PERIODIC_SCAN: true,
        PERIODIC_SCAN_INTERVAL: 750,
        MAX_PATROLS: 20,
        TOP_LEVEL_CONTAINER_SELECTOR: `
            ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-video-renderer,
            ytd-compact-video-renderer, ytd-reel-shelf-renderer, ytd-ad-slot-renderer,
            ytd-statement-banner-renderer, ytd-promoted-sparkles-text-search-renderer
        `,
    };

    // --- 腳本核心 (Script Core) ---

    const PROCESSED_ATTR = 'data-yt-purifier-processed';
    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: '10.1', name: 'YouTube Purifier' }; }
    })();

    const logger = {
        log: (message) => CONFIG.DEBUG_MODE && console.log(`[${SCRIPT_INFO.name}] ${message}`),
        info: (message) => console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #17a2b8; font-weight: bold;'),
        success: (message) => console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #28a745; font-style: italic;'),
        hide: (source, rule, container) => console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${source}): "${rule}" (容器: <${container.tagName.toLowerCase()}>)`, 'color: #fd7e14;'),
        exempt: (rule, container) => CONFIG.DEBUG_MODE && console.log(`[${SCRIPT_INFO.name}] 豁免: "${rule}" (容器: <${container.tagName.toLowerCase()}>)`)
    };

    const parseViewCount = (text) => {
        if (!text) return null;
        const cleanedText = text.toLowerCase().replace(/觀看次數：|次|,|views/g, '').trim();
        const num = parseFloat(cleanedText);
        if (isNaN(num)) return null;
        if (cleanedText.includes('萬') || cleanedText.includes('万')) return Math.floor(num * 10000);
        if (cleanedText.includes('k')) return Math.floor(num * 1000);
        if (cleanedText.includes('m')) return Math.floor(num * 1000000);
        return Math.floor(num);
    };

    // v10.1 核心改動: 分級審查規則引擎
    const RULES = {
        // 第一級：符合任一條件，立刻隱藏，終止後續所有檢查。
        MUST_HIDE: [
            { name: '各類廣告/促銷', selector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]' },
            { name: '會員專屬內容', selector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]' },
            { name: '頂部橫幅(聲明/資訊)', selector: 'ytd-statement-banner-renderer' },
            { name: '單一 Shorts 影片', selector: 'a#thumbnail[href*="/shorts/"]' },
            { name: 'Shorts 區塊', selector: '#title', textKeyword: /^Shorts$/i, scope: 'ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer' },
            { name: '新聞快報區塊', selector: '#title', textKeyword: /新聞快報|Breaking news/i, scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer' },
            { name: '最新貼文區塊', selector: '#title', textKeyword: /最新( YouTube )?貼文|Latest (community )?posts/i, scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer' },
            { name: '音樂合輯/播放清單區塊', selector: '#title', textKeyword: /合輯|Mixes|Playlist/i, scope: 'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '頻道推薦區塊', selector: '#title', textKeyword: /推薦頻道|Channels for you|Similar channels/i, scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer' },
        ],
        // 第二級：若未被隱藏，則檢查豁免條件。若符合，標記為安全並終止。
        MUST_KEEP: [
            {
                name: '豁免：認證頻道',
                selector: '#channel-name ytd-badge-supported-renderer:not([hidden])',
                // v10.1 修正：將豁免範圍限定在影片本身，避免其父層容器 (如「新聞快報」區塊) 被錯誤豁免。
                scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer'
            },
        ],
        // 第三級：僅對未被隱藏且未被豁免的元素執行。
        CONDITIONAL_HIDE: CONFIG.ENABLE_LOW_VIEW_FILTER ? [
            {
                name: `低觀看數影片 (< ${CONFIG.LOW_VIEW_THRESHOLD})`,
                scope: `ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer`,
                check: (container) => {
                    let viewCountText = null;
                    for (const span of container.querySelectorAll('#metadata-line .inline-metadata-item')) {
                        const text = span.textContent || '';
                        if (text.includes('觀看') || text.toLowerCase().includes('view')) {
                            viewCountText = text; break;
                        }
                    }
                    if (!viewCountText) return { hide: false, final: false };
                    const views = parseViewCount(viewCountText);
                    if (views === null) return { hide: false, final: true };
                    return { hide: views < CONFIG.LOW_VIEW_THRESHOLD, final: true };
                }
            }
        ] : [],
    };

    const hideElement = (element, ruleName, source) => {
        if (element.hasAttribute(PROCESSED_ATTR)) return;
        element.style.display = 'none';
        element.setAttribute(PROCESSED_ATTR, 'hidden');
        logger.hide(source, ruleName, element);
    };

    const markAsChecked = (element) => {
        if (!element.hasAttribute(PROCESSED_ATTR)) {
            element.setAttribute(PROCESSED_ATTR, 'checked');
        }
    };

    const processContainer = (container, source) => {
        if (container.hasAttribute(PROCESSED_ATTR)) return;

        // --- 第一級審查 (MUST_HIDE) ---
        for (const rule of RULES.MUST_HIDE) {
            if (rule.scope && !container.matches(rule.scope)) continue;

            const element = container.matches(rule.selector) ? container : container.querySelector(rule.selector);
            // v10.1 優化：合併判斷邏輯，更簡潔穩健
            if (element && (!rule.textKeyword || rule.textKeyword.test(element.textContent?.trim() ?? ''))) {
                hideElement(container, rule.name, source);
                return; // 命中，終止處理
            }
        }

        // --- 第二級審查 (MUST_KEEP) ---
        for (const rule of RULES.MUST_KEEP) {
            // v10.1 修正：增加 scope 檢查，確保豁免規則只作用於指定的容器類型。
            if (rule.scope && !container.matches(rule.scope)) continue;

            if (container.querySelector(rule.selector)) {
                markAsChecked(container);
                logger.exempt(rule.name, container);
                return; // 豁免，終止處理
            }
        }

        // --- 第三級審查 (CONDITIONAL_HIDE) ---
        let isFinalDecisionMade = false;
        for (const rule of RULES.CONDITIONAL_HIDE) {
            if (rule.scope && !container.matches(rule.scope)) continue;

            const result = rule.check(container);
            if (result.hide) {
                hideElement(container, rule.name, source);
                return; // 命中，終止處理
            }
            if (result.final) {
                isFinalDecisionMade = true;
                break; // 做出不隱藏的最終決定，跳出本級審查
            }
        }

        // 如果第三級審查做出了最終決定（但不是隱藏），或沒有任何條件規則，則標記為安全
        if (isFinalDecisionMade || RULES.CONDITIONAL_HIDE.length === 0) {
            markAsChecked(container);
        }
    };

    const scanPage = (source = 'scan') => {
        const unprocessedSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR
            .split(',').map(s => `${s.trim()}:not([${PROCESSED_ATTR}])`).join(', ');
        const elementsToProcess = document.querySelectorAll(unprocessedSelector);
        if (elementsToProcess.length > 0) {
            for (const element of elementsToProcess) {
                processContainer(element, source);
            }
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // 檢查新增的節點本身是否為目標容器
                    if (addedNode.matches(CONFIG.TOP_LEVEL_CONTAINER_SELECTOR)) {
                        processContainer(addedNode, 'observer');
                    }
                    // 檢查新增的節點內部是否包含目標容器
                    const containers = addedNode.querySelectorAll(CONFIG.TOP_LEVEL_CONTAINER_SELECTOR);
                    for (const container of containers) {
                       processContainer(container, 'observer');
                    }
                }
            }
        }
    });

    const run = () => {
        logger.info(`v${SCRIPT_INFO.version} 初始化完畢，過濾系統已啟動。`);

        scanPage('initial');
        observer.observe(document.documentElement, { childList: true, subtree: true });

        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            let patrolCounter = 0;
            const patrolIntervalId = setInterval(() => {
                patrolCounter++;
                if (patrolCounter > CONFIG.MAX_PATROLS) {
                    clearInterval(patrolIntervalId);
                    logger.success(`初期巡邏任務完成，系統進入純即時監控模式。`);
                    return;
                }
                scanPage(`periodic-${patrolCounter}`);
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            logger.info(`限時巡邏已開啟 (共執行 ${CONFIG.MAX_PATROLS} 次)。`);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
