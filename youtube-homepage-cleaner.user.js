// ==UserScript==
// @name         YouTube 首頁淨化大師 (v10.2-beta - 全頁重掃實驗版)
// @namespace    http://tampermonkey.net/
// @version      10.2-beta
// @description  【實驗性版本，可能導致效能問題】此版本將週期性掃描改為重新掃描所有頁面元素，而非僅處理新元素。
// @author       Benny, Gemini, Claude-3 & GPT-4 (v8.1-v10.2)
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
        catch (e) { return { version: '10.2-beta', name: 'YouTube Purifier' }; }
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

    const RULES = {
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
        MUST_KEEP: [
            {
                name: '豁免：認證頻道',
                selector: '#channel-name ytd-badge-supported-renderer:not([hidden])',
                scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer'
            },
        ],
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
        // 【注意】這裡的檢查依然保留，是為了避免在控制台重複輸出已隱藏的日誌
        if (element.getAttribute(PROCESSED_ATTR) === 'hidden') return;
        element.style.display = 'none';
        element.setAttribute(PROCESSED_ATTR, 'hidden');
        logger.hide(source, ruleName, element);
    };

    const markAsChecked = (element) => {
        if (element.getAttribute(PROCESSED_ATTR) === 'checked') return;
        element.setAttribute(PROCESSED_ATTR, 'checked');
    };

    const processContainer = (container, source) => {
        // 【v10.2 變更】移除此處的 return，強制重新處理所有元素
        // if (container.hasAttribute(PROCESSED_ATTR)) return;

        // --- 第一級審查 (MUST_HIDE) ---
        for (const rule of RULES.MUST_HIDE) {
            if (rule.scope && !container.matches(rule.scope)) continue;
            const element = container.matches(rule.selector) ? container : container.querySelector(rule.selector);
            if (element && (!rule.textKeyword || rule.textKeyword.test(element.textContent?.trim() ?? ''))) {
                hideElement(container, rule.name, source);
                return;
            }
        }

        // --- 第二級審查 (MUST_KEEP) ---
        for (const rule of RULES.MUST_KEEP) {
            if (rule.scope && !container.matches(rule.scope)) continue;
            if (container.querySelector(rule.selector)) {
                markAsChecked(container);
                logger.exempt(rule.name, container);
                return;
            }
        }

        // --- 第三級審查 (CONDITIONAL_HIDE) ---
        let isFinalDecisionMade = false;
        for (const rule of RULES.CONDITIONAL_HIDE) {
            if (rule.scope && !container.matches(rule.scope)) continue;
            const result = rule.check(container);
            if (result.hide) {
                hideElement(container, rule.name, source);
                return;
            }
            if (result.final) {
                isFinalDecisionMade = true;
                break;
            }
        }

        if (isFinalDecisionMade || RULES.CONDITIONAL_HIDE.length === 0) {
            markAsChecked(container);
        }
    };

    const scanPage = (source = 'scan') => {
        // 【v10.2 變更】移除選擇器中的 :not([${PROCESSED_ATTR}])，使其掃描所有元素
        const elementsToProcess = document.querySelectorAll(CONFIG.TOP_LEVEL_CONTAINER_SELECTOR);
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
                    if (addedNode.matches(CONFIG.TOP_LEVEL_CONTAINER_SELECTOR)) {
                        processContainer(addedNode, 'observer');
                    }
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
                scanPage(`periodic-rescan-${patrolCounter}`);
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
